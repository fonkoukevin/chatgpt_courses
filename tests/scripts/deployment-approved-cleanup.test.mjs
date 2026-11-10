import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { approvedTestCleanupTarget as target, cleanupApprovedTestPackage } from '../../scripts/deployment/approved-test-cleanup.mjs';

const packageUrl = 'https://api.github.com/users/fonkoukevin/packages/container/chatgpt_courses%2Fweb';
const versionUrl = packageUrl + '/versions/1531288133';
const versionsUrl = 'https://api.github.com/user/packages/container/chatgpt_courses%2Fweb/versions';
const activeUrl = versionsUrl + '?state=active&per_page=100';
const deletedUrl = versionsUrl + '?state=deleted&per_page=100';
const input = () => ({ approvedTestCleanup: true, environment: 'staging', guardPassed: true,
  sourceRepository: 'fonkoukevin/chatgpt_courses', imageRepository: 'ghcr.io/fonkoukevin/chatgpt_courses-private',
  token: 'SYNTHETIC_EPHEMERAL_JOB_TOKEN_ONLY' });
const pkg = () => ({ id: 123, name: 'chatgpt_courses/web', package_type: 'container', visibility: 'public',
  owner: { login: 'fonkoukevin' }, repository: { full_name: 'fonkoukevin/chatgpt_courses' }, version_count: 1 });
const version = () => ({ id: 1531288133, name: target.digest,
  metadata: { package_type: 'container', container: { tags: [target.tag] } } });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json', ...headers } });
const noContent = status => new Response(null, { status });
const beforeDelete = () => [json(pkg()), json(version()), json([version()]), json([])];

function fixture(responses, { recordOverride } = {}) {
  const calls = [], receipts = [];
  return { calls, receipts, record: recordOverride ?? (async value => { receipts.push(value); }),
    request: async (url, options) => {
      calls.push({ url, options });
      const item = responses[calls.length - 1];
      assert.notEqual(item, undefined, 'unexpected extra request');
      return typeof item === 'function' ? item(url, options, receipts) : item;
    } };
}
async function failure(work, code) {
  let observed;
  await assert.rejects(work, error => { observed = error; return error.code === code; });
  assert.equal(observed.progress.result, 'failed');
  return observed.progress;
}

test('approval, guarded staging and the private replacement namespace are required before any network', async () => {
  for (const change of [{ approvedTestCleanup: false }, { environment: 'production' }, { guardPassed: false },
    { sourceRepository: 'foreign/repository' }, { imageRepository: 'ghcr.io/fonkoukevin/chatgpt_courses' },
    { token: 'SYNTHETIC\nAuthorization:injected' }, { token: 'x'.repeat(4097) }, { arbitraryTarget: 'api' }]) {
    let calls = 0;
    await assert.rejects(cleanupApprovedTestPackage({ ...input(), ...change }, {
      request: async () => { calls++; throw new Error('must not run'); }, record: async () => {},
    }));
    assert.equal(calls, 0);
  }
  await failure(cleanupApprovedTestPackage(input(), { request: async () => { throw new Error('must not run'); } }), 'APPROVED_TEST_TRACE_REQUIRED');
  assert.equal(Object.isFrozen(target), true);
});

test('one exact active version and no deleted versions permit one package DELETE followed by both authenticated 404 checks', async () => {
  for (const includeCount of [true, false]) {
    const metadata = pkg(); if (!includeCount) delete metadata.version_count;
    const env = input(), f = fixture([json(metadata), json(version()), json([version()]), json([]),
      (_url, _options, receipts) => {
        assert.equal(receipts.at(-1).stage, 'DELETE_PACKAGE');
        assert.equal(receipts.at(-1).packageInventoryVerified, true);
        assert.equal(receipts.at(-1).activeVersionCount, 1); assert.equal(receipts.at(-1).deletedVersionCount, 0);
        assert.equal(receipts.at(-1).deletionMayHaveOccurred, true);
        return noContent(204);
      }, noContent(404), noContent(404)]);
    const result = await cleanupApprovedTestPackage(env, f);
    assert.deepEqual(f.calls.map(c => [c.options.method, c.url]), [
      ['GET', packageUrl], ['GET', versionUrl], ['GET', activeUrl], ['GET', deletedUrl],
      ['DELETE', packageUrl], ['GET', packageUrl], ['GET', versionUrl]]);
    for (const call of f.calls) {
      assert.equal(call.options.redirect, 'manual'); assert.equal(call.options.cache, 'no-store');
      assert.equal(call.options.signal instanceof AbortSignal, true);
      assert.equal(call.options.headers.Authorization, 'Bearer ' + env.token);
      assert.equal(call.options.headers['X-GitHub-Api-Version'], '2026-03-10');
      assert.equal(Object.hasOwn(call.options, 'body'), false);
    }
    assert.equal(result.result, 'passed'); assert.equal(result.deleteResponseStatus, 204);
    assert.equal(result.packageVerificationGetStatus, 404); assert.equal(result.verificationGetStatus, 404);
    assert.equal(result.packageDeletionConfirmed, true); assert.equal(result.versionDeletionConfirmed, true);
    assert.equal(result.packageDeletionRequested, true); assert.equal(result.otherVersionDeletionRequested, false);
    assert.equal(result.residualPackageState, 'AUTHENTICATED_GET_404');
    assert.equal(result.registryAndCdnCacheState, 'NOT_INSPECTED');
    assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(env.token), false);
    assert.equal(f.receipts.at(-1).stage, 'COMPLETE');
  }
});

