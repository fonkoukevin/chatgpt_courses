import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { context, preflight, bootstrap, runOperation, BOOTSTRAP_REPOSITORY, SOURCE_URL, IMAGE_PREFIX } from '../scripts/registry-bootstrap.mjs';

const env = () => ({ GITHUB_REPOSITORY: BOOTSTRAP_REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', GITHUB_API_URL: 'https://api.github.com',
  GITHUB_SERVER_URL: 'https://github.com', GITHUB_TOKEN: 'SYNTHETIC_EPHEMERAL_TOKEN_42', BOOTSTRAP_AUTHORIZED: 'true' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(scenario = {}) {
  const methods = [], commands = [], readsBeforeCommands = [], created = new Set(), pushes = [], records = [], state = { workspaces: 0, closed: 0, authValidations: 0 };
  const request = async (address, options = {}) => {
    const url = new URL(address); methods.push(options.method);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    if (!commands.length) readsBeforeCommands.push(url.pathname);
    if (url.hostname === 'ghcr.io') {
      assert.equal(options.headers?.Authorization?.includes(env().GITHUB_TOKEN) ?? false, false);
      return scenario.anonymousReadable ? json({ token: 'SYNTHETIC_ANONYMOUS_TOKEN' }) : json({ errors: [{ code: 'DENIED' }] }, 403);
    }
    assert.equal(url.hostname, 'api.github.com');
    assert.equal(options.headers.Authorization, `Bearer ${env().GITHUB_TOKEN}`);
    if (url.pathname === `/repos/${BOOTSTRAP_REPOSITORY}`) return json({ full_name: BOOTSTRAP_REPOSITORY, private: !scenario.publicRepo, visibility: scenario.publicRepo ? 'public' : 'private', fork: false, default_branch: 'main' });
    if (url.pathname.endsWith('/branches/main')) return json({ name: 'main', commit: { sha: scenario.staleMain ? 'b'.repeat(40) : env().GITHUB_SHA } });
    const kind = decodeURIComponent(url.pathname).split('/').at(-1);
    assert.ok(['web', 'api'].includes(kind));
    if (scenario.status && kind === (scenario.kind ?? 'web')) return json({}, scenario.status);
    const exists = created.has(kind) || scenario.existing === kind;
    if (!exists) return new Response(null, { status: 404 });
    return json({ name: `chatgpt_courses-private/${kind}`, package_type: 'container', owner: { login: 'fonkoukevin' },
      visibility: scenario.createdPublic && created.has(kind) ? 'public' : scenario.existingVisibility ?? 'private',
      repository: { full_name: scenario.wrongSource && created.has(kind) ? 'foreign/repo' : BOOTSTRAP_REPOSITORY, private: true } });
  };
  const execute = (args, input) => { commands.push(args);
    if (args[0] === 'login') assert.equal(input, env().GITHUB_TOKEN);
    else assert.equal(input, undefined);
    if (args[0] === 'image' && args[1] === 'inspect') return args[3] === '{{json .RepoDigests}}'
      ? scenario.badDigest ? JSON.stringify(['foreign/image@sha256:' + 'b'.repeat(64)]) : JSON.stringify([args.at(-1).split(':bootstrap-')[0] + '@sha256:' + 'b'.repeat(64)]) : SOURCE_URL;
    if (args[0] === 'image' && args[1] === 'push') { const kind = args[2].split('/').at(-1).split(':')[0];
      assert.equal(records.at(-1).stage, `PUSH_${kind.toUpperCase()}`); assert.equal(records.at(-1).images[kind].pushAttempted, true);
      created.add(kind); pushes.push(kind);
      if (scenario.lostPushReply === kind) { const error = new Error('SYNTHETIC_PRIVATE_PROVIDER_MESSAGE'); error.code = 'BOOTSTRAP_DOCKER_COMMAND_FAILED'; throw error; }
    }
    return ''; };
  const createWorkspace = () => { state.workspaces++; return { directory: '/SYNTHETIC_INERT_CONTEXT', close() { state.closed++; } }; };
  const validateDockerConfig = () => { state.authValidations++; };
  const record = value => records.push(value);
  return { request, execute, createWorkspace, validateDockerConfig, record, commands, methods, pushes, readsBeforeCommands, records, state };
}
test('only explicit main workflow context of the exact private bootstrap repository is accepted', async () => {
  assert.equal(context(env(), 'plan').operation, 'plan');
  for (const changed of [{ GITHUB_REPOSITORY: 'fonkoukevin/chatgpt_courses' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_API_URL: 'https://foreign.invalid' }, { GITHUB_RUN_ATTEMPT: '0' }, { GITHUB_TOKEN: 'short' }]) assert.throws(() => context({ ...env(), ...changed }, 'bootstrap'));
  assert.throws(() => context({ ...env(), BOOTSTRAP_AUTHORIZED: 'false' }, 'bootstrap'), /EXPLICIT_AUTHORIZATION/);
  assert.throws(() => context(env(), 'publish'), /OPERATION_INVALID/);
  for (const scenario of [{ publicRepo: true }, { staleMain: true }]) {
    const f = fixture(scenario); await assert.rejects(bootstrap(env(), f)); assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0); assert.equal(f.state.authValidations, 0);
  }
});
test('plan is GET-only and does not create a workspace, credentials or Docker command', async () => {
  const f = fixture(); const result = await preflight(env(), 'plan', f.request);
  assert.equal(result.bothMetadataRoutesNotFound, true); assert.equal(result.anonymousReadDenied, true);
  assert.ok(f.methods.every(method => method === 'GET')); assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0);
});
test('unknown or omitted CLI operations cannot fall through to an authorized bootstrap', async () => {
  for (const operation of [undefined, '', 'plna', 'publish']) {
    const f = fixture(); await assert.rejects(runOperation(env(), operation, f), /OPERATION_INVALID/);
    assert.deepEqual(f.methods, []); assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0);
  }
});
test('either existing web/API, private/public, or an unavailable metadata capability blocks before every mutation', async () => {
  for (const kind of ['web', 'api']) for (const existingVisibility of ['private', 'public']) {
    const f = fixture({ existing: kind, existingVisibility }); await assert.rejects(bootstrap(env(), f), /PACKAGE_ALREADY_EXISTS/);
    assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0); assert.equal(f.state.authValidations, 0);
  }
  for (const kind of ['web', 'api']) for (const status of [401, 403, 429, 500]) {
    const f = fixture({ kind, status }); await assert.rejects(bootstrap(env(), f), /METADATA_UNAVAILABLE/);
    assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0); assert.equal(f.state.authValidations, 0);
  }
});
test('successful mocked bootstrap sends only the inert context and rechecks private source after each push', async () => {
  const f = fixture(), result = await bootstrap(env(), f);
  assert.deepEqual(f.pushes, ['web', 'api']); assert.equal(result.applicationRelease, false); assert.equal(result.applicationSourceIncluded, false);
  assert.equal(result.applicationPublicationAuthorized, false); assert.equal(result.finalSourceLinkConfigured, false);
  assert.equal(result.type, 'INERT_REGISTRY_BOOTSTRAP_ONLY'); assert.equal(Object.keys(result.progress.images).length, 2);
  assert.equal(f.commands.filter(args => args[0] === 'image' && args[1] === 'push').every(args => args[2].startsWith(IMAGE_PREFIX + '/')), true);
  assert.equal(Object.values(result.progress.images).every(image => /^sha256:[a-f0-9]{64}$/u.test(image.digest) && image.privateVerified && image.anonymousReadDenied && image.bootstrapSourceVerified), true);
  assert.equal(JSON.stringify(result).includes(env().GITHUB_TOKEN), false);
  assert.equal(f.state.workspaces, 1); assert.equal(f.state.closed, 1); assert.equal(f.state.authValidations, 1);
  const build = f.commands.find(args => args[0] === 'build'); assert.ok(build.includes('--network=none')); assert.ok(build.includes('--pull=false'));
  assert.equal(build.at(-1), '/SYNTHETIC_INERT_CONTEXT');
  assert.ok(f.readsBeforeCommands.some(path => path.endsWith('chatgpt_courses-private%2Fweb')));
  assert.ok(f.readsBeforeCommands.some(path => path.endsWith('chatgpt_courses-private%2Fapi')));
});
test('a public or wrongly linked first stub stops before the second push and closes its context', async () => {
  for (const scenario of [{ createdPublic: true }, { wrongSource: true }]) {
    const f = fixture(scenario); await assert.rejects(bootstrap(env(), f), error => {
      assert.equal(error.code, 'BOOTSTRAP_CREATED_PACKAGE_NOT_PRIVATE_OR_SOURCE_MISMATCH');
      assert.equal(error.bootstrapProgress.stage, 'VERIFY_WEB'); assert.equal(error.bootstrapProgress.images.web.pushAttempted, true);
      assert.equal(error.bootstrapProgress.images.web.pushConfirmed, true); assert.equal(error.bootstrapProgress.images.web.privateVerified, false);
      assert.equal(error.bootstrapProgress.images.api.pushAttempted, false); assert.equal(error.bootstrapProgress.contextRemoved, true); return true;
    });
    assert.deepEqual(f.pushes, ['web']); assert.equal(f.state.closed, 1);
  }
});
test('readable anonymous package bodies cannot establish denial or authorize bootstrap', async () => {
  const f = fixture({ anonymousReadable: true }); await assert.rejects(bootstrap(env(), f), /ANONYMOUS_ACCESS_NOT_DENIED/);
  assert.deepEqual(f.commands, []); assert.equal(f.state.workspaces, 0);
});
test('an unconfirmed digest stops after the first stub push and preserves its observed intent', async () => {
  const f = fixture({ badDigest: true }); await assert.rejects(bootstrap(env(), f), error => {
    assert.equal(error.code, 'BOOTSTRAP_DIGEST_UNCONFIRMED'); assert.equal(error.bootstrapProgress.images.web.pushConfirmed, true);
    assert.equal(error.bootstrapProgress.images.web.digest, null); assert.equal(error.bootstrapProgress.images.api.pushAttempted, false); return true;
  });
  assert.deepEqual(f.pushes, ['web']); assert.equal(f.state.closed, 1);
});
test('a lost push response is not retried and remains distinguishable from a confirmed private creation', async () => {
  const f = fixture({ lostPushReply: 'api' }); await assert.rejects(bootstrap(env(), f), error => {
    assert.equal(error.code, 'BOOTSTRAP_DOCKER_COMMAND_FAILED'); assert.equal(error.bootstrapProgress.stage, 'PUSH_API');
    assert.equal(error.bootstrapProgress.images.web.privateVerified, true); assert.equal(error.bootstrapProgress.images.api.pushAttempted, true);
    assert.equal(error.bootstrapProgress.images.api.pushConfirmed, false); assert.equal(error.bootstrapProgress.images.api.privateVerified, false);
    assert.equal(error.message.includes('SYNTHETIC_PRIVATE_PROVIDER_MESSAGE'), false); return true;
  });
  assert.deepEqual(f.pushes, ['web', 'api']); assert.equal(f.records.at(-1).images.api.pushAttempted, true); assert.equal(f.state.closed, 1);
});
test('candidate workflow remains manual and default-plan, with separate read/write tokens and bounded cleanup', () => {
  const workflow = readFileSync(new URL('../.github/workflows/registry-bootstrap.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/u); assert.match(workflow, /default: plan/u); assert.match(workflow, /default: false/u);
  assert.match(workflow, /packages: read/u); assert.match(workflow, /packages: write/u);
  assert.match(workflow, /trap cleanup_registry EXIT/u); assert.match(workflow, /rmdir -- "\$auth_dir"/u);
  assert.match(workflow, /export BUILDX_CONFIG="\$buildx_dir"/u);
  assert.equal(/\b(?:ssh|scp|secrets\.|npm|schedule|pull_request)\b/u.test(workflow), false);
  assert.equal(workflow.includes('rm -rf'), false);
  const dockerfile = readFileSync(new URL('../stub/Dockerfile', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(dockerfile.startsWith('FROM scratch\n'), true); assert.equal((dockerfile.match(/^COPY /gmu) ?? []).length, 1);
  assert.equal(dockerfile.includes('chatgpt_courses_registry'), true); assert.equal(dockerfile.includes('https://github.com/fonkoukevin/chatgpt_courses"'), false);
});
