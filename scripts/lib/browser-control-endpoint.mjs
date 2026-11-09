import { randomUUID } from 'node:crypto';
import { constants as F, chmodSync, closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readdirSync, realpathSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

const maxUnixPathBytes = 103;
function refuse(code) { const error = new Error(code); error.code = code; return error; }
function requireEndpoint(condition, code) { if (!condition) throw refuse(code); }
function sameDirectory(actual, expected, owner) {
  return actual.isDirectory() && !actual.isSymbolicLink() && actual.dev === expected.dev && actual.ino === expected.ino
    && actual.uid === owner && actual.gid === expected.gid && actual.nlink === expected.nlink && (actual.mode & 0o7777n) === 0o700n;
}

/**
 * IPC only. The caller retains the token protocol and must close the server and
 * connected sockets before cleanup(). No recursive deletion or stale-socket
 * unlink is attempted. A refused cleanup leaves the private directory intact.
 */
export function createBrowserControlEndpoint(options = {}) {
  requireEndpoint(options !== null && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).every(key => key === 'windows') && (options.windows === undefined || typeof options.windows === 'boolean'), 'BROWSER_CONTROL_OPTIONS_INVALID');
  const windows = options.windows ?? process.platform === 'win32';
  if (windows) return Object.freeze({ path: `\\\\.\\pipe\\courses-browser-${randomUUID()}`, cleanup() {} });
  requireEndpoint(process.platform !== 'win32' && typeof process.geteuid === 'function', 'BROWSER_CONTROL_UNIX_PLATFORM_REQUIRED');

  // Do not use the checkout path or inherited TMPDIR: both can exceed sun_path.
  // /tmp may itself be a platform symlink; retain its canonical parent instead.
  let directory, descriptor, initial, closed = false;
  const owner = BigInt(process.geteuid());
  function verifyOwnedDirectory() {
    requireEndpoint(sameDirectory(fstatSync(descriptor, { bigint: true }), initial, owner)
      && sameDirectory(lstatSync(directory, { bigint: true }), initial, owner)
      && realpathSync(directory) === directory, 'BROWSER_CONTROL_DIRECTORY_IDENTITY_CHANGED');
  }
  function cleanup() {
    if (closed) return;
    try {
      verifyOwnedDirectory();
      requireEndpoint(readdirSync(directory).length === 0, 'BROWSER_CONTROL_DIRECTORY_NOT_EMPTY_OR_SERVER_OPEN');
      rmdirSync(directory); // Empty, exact owned directory only. Never recursive.
      closeSync(descriptor); closed = true;
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('BROWSER_CONTROL_')) throw error;
      throw refuse('BROWSER_CONTROL_CLEANUP_FAILED');
    }
  }
  try {
    directory = mkdtempSync(join(realpathSync('/tmp'), 'ccb-'));
    chmodSync(directory, 0o700);
    descriptor = openSync(directory, F.O_RDONLY | F.O_DIRECTORY | F.O_NOFOLLOW);
    initial = fstatSync(descriptor, { bigint: true }); verifyOwnedDirectory();
    const path = join(directory, 'control.sock');
    requireEndpoint(Buffer.byteLength(path, 'utf8') <= maxUnixPathBytes, 'BROWSER_CONTROL_UNIX_PATH_TOO_LONG');
    return Object.freeze({ path, cleanup });
  } catch (error) {
    // Remove only an identity-checked empty directory created by this call.
    // If identity cannot be established, retain it rather than guessing.
    if (descriptor !== undefined && initial) {
      try { cleanup(); } catch { try { closeSync(descriptor); } catch {} }
    } else if (descriptor !== undefined) { try { closeSync(descriptor); } catch {} }
    if (typeof error?.code === 'string' && error.code.startsWith('BROWSER_CONTROL_')) throw error;
    throw refuse('BROWSER_CONTROL_CREATION_FAILED');
  }
}
