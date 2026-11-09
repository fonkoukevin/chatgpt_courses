import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { connect, createServer } from 'node:net';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createBrowserControlEndpoint } from '../../scripts/lib/browser-control-endpoint.mjs';

async function listen(server, path) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
}
async function close(server) {
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function command(path, token) {
  return new Promise((resolve, reject) => {
    const socket = connect(path); let input = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('SYNTHETIC_IPC_TIMEOUT')));
    socket.once('error', reject); socket.once('connect', () => socket.end(JSON.stringify({ token }) + '\n'));
    socket.on('data', bytes => { input += bytes.toString('utf8'); });
    socket.once('end', () => { try { resolve(JSON.parse(input)); } catch { reject(new Error('SYNTHETIC_IPC_RESPONSE_INVALID')); } });
  });
}

test('control endpoint is private, unique and completes real native IPC with a rejected wrong token', async () => {
  const endpoint = createBrowserControlEndpoint(), second = createBrowserControlEndpoint(), token = randomBytes(32).toString('hex');
  assert.notEqual(endpoint.path, second.path); second.cleanup();
  const sockets = new Set(), server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    let input = ''; socket.on('data', bytes => {
      input += bytes.toString('utf8'); if (!input.includes('\n')) return;
      let accepted = false; try { accepted = JSON.parse(input.trim()).token === token; } catch {}
      socket.end(JSON.stringify({ ok: accepted, result: accepted ? 'SYNTHETIC_CONFIRMED' : 'SYNTHETIC_DENIED' }) + '\n');
    });
  });
  try {
    if (process.platform === 'win32') assert.match(endpoint.path, /^\\\\\.\\pipe\\courses-browser-[a-f0-9-]{36}$/);
    else {
      assert.ok(Buffer.byteLength(endpoint.path) <= 103);
      const stat = lstatSync(dirname(endpoint.path)); assert.equal(stat.mode & 0o7777, 0o700); assert.equal(stat.uid, process.geteuid());
    }
    await listen(server, endpoint.path);
    assert.deepEqual(await command(endpoint.path, 'synthetic-wrong-token'), { ok: false, result: 'SYNTHETIC_DENIED' });
    assert.deepEqual(await command(endpoint.path, token), { ok: true, result: 'SYNTHETIC_CONFIRMED' });
  } finally {
    for (const socket of sockets) socket.destroy(); await close(server); endpoint.cleanup();
  }
  endpoint.cleanup(); // Idempotent only after verified removal.
  if (process.platform !== 'win32') assert.equal(existsSync(dirname(endpoint.path)), false);
});

test('named-pipe selection performs no filesystem cleanup and invalid options fail closed', () => {
  const endpoint = createBrowserControlEndpoint({ windows: true });
  assert.match(endpoint.path, /^\\\\\.\\pipe\\courses-browser-[a-f0-9-]{36}$/); endpoint.cleanup(); endpoint.cleanup();
  for (const value of [null, [], { windows: 'false' }, { directory: '/tmp/arbitrary' }]) assert.throws(() => createBrowserControlEndpoint(value), { code: 'BROWSER_CONTROL_OPTIONS_INVALID' });
});

if (process.platform !== 'win32') {
  test('Unix cleanup refuses an open socket and foreign contents without deleting them', async () => {
    const endpoint = createBrowserControlEndpoint(), directory = dirname(endpoint.path), server = createServer();
    try {
      await listen(server, endpoint.path);
      assert.throws(() => endpoint.cleanup(), { code: 'BROWSER_CONTROL_DIRECTORY_NOT_EMPTY_OR_SERVER_OPEN' });
      assert.equal(lstatSync(endpoint.path).isSocket(), true); await close(server);
      const sentinel = join(directory, 'unowned-content'); writeFileSync(sentinel, 'synthetic-only', { flag: 'wx', mode: 0o600 });
      assert.throws(() => endpoint.cleanup(), { code: 'BROWSER_CONTROL_DIRECTORY_NOT_EMPTY_OR_SERVER_OPEN' });
      assert.equal(readFileSync(sentinel, 'utf8'), 'synthetic-only'); unlinkSync(sentinel);
    } finally { await close(server); endpoint.cleanup(); }
    assert.equal(existsSync(directory), false);
  });

  test('Unix cleanup refuses directory replacement, changed permissions and a symlink swap', () => {
    const endpoint = createBrowserControlEndpoint(), directory = dirname(endpoint.path), moved = directory + '-held';
    try {
      chmodSync(directory, 0o755);
      assert.throws(() => endpoint.cleanup(), { code: 'BROWSER_CONTROL_DIRECTORY_IDENTITY_CHANGED' }); chmodSync(directory, 0o700);
      renameSync(directory, moved); mkdirSync(directory, { mode: 0o700 });
      assert.throws(() => endpoint.cleanup(), { code: 'BROWSER_CONTROL_DIRECTORY_IDENTITY_CHANGED' });
      assert.equal(existsSync(directory), true); assert.equal(existsSync(moved), true); rmdirSync(directory);
      symlinkSync(moved, directory, 'dir');
      assert.throws(() => endpoint.cleanup(), { code: 'BROWSER_CONTROL_DIRECTORY_IDENTITY_CHANGED' });
      assert.equal(lstatSync(directory).isSymbolicLink(), true); unlinkSync(directory); renameSync(moved, directory);
    } finally {
      // Restore only the exact directory this test created; never recursively remove.
      if (existsSync(moved) && !existsSync(directory)) renameSync(moved, directory);
      endpoint.cleanup();
    }
    assert.equal(existsSync(directory), false);
  });
}
