import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CookieJar, createHTTPSClient, requestHTTPS } from '../../scripts/deployment/http.mjs';
import { smokeArguments } from '../../scripts/deployment/smoke.mjs';

test('volatile session cookies preserve required flags without accepting another domain or exposing values', () => {
  const jar = new CookieJar('https://courses.localhost'), sentinel = 'SYNTHETIC_COOKIE_PRIVATE';
  jar.ingest([`SESSION=${sentinel}; Path=/; Secure; HttpOnly; SameSite=Lax`, 'foreign=refused; Domain=example.invalid; Path=/']);
  const session = jar.get('SESSION'); assert.ok(session.secure && session.httpOnly && session.sameSite === 'lax' && session.path === '/');
  assert.equal(jar.header().includes('foreign'), false); assert.equal(jar.header().includes(sentinel), true);
  assert.equal(JSON.stringify(jar).includes(sentinel), false); assert.equal(inspect(jar).includes(sentinel), false);
  jar.clear(); assert.equal(jar.header(), '');
});

test('cookie path boundaries and expiry prevent stale or unrelated headers', () => {
  const jar = new CookieJar('https://courses.localhost'); jar.ingest(['scoped=one; Path=/api; Secure', 'gone=zero; Path=/; Max-Age=0']);
  assert.equal(jar.header('/apix'), ''); assert.equal(jar.header('/api/item'), 'scoped=one'); assert.equal(jar.get('gone'), null);
  jar.ingest(['scoped=removed; Path=/api; Max-Age=0']); assert.equal(jar.header('/api'), '');
});

test('HTTPS origins, loopback override and relative request boundaries fail closed before any connection', async () => {
  assert.throws(() => createHTTPSClient({ origin: 'http://courses.localhost' }), /HTTPS_CONFIGURATION_INVALID/);
  assert.throws(() => createHTTPSClient({ origin: 'https://example.invalid', localLoopback: true }), /HTTPS_CONFIGURATION_INVALID/);
  const client = createHTTPSClient({ origin: 'https://courses.localhost', localLoopback: true });
  try {
    await assert.rejects(requestHTTPS(client, '//example.invalid/private'), /HTTPS_REQUEST_INVALID/);
    await assert.rejects(client.request('https://example.invalid/private'), /HTTPS_REQUEST_INVALID/);
    await assert.rejects(client.request('/fr', { headers: { Host: 'example.invalid' } }), /HTTPS_REQUEST_INVALID/);
  } finally { client.close(); }
});

test('smoke CLI preserves explicit TLS/Stripe mode while rejecting duplicate or unknown arguments', () => {
  const args = smokeArguments(['--origin', 'https://courses.localhost', '--local-loopback', 'true', '--stripe-enabled', 'false']);
  assert.equal(args.client.localLoopback, true); assert.equal(args.stripeEnabled, false);
  assert.throws(() => smokeArguments(['--origin', 'https://courses.localhost', '--origin', 'https://other.localhost']), /SMOKE_ARGUMENTS_INVALID/);
  assert.throws(() => smokeArguments(['--origin', 'https://courses.localhost', '--rejectUnauthorized', 'false']), /SMOKE_ARGUMENTS_INVALID/);
});

test('CLI configuration failures emit a safe JSON summary without private origin arguments', () => {
  const sentinel = 'SYNTHETIC_PRIVATE_ARGUMENT', script = fileURLToPath(new URL('../../scripts/deployment/smoke.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--origin', `https://user:${sentinel}@courses.localhost/?secret=${sentinel}`], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 1); assert.equal((result.stdout + result.stderr).includes(sentinel), false);
  const summary = JSON.parse(result.stdout); assert.equal(summary.result, 'failed'); assert.equal(summary.failedCheck, 'INITIAL_CONFIGURATION'); assert.deepEqual(summary.checks, []);
});
