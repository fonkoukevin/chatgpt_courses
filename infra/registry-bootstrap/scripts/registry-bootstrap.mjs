import { readFileSync, writeFileSync, renameSync, mkdirSync, mkdtempSync, lstatSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

export const BOOTSTRAP_REPOSITORY = 'fonkoukevin/chatgpt_courses_registry';
export const IMAGE_PREFIX = 'ghcr.io/fonkoukevin/chatgpt_courses-private';
export const SOURCE_URL = `https://github.com/${BOOTSTRAP_REPOSITORY}`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'Registry bootstrap only. No application code, configuration or credentials.\n';
const dockerfile = `FROM scratch\nLABEL org.opencontainers.image.source="${SOURCE_URL}"\nLABEL org.opencontainers.image.title="ChatGPT Courses inert registry bootstrap"\nCOPY marker.txt /REGISTRY_BOOTSTRAP_ONLY.txt\n`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const requireFact = (condition, code) => { if (!condition) fail(code); };
const options = token => ({ method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' } });

async function boundedJson(response) {
  const reader = response.body?.getReader();
  requireFact(reader, 'BOOTSTRAP_RESPONSE_INVALID');
  const chunks = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      requireFact(size <= 262144, 'BOOTSTRAP_RESPONSE_INVALID'); chunks.push(Buffer.from(part.value)); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('BOOTSTRAP_RESPONSE_INVALID'); }
  } finally { try { await reader.cancel(); } catch { /* Do not expose cancellation details. */ } reader.releaseLock(); }
}
async function get(url, token, request) {
  const response = await request(url, options(token));
  requireFact([200, 404].includes(response.status), 'BOOTSTRAP_METADATA_UNAVAILABLE');
  if (response.status === 404) { await response.body?.cancel(); return { status: 404 }; }
  return { status: 200, value: await boundedJson(response) };
}
export function context(env, operation) {
  requireFact(['plan', 'bootstrap'].includes(operation), 'BOOTSTRAP_OPERATION_INVALID');
  requireFact(env.GITHUB_REPOSITORY === BOOTSTRAP_REPOSITORY && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && /^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? '')
    && /^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ATTEMPT ?? '')
    && env.GITHUB_API_URL === 'https://api.github.com' && env.GITHUB_SERVER_URL === 'https://github.com', 'BOOTSTRAP_PRIVATE_MAIN_CONTEXT_REQUIRED');
  requireFact(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length >= 20 && env.GITHUB_TOKEN.length <= 4096
    && !/\s/u.test(env.GITHUB_TOKEN) && !Array.from(env.GITHUB_TOKEN).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127), 'BOOTSTRAP_JOB_TOKEN_REQUIRED');
  if (operation === 'bootstrap') requireFact(env.BOOTSTRAP_AUTHORIZED === 'true', 'BOOTSTRAP_EXPLICIT_AUTHORIZATION_REQUIRED');
  return { operation, sourceCommit: env.GITHUB_SHA, token: env.GITHUB_TOKEN };
}
export async function anonymousDenied(kind, request = fetch) {
  const name = `${IMAGE_PREFIX.slice('ghcr.io/'.length)}/${kind}`;
  const anonymousOptions = { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) };
  const response = await request(`https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${name}:pull`)}`, anonymousOptions);
  const denial = async value => { requireFact([401, 403].includes(value.status), 'BOOTSTRAP_ANONYMOUS_ACCESS_NOT_DENIED');
    const body = await boundedJson(value); requireFact(Array.isArray(body.errors) && body.errors.length > 0 && body.errors.length <= 10
      && body.errors.every(item => ['DENIED', 'UNAUTHORIZED'].includes(item?.code)), 'BOOTSTRAP_ANONYMOUS_ACCESS_NOT_DENIED'); };
  if ([401, 403].includes(response.status)) { await denial(response); return; }
  requireFact(response.status === 200, 'BOOTSTRAP_ANONYMOUS_ACCESS_NOT_DENIED');
  const body = await boundedJson(response);
  requireFact(typeof body.token === 'string' && body.token.length >= 1 && body.token.length <= 8192 && !/\s/u.test(body.token), 'BOOTSTRAP_ANONYMOUS_ACCESS_NOT_DENIED');
  await denial(await request(`https://ghcr.io/v2/${name}/tags/list?n=1`, { ...anonymousOptions, headers: { Authorization: `Bearer ${body.token}` } }));
}
async function packageMetadata(kind, token, request) {
  const encoded = encodeURIComponent(`chatgpt_courses-private/${kind}`);
  return [await get(`https://api.github.com/user/packages/container/${encoded}`, token, request),
    await get(`https://api.github.com/users/fonkoukevin/packages/container/${encoded}`, token, request)];
}
export async function preflight(env, operation, request = fetch) {
  const validated = context(env, operation);
  const repository = await get(`https://api.github.com/repos/${BOOTSTRAP_REPOSITORY}`, validated.token, request);
  requireFact(repository.status === 200 && repository.value.full_name === BOOTSTRAP_REPOSITORY && repository.value.private === true
    && repository.value.visibility === 'private' && repository.value.fork === false && repository.value.default_branch === 'main', 'BOOTSTRAP_PRIVATE_REPOSITORY_REQUIRED');
  const branch = await get(`https://api.github.com/repos/${BOOTSTRAP_REPOSITORY}/branches/main`, validated.token, request);
  requireFact(branch.status === 200 && branch.value.name === 'main' && branch.value.commit?.sha === env.GITHUB_SHA, 'BOOTSTRAP_CURRENT_MAIN_REQUIRED');
  for (const kind of ['web', 'api']) {
    const rows = await packageMetadata(kind, validated.token, request);
    requireFact(rows.every(row => row.status === 404), 'BOOTSTRAP_PACKAGE_ALREADY_EXISTS');
    await anonymousDenied(kind, request);
  }
  return { operation, sourceCommit: env.GITHUB_SHA, bothMetadataRoutesNotFound: true, anonymousReadDenied: true };
}
async function verifyCreated(kind, token, request) {
  const rows = await packageMetadata(kind, token, request);
  requireFact(rows.every(row => row.status === 200 && row.value.name === `chatgpt_courses-private/${kind}`
    && row.value.package_type === 'container' && row.value.owner?.login === 'fonkoukevin'
    && row.value.visibility === 'private' && row.value.repository?.full_name === BOOTSTRAP_REPOSITORY
    && row.value.repository?.private === true), 'BOOTSTRAP_CREATED_PACKAGE_NOT_PRIVATE_OR_SOURCE_MISMATCH');
  await anonymousDenied(kind, request);
}
function dockerConfig(env) {
  requireFact(process.platform === 'linux' && process.version === 'v24.22.2' && env.RUNNER_TEMP && env.DOCKER_CONFIG && env.BUILDX_CONFIG, 'BOOTSTRAP_LINUX_RUNNER_REQUIRED');
  const parent = resolve(env.RUNNER_TEMP);
  for (const [value, prefix] of [[env.DOCKER_CONFIG, 'courses-registry-auth.'], [env.BUILDX_CONFIG, 'courses-registry-buildx.']]) {
    const directory = resolve(value);
    requireFact(directory.startsWith(parent + sep + prefix) && !directory.slice(parent.length + 1).includes(sep), 'BOOTSTRAP_DOCKER_CONFIG_REQUIRED');
    const stat = lstatSync(directory);
    requireFact(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700
      && readdirSync(directory).length === 0, 'BOOTSTRAP_EMPTY_OWNED_DOCKER_CONFIG_REQUIRED');
  }
}
function docker(env, args, input) {
  const inherited = /^(?:PATH|HOME|LANG|LC_ALL|TMPDIR|RUNNER_TEMP|DOCKER_CONFIG|BUILDX_CONFIG)$/u;
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) => inherited.test(key)));
  const result = spawnSync('docker', args, { env: childEnv, input, encoding: 'utf8', timeout: 120000, maxBuffer: 65536,
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  requireFact(!result.error && result.status === 0, 'BOOTSTRAP_DOCKER_COMMAND_FAILED');
  return result.stdout;
}
function workspace() {
  requireFact(readFileSync(join(root, 'stub/Dockerfile'), 'utf8').replaceAll('\r\n', '\n') === dockerfile
    && readFileSync(join(root, 'stub/marker.txt'), 'utf8').replaceAll('\r\n', '\n') === marker, 'BOOTSTRAP_STUB_BYTES_CHANGED');
  const directory = mkdtempSync(join(tmpdir(), 'courses-registry-stub-')), initial = lstatSync(directory);
  writeFileSync(join(directory, 'Dockerfile'), dockerfile, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'marker.txt'), marker, { flag: 'wx', mode: 0o600 });
  return { directory, close() { const now = lstatSync(directory); requireFact(now.isDirectory() && !now.isSymbolicLink()
    && now.dev === initial.dev && now.ino === initial.ino && now.uid === initial.uid
    && readdirSync(directory).toSorted().join(',') === 'Dockerfile,marker.txt', 'BOOTSTRAP_CONTEXT_CLEANUP_REFUSED');
    for (const name of ['Dockerfile', 'marker.txt']) { const file = lstatSync(join(directory, name));
      requireFact(file.isFile() && !file.isSymbolicLink() && file.nlink === 1 && file.uid === initial.uid, 'BOOTSTRAP_CONTEXT_CLEANUP_REFUSED'); }
    unlinkSync(join(directory, 'Dockerfile')); unlinkSync(join(directory, 'marker.txt')); rmdirSync(directory); } };
}
export async function bootstrap(env, { request = fetch, execute = (args, input) => docker(env, args, input), validateDockerConfig = () => dockerConfig(env), createWorkspace = workspace, record = () => {} } = {}) {
  const progress = { stage: 'PREFLIGHT', contextRemoved: false, images: Object.fromEntries(['web', 'api'].map(kind => [kind,
    { pushAttempted: false, pushConfirmed: false, digest: null, privateVerified: false, anonymousReadDenied: false, bootstrapSourceVerified: false }])) };
  const stage = name => { progress.stage = name; record(JSON.parse(JSON.stringify(progress))); };
  let facts, work, failure;
  try {
    stage('PREFLIGHT'); facts = await preflight(env, 'bootstrap', request);
    validateDockerConfig(); work = createWorkspace();
    stage('REGISTRY_LOGIN');
    execute(['login', 'ghcr.io', '--username', 'fonkoukevin', '--password-stdin'], env.GITHUB_TOKEN);
    const local = `courses-registry-inert:${env.GITHUB_SHA}`;
    stage('STUB_BUILD');
    execute(['build', '--network=none', '--pull=false', '--no-cache', '--label', `org.opencontainers.image.revision=${env.GITHUB_SHA}`,
      '--tag', local, '--file', join(work.directory, 'Dockerfile'), work.directory]);
    const label = execute(['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.source"}}', local]).trim();
    requireFact(label === SOURCE_URL, 'BOOTSTRAP_STUB_SOURCE_MISMATCH');
    for (const kind of ['web', 'api']) {
      // Recheck the destination immediately before the only permitted push.
      stage(`CHECK_${kind.toUpperCase()}_BEFORE_PUSH`);
      requireFact((await packageMetadata(kind, env.GITHUB_TOKEN, request)).every(row => row.status === 404), 'BOOTSTRAP_PACKAGE_ALREADY_EXISTS');
      await anonymousDenied(kind, request);
      const tag = `${IMAGE_PREFIX}/${kind}:bootstrap-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
      execute(['image', 'tag', local, tag]);
      progress.images[kind].pushAttempted = true; stage(`PUSH_${kind.toUpperCase()}`);
      execute(['image', 'push', tag]); progress.images[kind].pushConfirmed = true;
      stage(`VERIFY_${kind.toUpperCase()}`);
      let digests; try { digests = JSON.parse(execute(['image', 'inspect', '--format', '{{json .RepoDigests}}', tag])); } catch { fail('BOOTSTRAP_DIGEST_UNCONFIRMED'); }
      const prefix = `${IMAGE_PREFIX}/${kind}@sha256:`;
      requireFact(Array.isArray(digests) && digests.length <= 100 && digests.every(value => typeof value === 'string'), 'BOOTSTRAP_DIGEST_UNCONFIRMED');
      const matches = digests.filter(value => value.startsWith(prefix));
      requireFact(matches.length === 1 && /^[a-f0-9]{64}$/u.test(matches[0].slice(prefix.length)), 'BOOTSTRAP_DIGEST_UNCONFIRMED');
      progress.images[kind].digest = matches[0].slice(matches[0].indexOf('@') + 1);
      await verifyCreated(kind, env.GITHUB_TOKEN, request);
      Object.assign(progress.images[kind], { privateVerified: true, anonymousReadDenied: true, bootstrapSourceVerified: true });
      stage(`VERIFIED_${kind.toUpperCase()}`);
    }
  } catch (error) { failure = error; }
  if (work) { try { work.close(); progress.contextRemoved = true; } catch (error) { failure ??= error; } }
  if (failure) {
    const code = typeof failure.code === 'string' && /^BOOTSTRAP_[A-Z_]{1,100}$/u.test(failure.code) ? failure.code : 'BOOTSTRAP_OPERATION_UNAVAILABLE';
    const wrapped = new Error(code); wrapped.code = code;
    wrapped.bootstrapProgress = progress;
    record(JSON.parse(JSON.stringify(progress)));
    throw wrapped;
  }
  stage('COMPLETE');
  return { schemaVersion: 1, result: 'passed', type: 'INERT_REGISTRY_BOOTSTRAP_ONLY', ...facts, progress,
    applicationRelease: false, applicationSourceIncluded: false, markerSha256: sha256(Buffer.from(marker)),
    finalSourceLinkConfigured: false, applicationPublicationAuthorized: false };
}
function recordProgress(value) {
  const directory = join(root, '.runtime/registry-bootstrap'); mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.progress-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
  renameSync(temporary, join(directory, 'progress.json'));
}
export async function runOperation(env, operation, dependencies = {}) {
  context(env, operation);
  return operation === 'plan' ? { schemaVersion: 1, result: 'passed', type: 'INERT_REGISTRY_BOOTSTRAP_ONLY',
    ...(await preflight(env, operation, dependencies.request ?? fetch)), applicationRelease: false, registryMutationExecuted: false }
    : bootstrap(env, dependencies);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report; const operation = process.argv[2];
  try { requireFact(process.version === 'v24.22.2', 'BOOTSTRAP_PINNED_NODE_REQUIRED');
    requireFact(['plan', 'bootstrap'].includes(operation), 'BOOTSTRAP_OPERATION_INVALID');
    report = await runOperation(process.env, operation, { record: recordProgress }); }
  catch (error) { report = { schemaVersion: 1, result: 'blocked', type: 'INERT_REGISTRY_BOOTSTRAP_ONLY',
    code: typeof error.code === 'string' && /^BOOTSTRAP_[A-Z_]+$/u.test(error.code) ? error.code : 'BOOTSTRAP_OPERATION_UNAVAILABLE',
    applicationRelease: false, applicationPublicationAuthorized: false,
    ...(error.bootstrapProgress ? { progress: error.bootstrapProgress, requiresOperatorReview: Object.values(error.bootstrapProgress.images).some(value => value.pushAttempted) } : {}) }; process.exitCode = 1; }
  mkdirSync(join(root, '.runtime/registry-bootstrap'), { recursive: true });
  const filename = ['plan', 'bootstrap'].includes(operation) ? operation + '.json' : 'failure.json';
  writeFileSync(join(root, '.runtime/registry-bootstrap', filename), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report));
}
