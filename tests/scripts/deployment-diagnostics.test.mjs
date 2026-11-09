import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ReadableStream } from 'node:stream/web';
import { safeReleaseFailure, inspectRegistryReadOnly, publicationStages } from '../../scripts/deployment/release-diagnostics.mjs';

const releaseUrl = new URL('../../scripts/deployment/release.mjs', import.meta.url);
const lines = readFileSync(releaseUrl, 'utf8').split(/\r?\n/u);
const input = () => ({ owner: 'synthetic-owner', repositoryName: 'synthetic_courses', token: 'SYNTHETIC_EPHEMERAL_JOB_TOKEN_42' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const metadata = (kind, changes = {}) => ({ name: `synthetic_courses/${kind}`, package_type: 'container', owner: { login: 'synthetic-owner' },
  repository: { full_name: 'synthetic-owner/synthetic_courses' }, visibility: 'private', version_count: 2, ...changes });

test('failure diagnostics expose only a fixed class/code and a real bounded release.mjs frame', () => {
  const secret = 'SYNTHETIC_PRIVATE_SENTINEL';
  const error = Object.assign(new TypeError(`${secret} https://private.invalid/?token=${secret}`), { code: secret,
    cause: Object.assign(new Error(secret), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    stack: `TypeError: ${secret}\n    at external (https://private.invalid/${secret}:9:9)\n    at publish (${releaseUrl.href}:1:2)\n    at main (${releaseUrl.href}:2:1)` });
  const result = safeReleaseFailure(error, 'CHECK_EXISTING_WEB');
  assert.deepEqual(result, { stage: 'CHECK_EXISTING_WEB', errorClass: 'TypeError', causeCode: 'UND_ERR_CONNECT_TIMEOUT', source: { file: 'release.mjs', line: 1, column: 2 } });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('https:'), false);
  assert.equal(JSON.stringify(result).includes('file:'), false);
  assert.equal(publicationStages.includes('DIGEST_API'), true);
});

test('cross-file frames, hostile properties and out-of-source line/column numbers never become public locations', () => {
  const badFrames = [`${releaseUrl.href.replace('release.mjs', 'foreign.mjs')}:1:1`, `${releaseUrl.href}.foreign:1:1`,
    `${releaseUrl.href}:0:1`, `${releaseUrl.href}:${lines.length + 1}:1`, `${releaseUrl.href}:1:0`, `${releaseUrl.href}:1:${lines[0].length + 2}`,
    `${releaseUrl.href}?token=SYNTHETIC_PRIVATE:1:1`, 'release.mjs:1:1'];
  for (const frame of badFrames) assert.equal(safeReleaseFailure({ name: 'SYNTHETIC_PRIVATE', code: 'SYNTHETIC_PRIVATE', stack: `Error\n    at ${frame}` }, 'SYNTHETIC_PRIVATE').source, null);
  assert.deepEqual(safeReleaseFailure(Object.defineProperties({}, { name: { get() { throw new Error('SYNTHETIC_PRIVATE'); } }, stack: { get() { throw new Error('SYNTHETIC_PRIVATE'); } }, cause: { get() { throw new Error('SYNTHETIC_PRIVATE'); } } }), 'NOT_ALLOWED'), { stage: 'UNKNOWN', errorClass: 'OTHER', causeCode: 'NONE', source: null });
  assert.deepEqual(safeReleaseFailure({ name: 'SyntaxError', stack: `Error\n    at ${fileURLToPath(releaseUrl)}:1:1` }, 'DIGEST_WEB').source, { file: 'release.mjs', line: 1, column: 1 });
  const cycle = { name: 'Error' }; cycle.cause = cycle;
  assert.equal(safeReleaseFailure(cycle, 'GUARD').causeCode, 'NONE');
  let chain = { code: 'ECONNRESET' }; for (let i = 0; i < 8; i++) chain = { cause: chain };
  assert.equal(safeReleaseFailure(chain, 'GUARD').causeCode, 'NONE');
});

test('registry diagnosis makes exactly four fixed GETs using one job token, manual redirects and no fallback or retry', async () => {
  const calls = [], env = input(); let deniedBodiesCancelled = 0;
  const rows = await inspectRegistryReadOnly(env, { request: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual'); assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(options.headers.Authorization, `Bearer ${env.token}`); assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
    const kind = url.endsWith('%2Fweb') ? 'web' : 'api';
    return url.includes('/user/') ? json(metadata(kind)) : new Response(new ReadableStream({
      start(controller) { controller.enqueue(Buffer.from(JSON.stringify({ visibility: 'private', message: env.token }))); },
      cancel() { deniedBodiesCancelled++; },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  } });
  assert.equal(calls.length, 4);
  assert.equal(deniedBodiesCancelled, 2);
  assert.deepEqual(calls.map(c => c.url), [
    'https://api.github.com/user/packages/container/synthetic_courses%2Fweb', 'https://api.github.com/user/packages/container/synthetic_courses%2Fapi',
    'https://api.github.com/users/synthetic-owner/packages/container/synthetic_courses%2Fweb', 'https://api.github.com/users/synthetic-owner/packages/container/synthetic_courses%2Fapi']);
  assert.equal(rows[0].visibility, 'private'); assert.equal(rows[0].identityMatches, true); assert.equal(rows[0].repoMatches, true); assert.equal(rows[0].safeVersionCount, 2);
  assert.equal(rows[2].status, 403); assert.equal(rows[2].visibility, 'UNKNOWN'); assert.equal(rows[2].identityMatches, false); assert.equal(rows[2].safeVersionCount, null);
  assert.equal(JSON.stringify(rows).includes(env.token), false);
  assert.equal(rows.every(row => Object.keys(row).toSorted().join(',') === 'identityMatches,kind,redirectSameOrigin,repoMatches,routeKind,safeVersionCount,status,visibility'), true);
});

test('redirects, 404 and unreadable or contaminated bodies stay unknown; metadata identity remains independent of a private label', async () => {
  const env = input(); let calls = 0;
  const rows = await inspectRegistryReadOnly(env, { request: async () => {
    calls++;
    if (calls === 1) return new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid/private?token=SYNTHETIC_PRIVATE' } });
    if (calls === 2) return new Response(null, { status: 307, headers: { Location: '/users/synthetic-owner/packages/container/synthetic_courses%2Fapi' } });
    if (calls === 3) return json({ visibility: 'private', version_count: 99 }, 404);
    return new Response('SYNTHETIC_PRIVATE HTML', { status: 200, headers: { 'Content-Type': 'text/html' } });
  } });
  assert.equal(calls, 4); assert.deepEqual(rows.map(row => row.redirectSameOrigin), [false, true, null, null]);
  assert.equal(rows.every(row => row.visibility === 'UNKNOWN' && !row.identityMatches && !row.repoMatches && row.safeVersionCount === null), true);
  assert.equal(JSON.stringify(rows).includes('SYNTHETIC_PRIVATE'), false);
  const mismatched = await inspectRegistryReadOnly(env, { request: async () => json(metadata('web', { owner: { login: 'foreign-owner' }, repository: { full_name: 'foreign/repository' }, visibility: 'private', version_count: '2' })) });
  assert.equal(mismatched.every(row => row.visibility === 'private' && !row.identityMatches && !row.repoMatches && row.safeVersionCount === null), true);
});

test('input injection is rejected before any request and transport or invalid JSON failures never retry or expose payloads', async () => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('SYNTHETIC_PRIVATE'); };
  for (const changes of [{ owner: 'owner/foreign' }, { owner: '-bad' }, { repositoryName: '../foreign' }, { repositoryName: 'repo?token=private' },
    { token: 'SYNTHETIC_PRIVATE\nAuthorization:value' }, { token: '' }, { extra: 'SYNTHETIC_PRIVATE' }]) {
    await assert.rejects(inspectRegistryReadOnly({ ...input(), ...changes }, { request }), error => error.code === 'RELEASE_DIAGNOSTIC_CONFIGURATION_INVALID');
  }
  assert.equal(calls, 0);
  const failed = await inspectRegistryReadOnly(input(), { request }); assert.equal(calls, 4);
  assert.equal(failed.every(row => row.status === null && row.visibility === 'UNKNOWN'), true);
  calls = 0;
  const unreadable = await inspectRegistryReadOnly(input(), { request: async () => { calls++; return new Response('SYNTHETIC_PRIVATE'.repeat(20000), { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
  assert.equal(calls, 4); assert.equal(unreadable.every(row => row.visibility === 'UNKNOWN' && row.safeVersionCount === null), true);
  assert.equal(JSON.stringify({ failed, unreadable }).includes('SYNTHETIC_PRIVATE'), false);
});
