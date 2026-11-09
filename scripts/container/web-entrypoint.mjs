import { closeSync, fstatSync, openSync, readSync, writeSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const invalidSecret = () => new Error('STAGING_BASIC_PASSWORD_FILE: a readable regular UTF-8 secret file containing a valid staging password is required.');
let logsInstalled = false;
const levels = new Set(['debug', 'info', 'warn', 'error']);
const consoleLevels = {
  log: 'info', info: 'info', debug: 'debug', warn: 'warn', error: 'error', trace: 'error',
  dir: 'info', dirxml: 'info', table: 'info', count: 'info', countReset: 'info',
  time: 'debug', timeEnd: 'debug', timeLog: 'debug', timeStamp: 'debug',
  group: 'info', groupCollapsed: 'info', groupEnd: 'info', clear: 'debug', profile: 'debug', profileEnd: 'debug',
};
const events = new Set([...Object.keys(consoleLevels).map(method => `WEB_CONSOLE_${method.toUpperCase()}`),
  'WEB_ASSERTION_FAILED', 'WEB_PROCESS_WARNING', 'WEB_STARTUP_FAILED', 'WEB_UNCAUGHT_EXCEPTION', 'WEB_UNHANDLED_REJECTION', 'WEB_RUNTIME_EVENT']);

function event(level, name) {
  const safeLevel = levels.has(level) ? level : 'error', safeEvent = events.has(name) ? name : 'WEB_RUNTIME_EVENT';
  // Sync writes preserve the one fatal event before exit, without formatting
  // arbitrary arguments, objects, request URLs, error messages or stacks.
  try { writeSync(safeLevel === 'warn' || safeLevel === 'error' ? 2 : 1, JSON.stringify({ time: new Date().toISOString(), level: safeLevel, event: safeEvent }) + '\n'); }
  catch { process.exit(1); }
}

export function installWebRuntimeLogging() {
  if (logsInstalled) return; logsInstalled = true;
  for (const [method, level] of Object.entries(consoleLevels)) if (typeof console[method] === 'function') console[method] = () => event(level, `WEB_CONSOLE_${method.toUpperCase()}`);
  console.assert = condition => { if (!condition) event('error', 'WEB_ASSERTION_FAILED'); };
  process.on('warning', () => event('warn', 'WEB_PROCESS_WARNING'));
  process.on('uncaughtException', () => { event('error', 'WEB_UNCAUGHT_EXCEPTION'); process.exit(1); });
  process.on('unhandledRejection', () => { event('error', 'WEB_UNHANDLED_REJECTION'); process.exit(1); });
}

export function decodeStagingPassword(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length > 1026) throw invalidSecret();
    let value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (value.endsWith('\r\n')) value = value.slice(0, -2); else if (value.endsWith('\n')) value = value.slice(0, -1);
    // NUL must be rejected before assigning process.env, which can truncate it.
    if (value.length < 24 || value.length > 256 || /[\0\r\n:]/.test(value)) throw invalidSecret();
    return value;
  } catch { throw invalidSecret(); }
}

/** Only this web secret is materialized in process memory, never in an image. */
export function loadStagingPassword(env = process.env) {
  const file = env.STAGING_BASIC_PASSWORD_FILE;
  if (!file) {
    if (env.APP_ENV === 'staging') throw invalidSecret();
    return;
  }
  if (!posix.isAbsolute(file) || posix.normalize(file) !== file || !file.startsWith('/run/secrets/') || env.STAGING_BASIC_PASSWORD) throw invalidSecret();
  let descriptor;
  try {
    descriptor = openSync(file, 'r');
    if (!fstatSync(descriptor).isFile()) throw invalidSecret();
    // 256 UTF-16 characters need at most 1024 UTF-8 bytes; allow one CRLF.
    const bytes = Buffer.alloc(1027); let length = 0;
    while (length < bytes.length) { const count = readSync(descriptor, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
    env.STAGING_BASIC_PASSWORD = decodeStagingPassword(bytes.subarray(0, length));
  } catch { throw invalidSecret(); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installWebRuntimeLogging();
  try {
    loadStagingPassword();
    // Import the generated server in this process so Node stays PID1 and Next
    // receives normal SIGTERM/SIGINT lifecycle events without a child shell.
    await import('/app/apps/web/server.js');
  } catch {
    event('error', 'WEB_STARTUP_FAILED');
    process.exit(1);
  }
}