test('foreign identities, inconsistent package counts, wrong digest and extra tags prevent every DELETE', async () => {
  const badPackages = [{ ...pkg(), visibility: 'private' }, { ...pkg(), owner: { login: 'foreign' } },
    { ...pkg(), repository: { full_name: 'foreign/repository' } }, { ...pkg(), name: 'chatgpt_courses/api' },
    { ...pkg(), package_type: 'npm' }, { ...pkg(), id: '123' }];
  for (const body of badPackages) {
    const f = fixture([json(body)]);
    await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH');
    assert.equal(f.calls.length, 1);
  }
  for (const count of [0, 2, '1', null]) {
    const f = fixture([json({ ...pkg(), version_count: count })]);
    await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_PACKAGE_VERSION_COUNT_MISMATCH');
    assert.equal(f.calls.length, 1);
  }
  const badVersions = [{ ...version(), id: 1531288134 }, { ...version(), name: 'sha256:' + '0'.repeat(64) },
    { ...version(), metadata: { package_type: 'container', container: { tags: [target.tag, 'another-tag'] } } },
    { ...version(), metadata: { package_type: 'container', container: { tags: ['other-run'] } } },
    { ...version(), metadata: { package_type: 'container', container: { tags: [] } } },
    { ...version(), metadata: { package_type: 'npm', container: { tags: [target.tag] } } }];
  for (const body of badVersions) {
    const f = fixture([json(pkg()), json(body)]);
    await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_VERSION_IDENTITY_MISMATCH');
    assert.equal(f.calls.length, 2); assert.equal(f.calls.some(c => c.options.method === 'DELETE'), false);
  }
});

