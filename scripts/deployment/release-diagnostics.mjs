import { readFileSync, openSync, closeSync, fstatSync, readSync, constants as F } from 'node:fs';
import { fileURLToPath } from 'node:url';

// No import of release.mjs: its CLI imports this helper, including on the host.
// Only this exact, adjacent public source may contribute numeric locations.
const releaseUrl = new URL('./release.mjs', import.meta.url);
const releaseLocations = [releaseUrl.href, fileURLToPath(releaseUrl)];
const releaseLines = readFileSync(releaseUrl, 'utf8').split(/\r?\n/u);
export const publicationStages = Object.freeze(['GUARD', 'CONFIGURATION', 'APPROVED_TEST_CLEANUP', 'CHECK_EXISTING_WEB', 'CHECK_EXISTING_API',
  'REGISTRY_LOGIN', 'IMAGE_BUILD', 'LABEL_WEB', 'LABEL_API', 'PUSH_WEB', 'PUSH_API', 'DIGEST_WEB', 'DIGEST_API',
  'VERIFY_WEB', 'VERIFY_API', 'MANIFEST', 'COMPLETE']);
const classes = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'URIError', 'EvalError', 'AggregateError', 'AbortError', 'TimeoutError']);
const causeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_STATE',
  'RELEASE_DIAGNOSTIC_CONFIGURATION_INVALID']);
const property = (value, key) => { try { return value?.[key]; } catch { return undefined; } };

export const imageBuildFailureCodes = Object.freeze(['IMAGE_SOURCE_OR_PLATFORM_INVALID', 'IMAGE_SOURCE_URL_INVALID',
  'IMAGE_INPUTS_MUST_BE_COMMITTED', 'IMAGE_GIT_COMMAND_FAILED', 'IMAGE_BUILD_START_FAILED', 'IMAGE_WEB_BUILD_FAILED', 'IMAGE_API_BUILD_FAILED',
  'IMAGE_IDENTITY_INVALID', 'IMAGE_COMMIT_LABEL_INVALID', 'IMAGE_SOURCE_LABEL_INVALID', 'IMAGE_VALIDATION_FAILED',
  'IMAGE_INSPECTION_FAILED', 'IMAGE_OUTPUT_FAILED', 'IMAGE_BUILD_FAILED']);
export const imageBuildCauses = Object.freeze(['DOCKER_HUB_RATE_LIMIT', 'REGISTRY_AUTHORIZATION_FAILED', 'REGISTRY_MANIFEST_UNAVAILABLE',
  'NETWORK_TIMEOUT', 'DNS_LOOKUP_FAILED', 'NPM_LOCK_MISMATCH', 'NPM_PACKAGE_UNAVAILABLE', 'COMPILATION_FAILED',
  'MAVEN_DEPENDENCY_RESOLUTION_FAILED', 'DISK_FULL', 'OUT_OF_MEMORY', 'BUILDX_UNAVAILABLE', 'DOCKER_DAEMON_UNAVAILABLE',
  'APT_PACKAGE_UNAVAILABLE', 'TLS_CERTIFICATE_FAILED', 'GIT_REPOSITORY_UNAVAILABLE', 'GIT_OWNERSHIP_REJECTED']);
const imageSpawnCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EAGAIN', 'ENOSPC', 'ETIMEDOUT']);
const imageSignals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);
const imagePhases = new Set(['VALIDATION', 'BUILD', 'INSPECTION', 'OUTPUT']);

