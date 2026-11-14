import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { releaseRequest, requireGhcrPackage, requireGhcrAnonymousDigestReadable } from '../../scripts/deployment/release.mjs';

const fixture = fileURLToPath(new URL('../fixtures/deployment/http-stale-server.mjs', import.meta.url));
const synthetic = 'SYNTHETIC_RELEASE_HTTP_TOKEN_42';
async function message(child) {
  const [value] = await once(child, 'message', { signal: AbortSignal.timeout(5000) }); return value;
}
async function withServer(status, action) {
  const child = spawn(process.execPath, [fixture, String(status)], { env: {}, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    const { port } = await message(child); assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
    return await action(`http://127.0.0.1:${port}`, async () => { const pending = message(child); child.send('report'); return pending; });
  } finally {
    const stopped = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
    if (child.connected) child.send('stop');
    await stopped;
  }
}
function blockClientEventLoop() {
  const child = spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,400)'],
    { env: {}, stdio: 'ignore', windowsHide: true, timeout: 5000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0);
}

test('an idle connection reset during a real blocking child fails once; release HTTP opens fresh connections without retry', async () => {
  const outcomes = [];
  for (const request of [fetch, releaseRequest]) outcomes.push(await withServer(200, async (origin, report) => {
    let attempts = 0;
    const call = async () => { attempts++; const response = await request(origin, { redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${synthetic}` } }); assert.equal(response.status, 200); await response.text(); };
    await call(); await new Promise(setImmediate); blockClientEventLoop();
    let failure = null; try { await call(); } catch (error) { failure = error.cause?.code ?? 'OTHER'; }
    return { attempts, failure, ...await report() };
  }));
  const [pooled, fresh] = outcomes;
  assert.equal(pooled.attempts, 2); assert.ok(['ECONNRESET', 'UND_ERR_SOCKET'].includes(pooled.failure));
  assert.equal(pooled.resets, 1); assert.equal(pooled.connections, 1); assert.equal(pooled.rows.length, 1);
  assert.equal(fresh.attempts, 2); assert.equal(fresh.failure, null); assert.equal(fresh.connections, 2); assert.equal(fresh.rows.length, 2);
  assert.notEqual(fresh.rows[0].connection, fresh.rows[1].connection);
  assert.ok(fresh.rows.every(row => row.closeRequested && row.syntheticAuthorizationMatched));
});

test('fresh release HTTP preserves exact status authorization guards and never retries401 or403', async () => {
  const env = { GITHUB_REPOSITORY: 'fonkoukevin/chatgpt_courses', IMAGE_REPOSITORY: 'ghcr.io/fonkoukevin/chatgpt_courses',
    GITHUB_ACTOR: 'fonkoukevin', GITHUB_TOKEN: synthetic, EXPECTED_SOURCE_VISIBILITY: 'public', EXPECTED_IMAGE_VISIBILITY: 'public' };
  for (const status of [401, 403]) for (const kind of ['metadata', 'anonymousDigest']) await withServer(status, async (origin, report) => {
    let attempts = 0;
    const request = (address, options) => { attempts++; assert.ok(['api.github.com', 'ghcr.io'].includes(new URL(address).hostname)); return releaseRequest(origin, options); };
    const operation = kind === 'metadata' ? requireGhcrPackage(env, 'web', { request })
      : requireGhcrAnonymousDigestReadable('ghcr.io/fonkoukevin/chatgpt_courses/web', 'sha256:' + 'a'.repeat(64), request);
    await assert.rejects(operation, { code: kind === 'metadata' ? 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE' : 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED' });
    const facts = await report(); assert.equal(attempts, 1); assert.equal(facts.rows.length, 1); assert.equal(facts.connections, 1);
    assert.equal(facts.rows[0].closeRequested, true); assert.equal(facts.rows[0].syntheticAuthorizationMatched, kind === 'metadata');
  });
});
