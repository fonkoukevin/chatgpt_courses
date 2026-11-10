import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCurrentPublicPackage, target } from '../../scripts/deployment/current-public-package-inventory.mjs';

const env = () => ({ GITHUB_REPOSITORY: target.diagnosticRepository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'SYNTHETIC_EPHEMERAL_TOKEN_42' });
const version = (changes = {}) => ({ id: target.versionId, name: target.digest, created_at: '2026-11-10T19:00:00Z', updated_at: '2026-11-10T19:00:00Z',
  metadata: { package_type: 'container', container: { tags: [target.tag] } }, ...changes });
function fixture(options = {}) {
  const calls = [];
  const metadata = { id: 123, name: target.name, package_type: 'container', owner: { login: target.owner }, visibility: 'public',
    repository: { full_name: target.sourceRepository, private: false }, version_count: options.paginated ? 2 : 1,
    created_at: '2026-11-10T19:00:00Z', updated_at: '2026-11-10T19:00:00Z' };
  const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...extra } });
  const request = async (address, settings) => {
    const url = new URL(address); calls.push({ url: address, method: settings.method });
    assert.equal(settings.method, 'GET'); assert.equal(settings.redirect, 'error'); assert.equal(settings.cache, 'no-store');
    assert.equal(url.origin, 'https://api.github.com'); assert.equal(settings.headers.Authorization, `Bearer ${env().GITHUB_TOKEN}`);
    if (url.pathname === `/repos/${target.diagnosticRepository}`) return json({ full_name: target.diagnosticRepository, private: false, visibility: 'public', fork: options.fork ?? false, default_branch: 'main' });
    if (url.pathname.includes('/branches/')) return json({ name: decodeURIComponent(url.pathname.split('/branches/')[1]), commit: { sha: env().GITHUB_SHA } });
    if (options.denied) return json({ message: 'SYNTHETIC_PRIVATE_PROVIDER_BODY' }, options.denied);
    if (url.pathname.endsWith(`/versions/${target.versionId}`)) return json(version());
    if (!url.pathname.endsWith('/versions')) return json(metadata);
    const state = url.searchParams.get('state'), page = url.searchParams.get('page');
    if (state === 'deleted') return json([]);
    const second = version({ id: target.versionId + 1, name: 'sha256:' + 'b'.repeat(64), metadata: { package_type: 'container', container: { tags: ['SYNTHETIC_PRIVATE_TAG'] } } });
    if (options.paginated && page === '1') {
      const next = new URL(address); next.searchParams.set('page', '2');
      const foreign = options.foreignNext ? 'https://foreign.invalid/private' : next.href;
      return json([version()], 200, { Link: `<${foreign}>; rel="next", <${next.href}>; rel="last"` });
    }
    return json(page === '2' ? [options.duplicate ? version() : second] : [version()]);
  };
  return { request, calls };
}
test('fixed known package inventory completes with exact immutable version and no admin/deletion inference', async () => {
  const f = fixture(), report = await inspectCurrentPublicPackage(env(), f);
  assert.equal(report.complete, true); assert.equal(report.onlyKnownActiveVersionObserved, true);
  assert.equal(report.package.owner, target.owner); assert.equal(report.exactVersion.digest, target.digest);
  assert.equal(report.active[0].tags[0].value, target.tag); assert.equal(report.deleted.length, 0);
  assert.equal(report.packageAdminRoleVerified, false); assert.equal(report.deletionAuthorized, false); assert.equal(report.mutationExecuted, false);
  assert.equal(f.calls.length, 8); assert.equal(JSON.stringify(report).includes(env().GITHUB_TOKEN), false);
});
test('GET401/403/404 stay blocked without fallback, retry, raw provider body or claimed absence', async () => {
  for (const denied of [401, 403, 404, 429, 500]) {
    const f = fixture({ denied }), report = await inspectCurrentPublicPackage(env(), f);
    assert.equal(report.complete, false); assert.equal(report.result, 'blocked'); assert.equal(f.calls.length, 3);
    assert.equal(report.failureCode, 'READ_CAPABILITY_OR_RESOURCE_UNAVAILABLE');
    assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_PROVIDER_BODY'), false);
  }
});
test('bounded same-endpoint next pages produce a complete inventory while foreign tags remain hashed', async () => {
  const f = fixture({ paginated: true }), report = await inspectCurrentPublicPackage(env(), f);
  assert.equal(report.complete, true); assert.equal(report.activePages, 2); assert.equal(report.active.length, 2);
  assert.equal(report.onlyKnownActiveVersionObserved, false); assert.equal(report.active[1].tags[0].redacted, true);
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_TAG'), false);
});
test('foreign pagination and duplicate version snapshots stop without foreign requests or complete claims', async () => {
  for (const changes of [{ foreignNext: true }, { duplicate: true }]) {
    const f = fixture({ paginated: true, ...changes }), report = await inspectCurrentPublicPackage(env(), f);
    assert.equal(report.complete, false); assert.equal(report.result, 'blocked');
    assert.equal(f.calls.some(call => call.url.includes('foreign.invalid')), false);
    assert.ok(['PAGINATION_NOT_APPROVED', 'DUPLICATE_VERSION_OR_SNAPSHOT_CHANGED'].includes(report.failureCode));
  }
});
test('wrong repository, ref, event, fork or token cannot run this diagnostic', async () => {
  for (const changes of [{ GITHUB_REPOSITORY: 'foreign/chatgpt_courses' }, { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_TOKEN: 'short' }]) {
    const f = fixture(), report = await inspectCurrentPublicPackage({ ...env(), ...changes }, f);
    assert.equal(report.complete, false); assert.equal(f.calls.length, 0); assert.equal(report.failureCode, 'DIAGNOSTIC_JOB_CONTEXT_REQUIRED');
  }
  const fork = fixture({ fork: true }), denied = await inspectCurrentPublicPackage(env(), fork);
  assert.equal(denied.complete, false); assert.equal(denied.failureCode, 'PUBLIC_DIAGNOSTIC_REPOSITORY_REQUIRED'); assert.equal(fork.calls.length, 1);
});
test('only the exact diagnostic push branch or manual main can pass the context gate', async () => {
  const f = fixture(), report = await inspectCurrentPublicPackage({ ...env(), GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/p21/private-package-preflight' }, f);
  assert.equal(report.complete, true); assert.equal(f.calls.length, 8);
  assert.ok(f.calls[1].url.endsWith('/branches/p21%2Fprivate-package-preflight'));
});
