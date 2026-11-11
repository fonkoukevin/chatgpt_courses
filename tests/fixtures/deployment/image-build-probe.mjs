// The real image CLI with in-memory Docker/Git/filesystem adapters. No build,
// network request, private env file or disk mutation occurs.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const scenario = JSON.parse(process.argv[2]), commit = 'a'.repeat(40), sourceUrl = 'https://github.com/synthetic-owner/synthetic_courses';
const moduleUrl = new URL('../../../scripts/deployment/images.mjs', import.meta.url);
const files = new Map(), descriptors = new Map(), commands = [];
const originals = Object.fromEntries(['readFileSync', 'openSync', 'closeSync', 'fstatSync', 'readSync'].map(key => [key, fs[key]]));
let descriptor = 424200;
Object.assign(fs, {
  mkdirSync() {},
  readFileSync(path, encoding) { return files.has(String(path)) ? encoding ? files.get(String(path)).toString(encoding) : files.get(String(path)) : originals.readFileSync(path, encoding); },
  writeFileSync(path, bytes) { files.set(String(path), Buffer.from(bytes)); },
  openSync(path, flags, ...rest) {
    if (String(path).endsWith('.log')) { const fd = descriptor++; descriptors.set(fd, String(path)); if (flags === 'w') files.set(String(path), Buffer.alloc(0)); return fd; }
    return originals.openSync(path, flags, ...rest);
  },
  closeSync(fd) { if (!descriptors.has(fd)) originals.closeSync(fd); },
  fstatSync(fd) { return descriptors.has(fd) ? { isFile: () => true, nlink: 1, size: files.get(descriptors.get(fd)).length } : originals.fstatSync(fd); },
  readSync(fd, target, offset, length, position) { return descriptors.has(fd) ? files.get(descriptors.get(fd)).copy(target, offset, position, position + length) : originals.readSync(fd, target, offset, length, position); },
});
childProcess.execFileSync = (file, args) => {
  if (file === 'git') {
    if (scenario.gitUnavailable) throw Object.assign(new Error('SYNTHETIC_PRIVATE_ERROR'), { status: 128, stderr: 'fatal: not a git repository: SYNTHETIC_PRIVATE_PATH' });
    if (args[0] === 'rev-parse') return commit;
    if (args[0] === 'status') return scenario.dirty ? ' M SYNTHETIC_PRIVATE_INPUT' : '';
  }
  if (file === 'docker' && args[0] === 'image') return JSON.stringify([{ Config: { User: '10001:10001', Labels: { 'org.opencontainers.image.revision': commit, 'org.opencontainers.image.source': sourceUrl } }, Size: 100, Architecture: 'amd64' }]);
  throw new Error('UNEXPECTED_COMMAND');
};
childProcess.spawn = (file, args, options) => {
  if (file !== 'docker' || args[0] !== 'build') throw new Error('UNEXPECTED_BUILD');
  const service = args[args.indexOf('--file') + 1].includes('/web/') ? 'web' : 'api'; commands.push(service);
  const emitter = new EventEmitter();
  queueMicrotask(() => {
    if (scenario.spawnFailure) { emitter.emit('error', Object.assign(new Error('SYNTHETIC_PRIVATE_SPAWN'), { code: 'ENOENT' })); emitter.emit('close', -2, null); return; }
    if (scenario.serviceFailure === service) {
      files.set(descriptors.get(options.stdio[1]), Buffer.from('SYNTHETIC_PRIVATE_SECRET\n' + (scenario.large ? 'S'.repeat(300000) : '') + (scenario.log ?? 'unknown build failure')));
      emitter.emit('close', scenario.exitCode ?? 1, scenario.signal ?? null); return;
    }
    files.set(args[args.indexOf('--iidfile') + 1], Buffer.from('sha256:' + 'b'.repeat(64))); emitter.emit('close', 0, null);
  });
  return emitter;
};
syncBuiltinESMExports();
process.argv = [process.execPath, fileURLToPath(moduleUrl), 'build', '--commit', commit, '--source-url', sourceUrl, '--output', 'SYNTHETIC_BUILD_OUTPUT', '--diagnostic-output', 'SYNTHETIC_DIAGNOSTIC_OUTPUT'];
await import(moduleUrl.href);
console.log('IMAGE_BUILD_PROBE ' + JSON.stringify({ exitCode: process.exitCode ?? 0, commands,
  diagnostic: files.has('SYNTHETIC_DIAGNOSTIC_OUTPUT') ? JSON.parse(files.get('SYNTHETIC_DIAGNOSTIC_OUTPUT')) : null,
  report: files.has('SYNTHETIC_BUILD_OUTPUT') ? JSON.parse(files.get('SYNTHETIC_BUILD_OUTPUT')) : null }));