/** Pattern observations only: no log line, capture, URL, package name or command is returned. */
export function classifyImageBuildLog(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024) return [];
  const checks = [
    /toomanyrequests:\s*(?:You have reached your (?:unauthenticated )?pull rate limit|Rate exceeded)/iu,
    /failed to authorize:[^\r\n]*(?:401 Unauthorized|403 Forbidden)|unauthorized: authentication required/iu,
    /failed to resolve source metadata[^\r\n]*not found|manifest unknown: manifest unknown/iu,
    /i\/o timeout|TLS handshake timeout|context deadline exceeded|net\/http: request canceled/iu,
    /no such host|temporary failure in name resolution|\bEAI_AGAIN\b/iu,
    /npm (?:error|ERR!) [^\r\n]*npm ci[^\r\n]*can only install packages|npm (?:error|ERR!) (?:Missing:|Invalid:)[^\r\n]*lock file/iu,
    /npm (?:error|ERR!) code (?:E404|ETARGET)\b/iu,
    /Failed to compile\.|\bType error:|\[ERROR\] COMPILATION ERROR/iu,
    /Could not resolve dependencies for project/iu,
    /no space left on device/iu,
    /JavaScript heap out of memory|cannot allocate memory|OutOfMemoryError/iu,
    /docker: 'buildx' is not a docker command|BuildKit is enabled but the buildx component is missing or broken/iu,
    /Cannot connect to the Docker daemon/iu,
    /E: Version '[^'\r\n]{1,200}' for '[^'\r\n]{1,200}' was not found/iu,
    /x509: certificate (?:signed by unknown authority|has expired|is valid for)/iu,
    /fatal: not a git repository/iu,
    /fatal: detected dubious ownership in repository/iu,
  ];
  return imageBuildCauses.filter((_cause, index) => checks[index].test(value));
}

/** Validate a child-produced diagnostic against this exact invocation before publication. */
export function safeImageBuildDiagnostic(value, expectedCommit) {
  try {
    const keys = ['schemaVersion', 'sourceCommit', 'result', 'service', 'phase', 'failureCode', 'exitCode', 'signal', 'spawnCode', 'logReadStatus', 'observedCauses'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).toSorted().join(',') !== keys.toSorted().join(',')
      || typeof expectedCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(expectedCommit) || value.sourceCommit !== expectedCommit || value.schemaVersion !== 1 || value.result !== 'failed'
      || ![null, 'web', 'api'].includes(value.service) || !imagePhases.has(value.phase) || !imageBuildFailureCodes.includes(value.failureCode)
      || !(value.exitCode === null || Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255)
      || !(value.signal === null || imageSignals.has(value.signal)) || !(value.spawnCode === null || imageSpawnCodes.has(value.spawnCode))
      || !['NOT_READ', 'READ', 'TAIL_ONLY', 'UNAVAILABLE'].includes(value.logReadStatus) || !Array.isArray(value.observedCauses)
      || value.observedCauses.length > imageBuildCauses.length || new Set(value.observedCauses).size !== value.observedCauses.length
      || !value.observedCauses.every(cause => imageBuildCauses.includes(cause))) return null;
    return Object.fromEntries(keys.map(key => [key, key === 'observedCauses' ? [...value[key]] : value[key]]));
  } catch { return null; }
}

export function readImageBuildDiagnostic(path, expectedCommit) {
  let fd;
  try {
    fd = openSync(path, F.O_RDONLY | (F.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > 16384) return null;
    const bytes = Buffer.alloc(stat.size), length = readSync(fd, bytes, 0, bytes.length, 0);
    if (length !== bytes.length) return null;
    return safeImageBuildDiagnostic(JSON.parse(bytes.toString('utf8')), expectedCommit);
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}

function sourceLocation(stack) {
  if (typeof stack !== 'string' || stack.length > 65536) return null;
  for (const frame of stack.split(/\r?\n/u).slice(1, 65)) {
    const trimmed = frame.trim();
    if (!trimmed.startsWith('at ')) continue;
    let location = trimmed.slice(3);
    const parenthesis = location.lastIndexOf(' (');
    if (parenthesis >= 0) {
      if (!location.endsWith(')')) continue;
      location = location.slice(parenthesis + 2, -1);
    }
    for (const prefix of releaseLocations) {
      if (!location.startsWith(`${prefix}:`)) continue;
      const match = /^(\d{1,6}):(\d{1,6})$/u.exec(location.slice(prefix.length + 1));
      if (!match) continue;
      const line = Number(match[1]), column = Number(match[2]);
      if (line >= 1 && line <= releaseLines.length && column >= 1 && column <= releaseLines[line - 1].length + 1) {
        return { file: 'release.mjs', line, column };
      }
    }
  }
  return null;
}

/** Deliberately omits messages, stacks, URLs, arguments and arbitrary .code values. */
export function safeReleaseFailure(error, stage) {
  const name = property(error, 'name');
  let causeCode = 'NONE', current = error;
  const seen = new Set();
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    const code = property(current, 'code');
    if (causeCodes.has(code)) { causeCode = code; break; }
    current = property(current, 'cause');
  }
  return { stage: publicationStages.includes(stage) ? stage : 'UNKNOWN', errorClass: classes.has(name) ? name : 'OTHER',
    causeCode, source: sourceLocation(property(error, 'stack')) };
}

function validateInput(value, request) {
  const invalid = () => { const error = new Error('RELEASE_DIAGNOSTIC_CONFIGURATION_INVALID'); error.code = 'RELEASE_DIAGNOSTIC_CONFIGURATION_INVALID'; throw error; };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['owner,repositoryName,token', 'imageRepository,owner,repositoryName,token'].includes(Object.keys(value).toSorted().join(','))) invalid();
  if (typeof value.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(value.owner)
    || typeof value.repositoryName !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/u.test(value.repositoryName) || value.repositoryName.includes('..')
    || (Object.hasOwn(value, 'imageRepository') && ![`ghcr.io/${value.owner.toLowerCase()}/${value.repositoryName.toLowerCase()}-private`, `ghcr.io/${value.owner.toLowerCase()}/${value.repositoryName.toLowerCase()}`].includes(value.imageRepository))
    || typeof value.token !== 'string' || value.token.length < 20 || value.token.length > 4096 || /\s/u.test(value.token)
    || Array.from(value.token).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || typeof request !== 'function') invalid();
}

