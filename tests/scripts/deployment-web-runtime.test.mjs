import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { decodeStagingPassword } from '../../scripts/container/web-entrypoint.mjs';

const runtime = new URL('../../scripts/container/web-entrypoint.mjs', import.meta.url).href;
const nextLog = new URL('../../node_modules/next/dist/build/output/log.js', import.meta.url).href;
const sentinel = 'SYNTHETIC_PRIVATE_SENTINEL_http_cookie_signed_uri';
function child(script) {
  const result = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '--eval', `import { installWebRuntimeLogging } from ${JSON.stringify(runtime)}; installWebRuntimeLogging(); ${script}`],
    { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(Boolean(result.error), false, 'The isolated Node probe must finish, not time out.');
  const output = result.stdout + result.stderr;
  assert.equal(output.includes(sentinel), false, 'No synthetic private value may be emitted.');
  const lines = output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.deepEqual(Object.keys(line).sort(), ['event', 'level', 'time']);
    assert.match(line.time, /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/); assert.ok(['debug', 'info', 'warn', 'error'].includes(line.level)); assert.match(line.event, /^WEB_[A-Z_]+$/);
  }
  return { result, lines };
}

test('runtime console formats, objects, stacks, labels and warning payloads stay outside JSON events', () => {
  const { result, lines } = child(`const value=${JSON.stringify(sentinel)};
    console.log('URI=%s', value); console.info({cookie:value}); console.warn(value); console.error(new Error(value));
    console.trace(value); console.dir({production:value}); console.table([{token:value}]); console.assert(false,value);
    console.time(value); console.timeEnd(value); process.emitWarning(value);
    const nextLog=(await import(${JSON.stringify(nextLog)})).default; nextLog.error(new Error(value));`);
  assert.equal(result.status, 0); assert.ok(lines.some(line => line.event === 'WEB_PROCESS_WARNING'));
  assert.ok(lines.some(line => line.event === 'WEB_CONSOLE_ERROR')); assert.ok(lines.some(line => line.event === 'WEB_ASSERTION_FAILED'));
});

test('uncaught exceptions keep a failing exit and never emit their private stack or message', () => {
  const { result, lines } = child(`setImmediate(()=>{throw new Error(${JSON.stringify(sentinel)})}); setTimeout(()=>console.log('still alive'),1000);`);
  assert.equal(result.status, 1); assert.deepEqual(lines.map(line => line.event), ['WEB_UNCAUGHT_EXCEPTION']);
});

test('unhandled rejections stop the process instead of leaving a healthy-looking server alive', () => {
  const { result, lines } = child(`Promise.reject(new Error(${JSON.stringify(sentinel)})); setTimeout(()=>console.log('still alive'),1000);`);
  assert.equal(result.status, 1); assert.deepEqual(lines.map(line => line.event), ['WEB_UNHANDLED_REJECTION']);
});

test('staging secret bytes preserve spaces and Unicode but reject NUL before process.env truncation', () => {
  const secret = `  ${'é'.repeat(24)}  `;
  assert.equal(decodeStagingPassword(Buffer.from(`${secret}\r\n`, 'utf8')), secret);
  assert.equal(decodeStagingPassword(Buffer.from('é'.repeat(256), 'utf8')).length, 256);
  for (const invalid of [Buffer.from(`${sentinel}\0not-the-same-password`), Buffer.from(`${sentinel}\nembedded`), Buffer.from(`${sentinel}:suffix`), Buffer.from('short'), Buffer.from('x'.repeat(257)), Buffer.from([0xff])]) {
    assert.throws(() => decodeStagingPassword(invalid), error => error.message.startsWith('STAGING_BASIC_PASSWORD_FILE:') && !error.message.includes(sentinel));
  }
});
