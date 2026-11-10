import { readFileSync } from 'node:fs';
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