async function boundedJson(response) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!['application/json', 'application/vnd.github+json', 'application/problem+json'].includes(type)) return null;
  const maximum = 262144;
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d{1,10}$/u.test(length) || Number(length) > maximum)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(part.value));
    }
    try { return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')); } catch { return null; }
  } finally { reader.releaseLock(); }
}

/** Four GETs only, no registry/login/push, no redirects followed and no retries.
 * Caller supplies the existing guarded job token; never loads a local env file.
 * This is capability diagnosis, not a visibility/private-package authorization.
 */
export async function inspectRegistryReadOnly(input, { request = fetch } = {}) {
  validateInput(input, request);
  const { owner, repositoryName, token } = input;
  const imageRepository = input.imageRepository ?? `ghcr.io/${owner.toLowerCase()}/${repositoryName.toLowerCase()}-private`;
  const expectedRepository = `${owner}/${repositoryName}`;
  const routes = ['USER', 'NAMED_OWNER'].flatMap(routeKind => ['web', 'api'].map(kind => ({ kind, routeKind })));
  return Promise.all(routes.map(async ({ kind, routeKind }) => {
    const row = { kind, routeKind, status: null, visibility: 'UNKNOWN', identityMatches: false, repoMatches: false,
      safeVersionCount: null, redirectSameOrigin: null };
    const packageName = `${imageRepository.split('/').slice(2).join('/')}/${kind}`;
    const route = routeKind === 'USER' ? '/user/packages/container/' : `/users/${encodeURIComponent(owner)}/packages/container/`;
    const url = `https://api.github.com${route}${encodeURIComponent(packageName)}`;
    let response;
    try {
      response = await request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' } });
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) return row;
      row.status = response.status;
      if (response.status >= 300 && response.status <= 399) {
        const location = response.headers.get('location');
        if (location) { try { row.redirectSameOrigin = new URL(location, url).origin === 'https://api.github.com'; } catch { row.redirectSameOrigin = false; } }
        return row;
      }
      // An error/404, even with a valid JSON body, does not establish absence.
      if (response.status !== 200) return row;
      const body = await boundedJson(response);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return row;
      row.visibility = ['private', 'public', 'internal'].includes(body.visibility) ? body.visibility : 'UNKNOWN';
      row.identityMatches = body.name === packageName && body.package_type === 'container' && typeof body.owner?.login === 'string'
        && body.owner.login.toLowerCase() === owner.toLowerCase();
      row.repoMatches = typeof body.repository?.full_name === 'string' && body.repository.full_name.toLowerCase() === expectedRepository.toLowerCase();
      row.safeVersionCount = Number.isSafeInteger(body.version_count) && body.version_count >= 0 && body.version_count <= 1000000 ? body.version_count : null;
      return row;
    } catch { return row; }
    finally {
      try { if (response?.body && !response.body.locked) await response.body.cancel(); }
      catch { /* Discard/cancel failures must not expose transport details. */ }
    }
  }));
}
