// Runs the real publication CLI with synthetic provider responses and in-memory
// filesystem/process adapters. No network, Docker command or disk write occurs.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const scenario = JSON.parse(process.argv[2]);
const release = new URL('../../../scripts/deployment/release.mjs', import.meta.url);
const publicMode = scenario.mode === 'public';
const sourceRepository = publicMode ? 'fonkoukevin/chatgpt_courses' : 'synthetic-owner/synthetic_courses';
const [owner, repositoryName] = sourceRepository.split('/');
const packagePrefix = repositoryName + (publicMode ? '' : '-private');
const source = `https://github.com/${sourceRepository}`;
const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: {}, layers: [] }));
const digest = 'sha256:' + createHash('sha256').update(manifest).digest('hex');
const files = new Map(), commands = [], methods = [], packageReads = [], anonymousReads = [], pushed = new Set();
let credentialsCreated = 0, credentialsRemoved = 0, checksBeforeFirstCommand;
const originalRead = fs.readFileSync, originalOpen = fs.openSync, originalClose = fs.closeSync, originalFsync = fs.fsyncSync;
const syntheticDescriptor = 424242;
Object.assign(fs, {
  readFileSync(path, ...options) {
    if (path === 'SYNTHETIC_EVENT_PATH') return JSON.stringify({ repository: { fork: false, full_name: sourceRepository, default_branch: 'main' } });
    return originalRead(path, ...options);
  },
  mkdirSync() {},
  openSync(path, flags, ...options) {
    if (basename(String(path)) === 'commands.log' || String(path).replaceAll('\\', '/').endsWith('/.runtime/deployment/public')) return syntheticDescriptor;
    if (flags !== 'r') throw new Error('UNEXPECTED_FILESYSTEM_MUTATION');
    return originalOpen(path, flags, ...options);
  },
  closeSync(fd) { if (fd !== syntheticDescriptor) originalClose(fd); },
  fsyncSync(fd) { if (fd !== syntheticDescriptor) originalFsync(fd); },
  writeFileSync(path, bytes) { files.set(String(path), Buffer.from(bytes)); },
  renameSync(from, to) { files.set(String(to), files.get(String(from))); files.delete(String(from)); },
  mkdtempSync(prefix) { credentialsCreated++; return prefix + 'synthetic'; },
  rmSync() { credentialsRemoved++; },
});
childProcess.spawnSync = (file, args) => {
  checksBeforeFirstCommand ??= packageReads.slice();
  let name = 'UNEXPECTED', stdout = '';
  if (file === 'docker' && args[0] === 'login') name = 'LOGIN';
  else if (file === process.execPath && args[0].endsWith('images.mjs')) name = 'BUILD';
  else if (file === 'docker' && args[0] === 'image') {
    name = args[1].toUpperCase();
    if (args[1] === 'inspect') {
      if (args[3].includes('org.opencontainers.image.source')) stdout = source;
      else if (args[3] === '{{json .RepoDigests}}') stdout = JSON.stringify([args.at(-1).split(':sha-')[0] + '@' + digest]);
      else throw new Error('UNEXPECTED_INSPECTION');
    }
    if (args[1] === 'push') pushed.add(args.at(-1).split('/').at(-1).split(':')[0]);
  }
  if (name === 'UNEXPECTED') throw new Error('UNEXPECTED_COMMAND');
  commands.push(name);
  return { status: 0, stdout, stderr: '' };
};
syncBuiltinESMExports();

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (address, options = {}) => {
  const url = new URL(address), method = options.method ?? 'GET';
  methods.push(method);
  if (method !== 'GET') throw new Error('UNEXPECTED_PROVIDER_MUTATION');
  if (url.hostname === 'ghcr.io') {
    anonymousReads.push({ path: url.pathname, authorization: options.headers?.Authorization === 'Bearer SYNTHETIC_ANONYMOUS_TOKEN' ? 'ANONYMOUS' : options.headers?.Authorization ? 'OTHER' : 'NONE' });
    if (!publicMode) return json({ errors: [{ code: 'DENIED' }] }, 403);
    if (url.pathname === '/token') return json({ token: 'SYNTHETIC_ANONYMOUS_TOKEN' });
    return new Response(scenario.wrongDigestBody ? Buffer.from('WRONG_MANIFEST') : manifest, { headers: {
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json', 'Docker-Content-Digest': scenario.wrongDigestHeader ? 'sha256:' + 'f'.repeat(64) : digest } });
  }
  if (url.hostname !== 'api.github.com') throw new Error('UNEXPECTED_PROVIDER');
  if (url.pathname.includes('/packages/container/')) {
    const kind = decodeURIComponent(url.pathname).split('/').at(-1);
    packageReads.push(kind);
    if (scenario[kind] === 'forbidden') return new Response(null, { status: 403 });
    if (scenario[kind] === 'absent' && !pushed.has(kind)) return new Response(null, { status: 404 });
    return json({ name: `${packagePrefix}/${kind}`, package_type: 'container', owner: { login: owner },
      visibility: pushed.has(kind) ? scenario.postVisibility ?? (publicMode ? 'public' : 'private') : scenario[kind] ?? (publicMode ? 'public' : 'private'),
      repository: { full_name: sourceRepository, private: scenario.sourcePrivate === true } });
  }
  if (url.pathname.endsWith('/environments/staging')) return json({ id: 1, name: 'staging', created_at: '2026-11-01T00:00:00Z',
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }, protection_rules: [] });
  if (url.pathname.endsWith('/actions/runs/123456')) return json({ created_at: '2026-11-10T00:00:00Z' });
  if (url.pathname.endsWith('/branches/main')) return json({ protected: true });
  if (url.pathname.endsWith('/actions/workflows/ci.yml/runs')) return json({ workflow_runs: [{ head_sha: 'a'.repeat(40), head_branch: 'main',
    head_repository: { full_name: sourceRepository }, event: 'push', conclusion: 'success' }] });
  if (url.pathname === `/repos/${sourceRepository}`) return json({ full_name: sourceRepository, visibility: scenario.sourcePrivate ? 'private' : 'public', private: scenario.sourcePrivate === true });
  throw new Error('UNEXPECTED_PROVIDER_ROUTE');
};
Object.assign(process.env, {
  GITHUB_REPOSITORY: sourceRepository, IMAGE_REPOSITORY: `ghcr.io/${owner}/${packagePrefix}`,
  GITHUB_ACTOR: owner, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
  GITHUB_TOKEN: 'SYNTHETIC_EPHEMERAL_JOB_TOKEN_42', EXPECTED_SOURCE_VISIBILITY: scenario.sourcePrivate ? 'private' : 'public', EXPECTED_IMAGE_VISIBILITY: publicMode ? 'public' : '',
  GITHUB_API_URL: 'https://api.github.com', GITHUB_SERVER_URL: 'https://github.com', GITHUB_EVENT_PATH: 'SYNTHETIC_EVENT_PATH',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', RELEASE_OPERATION: 'publish', TARGET_ENVIRONMENT: 'staging',
  DEPLOY_TARGET_AUTHORIZED: 'true', STAGING_PAYMENT_TEST: 'false', APPROVED_TEST_PACKAGE_CLEANUP: String(scenario.cleanup ?? false),
});
process.argv[1] = fileURLToPath(release);
process.argv[2] = 'publish';
await import(release.href);
const receipts = Object.fromEntries([...files].filter(([path]) => path.endsWith('.json')).map(([path, bytes]) => [basename(path), JSON.parse(bytes.toString('utf8'))]));
console.log('PUBLICATION_PROBE ' + JSON.stringify({ exitCode: process.exitCode ?? 0, methods, commands, packageReads, anonymousReads, digest, credentialsCreated, credentialsRemoved,
  checksBeforeFirstCommand, progress: receipts['publication-progress.json'], failure: receipts['failure.json'], publication: receipts['publication.json'] }));