test('extra active or deleted versions, pagination, unreadable lists and state inconsistencies never delete a package', async () => {
  const foreign = { ...version(), id: 1531288134 };
  const cases = [
    { active: json([]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { active: json([version(), foreign]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { active: json([foreign]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { active: json([{ ...version(), deleted_at: '2026-01-01T00:00:00Z' }]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { active: json([version()], 200, { Link: '<https://api.github.com/anything?page=2>; rel="next"' }), code: 'APPROVED_TEST_INVENTORY_PAGINATED' },
    { active: json([version()], 200, { Link: '<https://foreign.invalid/private>; rel="last"' }), code: 'APPROVED_TEST_INVENTORY_PAGINATED' },
    { active: json({ items: [version()] }), code: 'APPROVED_TEST_ACTIVE_VERSIONS_UNCONFIRMED' },
    { active: noContent(403), code: 'APPROVED_TEST_ACTIVE_VERSIONS_UNCONFIRMED' },
    { deleted: json([foreign]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { deleted: json([version()]), code: 'APPROVED_TEST_OTHER_VERSIONS_PRESENT' },
    { deleted: json([], 200, { Link: '<https://api.github.com/anything?page=2>; rel="next"' }), code: 'APPROVED_TEST_INVENTORY_PAGINATED' },
    { deleted: json({ items: [] }), code: 'APPROVED_TEST_DELETED_VERSIONS_UNCONFIRMED' },
    { deleted: noContent(403), code: 'APPROVED_TEST_DELETED_VERSIONS_UNCONFIRMED' },
  ];
  for (const c of cases) {
    const f = fixture([json(pkg()), json(version()), c.active ?? json([version()]), c.deleted ?? json([])]);
    const result = await failure(cleanupApprovedTestPackage(input(), f), c.code);
    assert.equal(f.calls.some(c => c.options.method === 'DELETE'), false);
    assert.equal(result.deleteAttempted, false); assert.equal(result.packageInventoryVerified, false);
    assert.equal(result.packageDeletionConfirmed, false);
  }
});

test('initial absence and denial stop; a package DELETE 204 alone never substitutes for the two absence checks', async () => {
  const cases = [
    { responses: [noContent(404)], code: 'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', deletes: 0 },
    { responses: [noContent(403)], code: 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED', deletes: 0 },
    { responses: [json(pkg()), noContent(404)], code: 'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', deletes: 0 },
    { responses: [json(pkg()), noContent(403)], code: 'APPROVED_TEST_VERSION_GET_UNCONFIRMED', deletes: 0 },
    { responses: [...beforeDelete(), noContent(403)], code: 'APPROVED_TEST_DELETE_UNCONFIRMED', deletes: 1 },
    { responses: [...beforeDelete(), noContent(202)], code: 'APPROVED_TEST_DELETE_UNCONFIRMED', deletes: 1 },
    { responses: [...beforeDelete(), noContent(204), noContent(403)], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
    { responses: [...beforeDelete(), noContent(204), json(pkg())], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
    { responses: [...beforeDelete(), noContent(204), noContent(404), noContent(403)], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
    { responses: [...beforeDelete(), noContent(204), noContent(404), json(version())], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
  ];
  for (const c of cases) {
    const f = fixture(c.responses), result = await failure(cleanupApprovedTestPackage(input(), f), c.code);
    assert.equal(f.calls.filter(c => c.options.method === 'DELETE').length, c.deletes);
    assert.equal(result.packageDeletionConfirmed, false); assert.equal(result.versionDeletionConfirmed, false);
    assert.equal(f.receipts.at(-1).result, 'failed');
    assert.equal(f.calls.some(c => c.options.method === 'DELETE' && c.url === versionUrl), false);
  }
  const f = fixture([new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid/' } })]);
  await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED');
  assert.equal(f.calls.length, 1);
});

test('a current 400 exposes only a closed diagnostic category, never the provider message or a fallback deletion', async () => {
  const sentinel = 'SYNTHETIC_PRIVATE_MUST_NOT_ESCAPE';
  const cases = [
    { message: "You cannot delete the last tagged version of a package. " + sentinel, expected: 'LAST_TAGGED_VERSION' },
    { message: 'Cannot delete a public package with more than 5,000 downloads. ' + sentinel, expected: 'DOWNLOAD_LIMIT' },
    { message: sentinel + ' https://private.invalid/?token=' + sentinel, expected: 'OTHER' },
    { message: 'x'.repeat(4097), expected: 'OTHER' },
  ];
  for (const c of cases) {
    const f = fixture([...beforeDelete(), json({ message: c.message, documentation_url: sentinel }, 400)]);
    const result = await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_DELETE_UNCONFIRMED');
    assert.equal(result.providerDeleteErrorCategory, c.expected);
    assert.equal(result.deleteResponseStatus, 400);
    assert.equal(f.calls.length, 5); assert.equal(f.calls.filter(c => c.options.method === 'DELETE').length, 1);
    assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(sentinel), false);
  }
});

test('a lost package DELETE response keeps an unknown outcome and never retries or exposes private transport detail', async () => {
  const sentinel = 'SYNTHETIC_PRIVATE_VALUE_MUST_NOT_ESCAPE';
  const f = fixture([...beforeDelete(), () => { throw Object.assign(new Error('https://private.invalid/' + sentinel), { code: sentinel, stack: sentinel }); }]);
  const result = await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_TRANSPORT_UNCONFIRMED');
  assert.equal(f.calls.length, 5); assert.equal(result.deleteAttempted, true); assert.equal(result.deletionMayHaveOccurred, true);
  assert.equal(result.deleteAcknowledged, false); assert.equal(result.deleteResponseStatus, null);
  assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(sentinel), false);
  assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(input().token), false);
});

test('recorder failure before package DELETE prevents mutation and oversized metadata cannot authorize cleanup', async () => {
  const stages = [];
  const recordFailure = fixture(beforeDelete(), { recordOverride: async receipt => {
    stages.push(receipt.stage); if (receipt.stage === 'DELETE_PACKAGE') throw new Error('SYNTHETIC_PRIVATE_RECORD_ERROR');
  } });
  const error = await failure(cleanupApprovedTestPackage(input(), recordFailure), 'APPROVED_TEST_TRACE_FAILED');
  assert.equal(stages.at(-1), 'DELETE_PACKAGE'); assert.equal(recordFailure.calls.length, 4);
  assert.equal(error.deleteAttempted, false); assert.equal(error.deletionMayHaveOccurred, false);
  assert.equal(error.packageDeletionConfirmed, false);
  let cancelled = 0;
  const huge = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel() { cancelled++; } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const f = fixture([huge]);
  await failure(cleanupApprovedTestPackage(input(), f), 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH');
  assert.equal(cancelled, 1); assert.equal(f.calls.length, 1);
});
