// Runs the real publication CLI with synthetic provider responses and in-memory
// filesystem/process adapters. No network, Docker command or disk write occurs.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const scenario = JSON.parse(process.argv[2]);
const release = new URL('../../../scripts/deployment/release.mjs', import.meta.url);
const source = 'https://github.com/synthetic-owner/synthetic_courses';
const files = new Map(), commands = [], methods = [], packageReads = [];
let credentialsCreated = 0, credentialsRemoved = 0, checksBeforeFirstCommand;
const originalRead = fs.readFileSync, originalOpen = fs.openSync, originalClose = fs.closeSync, originalFsync = fs.fsyncSync;
const syntheticDescriptor = 424242;
Object.assign(fs, {
  readFileSync(path, ...options) {
    if (path === 'SYNTHETIC_EVENT_PATH') return JSON.stringify({ repository: { fork: false, full_name: 'synthetic-owner/synthetic_courses', default_branch: 'main' } });
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
      else if (args[3] === '{{json .RepoDigests}}') stdout = JSON.stringify([args.at(-1).split(':sha-')[0] + '@sha256:' + 'b'.repeat(64)]);
      else throw new Error('UNEXPECTED_INSPECTION');
    }
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
  if (url.hostname === 'ghcr.io') return json({ errors: [{ code: 'DENIED' }] }, 403);
  if (url.hostname !== 'api.github.com') throw new Error('UNEXPECTED_PROVIDER');
  if (url.pathname.includes('/packages/container/')) {
    const kind = decodeURIComponent(url.pathname).split('/').at(-1);
    packageReads.push(kind);
    if (scenario[kind] === 'absent') return new Response(null, { status: 404 });
    return json({ name: `synthetic_courses-private/${kind}`, package_type: 'container', owner: { login: 'synthetic-owner' },
      visibility: scenario[kind] ?? 'private', repository: { full_name: 'synthetic-owner/synthetic_courses', private: false } });
  }
  if (url.pathname.endsWith('/environments/staging')) return json({ id: 1, name: 'staging', created_at: '2026-11-01T00:00:00Z',
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }, protection_rules: [] });
  if (url.pathname.endsWith('/actions/runs/123456')) return json({ created_at: '2026-11-10T00:00:00Z' });
  if (url.pathname.endsWith('/branches/main')) return json({ protected: true });
  if (url.pathname.endsWith('/actions/workflows/ci.yml/runs')) return json({ workflow_runs: [{ head_sha: 'a'.repeat(40), head_branch: 'main',
    head_repository: { full_name: 'synthetic-owner/synthetic_courses' }, event: 'push', conclusion: 'success' }] });
  if (url.pathname === '/repos/synthetic-owner/synthetic_courses') return json({ full_name: 'synthetic-owner/synthetic_courses', visibility: 'public', private: false });
  throw new Error('UNEXPECTED_PROVIDER_ROUTE');
};
Object.assign(process.env, {
  GITHUB_REPOSITORY: 'synthetic-owner/synthetic_courses', IMAGE_REPOSITORY: 'ghcr.io/synthetic-owner/synthetic_courses-private',
  GITHUB_ACTOR: 'synthetic-owner', GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
  GITHUB_TOKEN: 'SYNTHETIC_EPHEMERAL_JOB_TOKEN_42', EXPECTED_SOURCE_VISIBILITY: 'public',
  GITHUB_API_URL: 'https://api.github.com', GITHUB_SERVER_URL: 'https://github.com', GITHUB_EVENT_PATH: 'SYNTHETIC_EVENT_PATH',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', RELEASE_OPERATION: 'publish', TARGET_ENVIRONMENT: 'staging',
  DEPLOY_TARGET_AUTHORIZED: 'true', STAGING_PAYMENT_TEST: 'false', APPROVED_TEST_PACKAGE_CLEANUP: String(scenario.cleanup ?? false),
});
process.argv[1] = fileURLToPath(release);
process.argv[2] = 'publish';
await import(release.href);
const receipts = Object.fromEntries([...files].filter(([path]) => path.endsWith('.json')).map(([path, bytes]) => [basename(path), JSON.parse(bytes.toString('utf8'))]));
console.log('PUBLICATION_PROBE ' + JSON.stringify({ exitCode: process.exitCode ?? 0, methods, commands, packageReads, credentialsCreated, credentialsRemoved,
  checksBeforeFirstCommand, progress: receipts['publication-progress.json'], failure: receipts['failure.json'], publication: receipts['publication.json'] }));
