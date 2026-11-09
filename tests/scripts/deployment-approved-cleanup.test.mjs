import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { approvedTestCleanupTarget as target, cleanupApprovedTestVersion } from '../../scripts/deployment/approved-test-cleanup.mjs';

const packageUrl = 'https://api.github.com/users/fonkoukevin/packages/container/chatgpt_courses%2Fweb';
const versionUrl = `${packageUrl}/versions/1531288133`;
const input = () => ({ approvedTestCleanup: true, environment: 'staging', guardPassed: true,
  sourceRepository: 'fonkoukevin/chatgpt_courses', imageRepository: 'ghcr.io/fonkoukevin/chatgpt_courses-private',
  token: 'SYNTHETIC_EPHEMERAL_JOB_TOKEN_ONLY' });
const pkg = () => ({ id: 123, name: 'chatgpt_courses/web', package_type: 'container', visibility: 'public',
  owner: { login: 'fonkoukevin' }, repository: { full_name: 'fonkoukevin/chatgpt_courses' } });
const version = () => ({ id: 1531288133, name: target.digest,
  metadata: { package_type: 'container', container: { tags: [target.tag] } } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noContent = status => new Response(null, { status });

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

test('approval, protected staging context, private replacement namespace and durable recorder are required before network', async () => {
  for (const change of [{ approvedTestCleanup: false }, { environment: 'production' }, { guardPassed: false },
    { sourceRepository: 'foreign/repository' }, { imageRepository: 'ghcr.io/fonkoukevin/chatgpt_courses' },
    { token: 'SYNTHETIC\nAuthorization:injected' }, { token: 'x'.repeat(4097) }, { arbitraryTarget: 'api' }]) {
    let calls = 0;
    await assert.rejects(cleanupApprovedTestVersion({ ...input(), ...change }, {
      request: async () => { calls++; throw new Error('must not run'); }, record: async () => {},
    }));
    assert.equal(calls, 0);
  }
  await failure(cleanupApprovedTestVersion(input(), { request: async () => { throw new Error('must not run'); } }), 'APPROVED_TEST_TRACE_REQUIRED');
  assert.equal(Object.isFrozen(target), true);
});

test('only the exact old web version is deleted once, with intent before DELETE and authenticated 404 afterwards', async () => {
  const env = input();
  const f = fixture([json(pkg()), json(version()), (_url, _options, receipts) => {
    assert.equal(receipts.at(-1).stage, 'DELETE'); assert.equal(receipts.at(-1).deletionMayHaveOccurred, true);
    assert.equal(receipts.at(-1).versionMetadataVerified, true); return noContent(204);
  }, noContent(404)]);
  const result = await cleanupApprovedTestVersion(env, f);
  assert.deepEqual(f.calls.map(c => [c.options.method, c.url]), [['GET', packageUrl], ['GET', versionUrl], ['DELETE', versionUrl], ['GET', versionUrl]]);
  for (const call of f.calls) {
    assert.equal(call.options.redirect, 'manual'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.signal instanceof AbortSignal, true);
    assert.equal(call.options.headers.Authorization, `Bearer ${env.token}`);
    assert.equal(call.options.headers['X-GitHub-Api-Version'], '2026-03-10');
    assert.equal(Object.hasOwn(call.options, 'body'), false);
  }
  assert.equal(result.result, 'passed'); assert.equal(result.deleteResponseStatus, 204);
  assert.equal(result.verificationGetStatus, 404); assert.equal(result.versionDeletionConfirmed, true);
  assert.equal(result.packageDeletionRequested, false); assert.equal(result.otherVersionDeletionRequested, false);
  assert.equal(result.residualPackageState, 'NOT_INSPECTED'); assert.equal(result.registryAndCdnCacheState, 'NOT_INSPECTED');
  assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(env.token), false);
  assert.equal(f.receipts.at(-1).stage, 'COMPLETE');
});

test('foreign, private, mismatched digest/version and extra or changed tags never reach DELETE', async () => {
  const badPackages = [{ ...pkg(), visibility: 'private' }, { ...pkg(), owner: { login: 'foreign' } },
    { ...pkg(), repository: { full_name: 'foreign/repository' } }, { ...pkg(), name: 'chatgpt_courses/api' },
    { ...pkg(), package_type: 'npm' }, { ...pkg(), id: '123' }];
  for (const body of badPackages) {
    const f = fixture([json(body)]);
    await failure(cleanupApprovedTestVersion(input(), f), 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH');
    assert.equal(f.calls.length, 1);
  }
  const badVersions = [{ ...version(), id: 1531288134 }, { ...version(), name: `sha256:${'0'.repeat(64)}` },
    { ...version(), metadata: { package_type: 'container', container: { tags: [target.tag, 'another-tag'] } } },
    { ...version(), metadata: { package_type: 'container', container: { tags: ['other-run'] } } },
    { ...version(), metadata: { package_type: 'container', container: { tags: [] } } },
    { ...version(), metadata: { package_type: 'npm', container: { tags: [target.tag] } } }];
  for (const body of badVersions) {
    const f = fixture([json(pkg()), json(body)]);
    await failure(cleanupApprovedTestVersion(input(), f), 'APPROVED_TEST_VERSION_IDENTITY_MISMATCH');
    assert.equal(f.calls.length, 2); assert.equal(f.calls.some(c => c.options.method === 'DELETE'), false);
  }
});

test('initial absence and 403 are failures; denied or ambiguous deletion and verification never retry destructively', async () => {
  const cases = [
    { responses: [noContent(404)], code: 'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', deletes: 0 },
    { responses: [noContent(403)], code: 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED', deletes: 0 },
    { responses: [json(pkg()), noContent(404)], code: 'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', deletes: 0 },
    { responses: [json(pkg()), noContent(403)], code: 'APPROVED_TEST_VERSION_GET_UNCONFIRMED', deletes: 0 },
    { responses: [json(pkg()), json(version()), noContent(403)], code: 'APPROVED_TEST_DELETE_UNCONFIRMED', deletes: 1 },
    { responses: [json(pkg()), json(version()), noContent(202)], code: 'APPROVED_TEST_DELETE_UNCONFIRMED', deletes: 1 },
    { responses: [json(pkg()), json(version()), noContent(204), noContent(403)], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
    { responses: [json(pkg()), json(version()), noContent(204), json(version())], code: 'APPROVED_TEST_DELETION_NOT_VERIFIED', deletes: 1 },
  ];
  for (const c of cases) {
    const f = fixture(c.responses), result = await failure(cleanupApprovedTestVersion(input(), f), c.code);
    assert.equal(f.calls.filter(c => c.options.method === 'DELETE').length, c.deletes);
    assert.equal(result.versionDeletionConfirmed, false);
    assert.equal(f.receipts.at(-1).result, 'failed');
  }
  const redirect = fixture([new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid/' } })]);
  await failure(cleanupApprovedTestVersion(input(), redirect), 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED');
  assert.equal(redirect.calls.length, 1);
});

test('a lost DELETE response preserves unknown outcome and safe intent without messages, stack, payload, or a second DELETE', async () => {
  const sentinel = 'SYNTHETIC_PRIVATE_VALUE_MUST_NOT_ESCAPE';
  const f = fixture([json(pkg()), json(version()), () => { throw Object.assign(new Error(`https://private.invalid/${sentinel}`), { code: sentinel, stack: sentinel }); }]);
  const result = await failure(cleanupApprovedTestVersion(input(), f), 'APPROVED_TEST_TRANSPORT_UNCONFIRMED');
  assert.equal(f.calls.length, 3); assert.equal(result.deleteAttempted, true); assert.equal(result.deletionMayHaveOccurred, true);
  assert.equal(result.deleteAcknowledged, false); assert.equal(result.deleteResponseStatus, null);
  assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(sentinel), false);
  assert.equal(JSON.stringify({ result, receipts: f.receipts }).includes(input().token), false);
});

test('recorder failure before DELETE prevents mutation; oversized metadata is cancelled and cannot authorize it', async () => {
  const calls = [];
  const recordFailure = fixture([json(pkg()), json(version())], { recordOverride: async receipt => {
    calls.push(receipt.stage); if (receipt.stage === 'DELETE') throw new Error('SYNTHETIC_PRIVATE_RECORD_ERROR');
  } });
  const error = await failure(cleanupApprovedTestVersion(input(), recordFailure), 'APPROVED_TEST_TRACE_FAILED');
  assert.equal(calls.at(-1), 'DELETE'); assert.equal(recordFailure.calls.length, 2);
  assert.equal(error.deleteAttempted, false); assert.equal(error.deletionMayHaveOccurred, false);
  assert.equal(error.versionDeletionConfirmed, false);
  let cancelled = 0;
  const huge = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel() { cancelled++; } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const f = fixture([huge]);
  await failure(cleanupApprovedTestVersion(input(), f), 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH');
  assert.equal(cancelled, 1); assert.equal(f.calls.length, 1);
});
