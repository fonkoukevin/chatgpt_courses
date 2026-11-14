import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { classifyDeploymentCommandLog, deploymentCommandCauses, deploymentCommandFailure, deploymentStages, readDeploymentCommandLog, safeDeploymentFailure } from '../../scripts/deployment/release-diagnostics.mjs';

const maximum = 1024 * 1024, sentinel = 'SYNTHETIC_PRIVATE_DEPLOY_DIAGNOSTIC_NEVER_EXPORT';
const unavailable = { logReadStatus: 'UNAVAILABLE', observedCauses: [] };
const clean = value => { const encoded = JSON.stringify(value); for (const token of [sentinel, 'https://', 'ghp_SYNTHETIC', 'whsec_SYNTHETIC', 'BEGIN PRIVATE KEY']) assert.equal(encoded.includes(token), false); return value; };
function withFixture(action) {
  const parent = realpathSync(tmpdir()), directory = mkdtempSync(join(parent, 'courses-release-deploy-diag-'));
  const file = (name, bytes) => { const path = join(directory, name); writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); return path; };
  try { return action({ directory, file }); }
  finally {
    // Recursive cleanup is confined to this exact newly created fixture root.
    const absolute = resolve(directory);
    assert.equal(realpathSync(dirname(absolute)), parent);
    assert.match(basename(absolute), /^courses-release-deploy-diag-[A-Za-z0-9]+$/u);
    assert.equal(lstatSync(absolute).isDirectory(), true);
    assert.equal(lstatSync(absolute).isSymbolicLink(), false);
    rmSync(absolute, { recursive: true, force: true });
  }
}

test('deployment classifier recognizes fixed SSH transport, target and native failure templates without retaining their text', () => {
  const examples = [
    ['SSH_AUTHENTICATION_REJECTED', 'synthetic@staging.invalid: Permission denied (publickey).'],
    ['SSH_AUTHENTICATION_REJECTED', 'Permission denied (publickey,password,keyboard-interactive).'],
    ['SSH_HOST_KEY_REJECTED', 'Host key verification failed.'],
    ['SSH_HOST_KEY_REJECTED', '@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @'],
    ['SSH_CONNECTION_TIMEOUT', 'ssh: connect to host staging.invalid port 22: Connection timed out'],
    ['SSH_CONNECTION_TIMEOUT', 'ssh: connect to host staging.invalid port 22: Operation timed out'],
    ['SSH_CONNECTION_REFUSED', 'ssh: connect to host staging.invalid port 22: Connection refused'],
    ['SSH_DNS_FAILED', 'ssh: Could not resolve hostname staging.invalid: Name or service not known'],
    ['SCP_SUBSYSTEM_UNAVAILABLE', 'subsystem request failed on channel 0'],
    ['SCP_SUBSYSTEM_UNAVAILABLE', 'subsystem not found'],
    ['TARGET_PERMISSION_DENIED', "mkdir: cannot create directory '/synthetic/incoming': Permission denied"],
    ['TARGET_PERMISSION_DENIED', 'scp: dest open "/synthetic/release.tar": Permission denied'],
    ['TARGET_PERMISSION_DENIED', 'tar: /synthetic/release: Permission denied'],
    ['DISK_FULL', 'tar: /synthetic/release: No space left on device'],
    ['REMOTE_COMMAND_FAILED', 'RELEASE_REMOTE_COMMAND_FAILED\n'],
    ['REMOTE_LOCK_ALREADY_HELD', 'RELEASE_REMOTE_LOCK_ALREADY_HELD\r\n'],
  ];
  for (const [cause, template] of examples) {
    const input = `${sentinel} https://synthetic.invalid/?token=ghp_SYNTHETIC whsec_SYNTHETIC\n${template}\n${sentinel}`;
    assert.deepEqual(clean(classifyDeploymentCommandLog(input)), [cause]);
  }
});

test('classifier emits each enum once in stable allowlist order and refuses unknown or unbounded input', () => {
  const templates = 'Permission denied (publickey)\nHost key verification failed\nOperation timed out\nssh: connect to host synthetic.invalid port 22: Connection refused\nCould not resolve hostname synthetic.invalid\nsubsystem not found\nmkdir: /synthetic: Permission denied\nNo space left on device\nRELEASE_REMOTE_COMMAND_FAILED\nRELEASE_REMOTE_LOCK_ALREADY_HELD\n';
  assert.deepEqual(classifyDeploymentCommandLog(templates + templates), [...deploymentCommandCauses]);
  for (const input of [null, undefined, 1, {}, [], new String(templates), 'Permission denied', 'Connection refused', 'RELEASE_REMOTE_UNKNOWN_CODE', 'prefix RELEASE_REMOTE_COMMAND_FAILED', 'RELEASE_REMOTE_COMMAND_FAILED suffix']) assert.deepEqual(clean(classifyDeploymentCommandLog(input)), []);
  assert.deepEqual(classifyDeploymentCommandLog(templates + 'x'.repeat(maximum)), []);
  assert.deepEqual(classifyDeploymentCommandLog('€'.repeat(Math.floor(maximum / 3) + 1) + templates), []);
  assert.deepEqual(classifyDeploymentCommandLog({ toString() { throw Error(sentinel); } }), []);
});

test('real command log offsets exclude previous commands even with multibyte prefixes and no new output', () => withFixture(({ file }) => {
  const history = Buffer.from('Ancien journal synthétique éè.\nPermission denied (publickey)\nNo space left on device\n'), current = Buffer.from(`Host key verification failed\n${sentinel}\n`);
  const path = file('commands.log', Buffer.concat([history, current]));
  assert.deepEqual(clean(readDeploymentCommandLog(path, history.length)), { logReadStatus: 'READ', observedCauses: ['SSH_HOST_KEY_REJECTED'] });
  assert.deepEqual(readDeploymentCommandLog(path, history.length + current.length), { logReadStatus: 'READ', observedCauses: [] });
  const oldOnly = file('old-only.log', history);
  assert.deepEqual(readDeploymentCommandLog(oldOnly, history.length), { logReadStatus: 'READ', observedCauses: [] });
}));

test('real log tail is bounded to one MiB of the current command and reports truncation explicitly', () => withFixture(({ file }) => {
  const history = Buffer.from('Host key verification failed\n'), droppedCurrent = Buffer.from('Permission denied (publickey)\n'), tail = Buffer.from('x'.repeat(maximum) + '\nRELEASE_REMOTE_LOCK_ALREADY_HELD\n');
  const path = file('large-current.log', Buffer.concat([history, droppedCurrent, tail]));
  assert.deepEqual(clean(readDeploymentCommandLog(path, history.length)), { logReadStatus: 'TAIL_ONLY', observedCauses: ['REMOTE_LOCK_ALREADY_HELD'] });
  const exact = Buffer.from('RELEASE_REMOTE_COMMAND_FAILED\n' + 'x'.repeat(maximum - Buffer.byteLength('RELEASE_REMOTE_COMMAND_FAILED\n')));
  assert.equal(exact.length, maximum);
  assert.deepEqual(readDeploymentCommandLog(file('exact-bound.log', exact), 0), { logReadStatus: 'READ', observedCauses: ['REMOTE_COMMAND_FAILED'] });
}));

test('missing files and invalid offsets are unavailable diagnostics rather than failures or retained paths', () => withFixture(({ directory, file }) => {
  const path = file(`${sentinel}.log`, 'Permission denied (publickey)\n');
  for (const offset of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, undefined, '0', null]) assert.deepEqual(clean(readDeploymentCommandLog(path, offset)), unavailable);
  assert.deepEqual(clean(readDeploymentCommandLog(join(directory, sentinel + '-missing.log'), 0)), unavailable);
  assert.deepEqual(clean(readDeploymentCommandLog(null, 0)), unavailable);
}));

test('real hardlinks, a file symlink and nonregular paths are refused without reading diagnostic content', () => withFixture(({ directory, file }) => {
  const target = file('private-target.log', 'Permission denied (publickey)\n'), hardlink = join(directory, 'hardlink.log');
  linkSync(target, hardlink);
  assert.equal(lstatSync(target).nlink, 2);
  assert.deepEqual(readDeploymentCommandLog(target, 0), unavailable);
  assert.deepEqual(readDeploymentCommandLog(hardlink, 0), unavailable);
  unlinkSync(hardlink);
  assert.deepEqual(readDeploymentCommandLog(target, 0), { logReadStatus: 'READ', observedCauses: ['SSH_AUTHENTICATION_REJECTED'] });
  const symbolic = join(directory, 'symlink.log'); symlinkSync(target, symbolic, 'file');
  assert.equal(lstatSync(symbolic).isSymbolicLink(), true);
  assert.deepEqual(readDeploymentCommandLog(symbolic, 0), unavailable);
  const ordinaryDirectory = join(directory, 'directory.log'); mkdirSync(ordinaryDirectory, { mode: 0o700 });
  assert.deepEqual(readDeploymentCommandLog(ordinaryDirectory, 0), unavailable);
}));

test('POSIX group-readable logs are refused while ordinary owned private logs remain readable', () => withFixture(({ file }) => {
  const path = file('mode.log', 'No space left on device\n');
  assert.deepEqual(readDeploymentCommandLog(path, 0), { logReadStatus: 'READ', observedCauses: ['DISK_FULL'] });
  if (process.platform !== 'win32') { chmodSync(path, 0o640); assert.deepEqual(readDeploymentCommandLog(path, 0), unavailable); }
}));

test('command projection retains only seven bounded fields and filters tainted codes, names and causes', () => {
  const result = { status: 255, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: sentinel, path: 'https://synthetic.invalid/' }, stdout: sentinel, stderr: sentinel, spawnargs: [sentinel], message: sentinel };
  const log = { logReadStatus: 'TAIL_ONLY', observedCauses: ['DISK_FULL', sentinel, 'SSH_HOST_KEY_REJECTED', 'DISK_FULL'], text: sentinel };
  const value = clean(deploymentCommandFailure('SSH_PREPARE', 'ssh', result, log));
  assert.deepEqual(value, { stage: 'SSH_PREPARE', program: 'ssh', exitCode: 255, signal: 'SIGTERM', spawnCode: 'ETIMEDOUT', logReadStatus: 'TAIL_ONLY', observedCauses: ['SSH_HOST_KEY_REJECTED', 'DISK_FULL'] });
  assert.equal(Object.keys(value).length, 7);
  for (const stage of deploymentStages) assert.equal(deploymentCommandFailure(stage, 'node', {}, {}).stage, stage);
  assert.deepEqual(clean(deploymentCommandFailure(sentinel, 'https://synthetic.invalid/' + sentinel, { status: 256, signal: sentinel, error: { code: sentinel } }, { logReadStatus: sentinel, observedCauses: [sentinel] })), { stage: 'UNKNOWN', program: 'OTHER', exitCode: null, signal: null, spawnCode: null, logReadStatus: 'UNAVAILABLE', observedCauses: [] });
});

test('exit status, signal and spawn code projections use finite allowlists rather than coercion', () => {
  for (const status of [0, 1, 128, 255]) assert.equal(deploymentCommandFailure('REMOTE_APPLY', 'ssh', { status }, {}).exitCode, status);
  for (const status of [-1, 256, 1.5, '1', null, undefined, NaN, Infinity]) assert.equal(deploymentCommandFailure('REMOTE_APPLY', 'ssh', { status }, {}).exitCode, null);
  for (const signal of ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']) assert.equal(deploymentCommandFailure('SCP_UPLOAD', 'scp', { signal }, {}).signal, signal);
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EAGAIN', 'ENOSPC', 'ETIMEDOUT']) assert.equal(deploymentCommandFailure('LOCAL_BUNDLE', 'tar', { error: { code } }, {}).spawnCode, code);
  for (const program of ['git', 'tar', 'ssh', 'scp', 'node']) assert.equal(deploymentCommandFailure('LOCAL_BUNDLE', program, {}, {}).program, program);
  for (const program of ['/usr/bin/ssh', 'ssh --unsafe', sentinel, null]) assert.equal(deploymentCommandFailure('LOCAL_BUNDLE', program, {}, {}).program, 'OTHER');
});

test('safe failure projects only a validated command from the same deployment stage and copies cause arrays', () => {
  const command = deploymentCommandFailure('REMOTE_APPLY', 'ssh', { status: 1 }, { logReadStatus: 'READ', observedCauses: ['REMOTE_LOCK_ALREADY_HELD'] });
  const error = Object.assign(new Error(sentinel), { name: sentinel, code: sentinel, stack: sentinel + ' https://synthetic.invalid/', cause: { secret: sentinel }, deploymentCommand: command });
  const value = clean(safeDeploymentFailure(error, 'REMOTE_APPLY'));
  assert.deepEqual(value, { schemaVersion: 1, result: 'failed', stage: 'REMOTE_APPLY', command });
  assert.notEqual(value.command, command); assert.notEqual(value.command.observedCauses, command.observedCauses);
  value.command.observedCauses.push('DISK_FULL'); assert.deepEqual(command.observedCauses, ['REMOTE_LOCK_ALREADY_HELD']);
  assert.deepEqual(safeDeploymentFailure(error, 'SSH_PREPARE'), { schemaVersion: 1, result: 'failed', stage: 'SSH_PREPARE', command: null });
  assert.deepEqual(clean(safeDeploymentFailure(error, sentinel)), { schemaVersion: 1, result: 'failed', stage: 'UNKNOWN', command: null });
});

test('safe failure discards contaminated, missing, duplicate, unknown and hostile diagnostic properties', () => {
  const valid = deploymentCommandFailure('SCP_UPLOAD', 'scp', { status: 1 }, { logReadStatus: 'READ', observedCauses: ['TARGET_PERMISSION_DENIED'] });
  const invalid = [null, [], {}, { ...valid, extra: sentinel }, { ...valid, stage: 'SSH_PREPARE' }, { ...valid, program: sentinel }, { ...valid, exitCode: 256 }, { ...valid, exitCode: '1' }, { ...valid, signal: sentinel }, { ...valid, spawnCode: sentinel }, { ...valid, logReadStatus: sentinel }, { ...valid, observedCauses: [sentinel] }, { ...valid, observedCauses: ['DISK_FULL', 'DISK_FULL'] }, { ...valid, observedCauses: sentinel }];
  for (const key of Object.keys(valid)) { const missing = { ...valid }; delete missing[key]; invalid.push(missing); }
  invalid.push(Object.defineProperty({ ...valid }, 'signal', { enumerable: true, get() { throw Error(sentinel); } }));
  invalid.push(new Proxy(valid, { ownKeys() { throw Error(sentinel); } }));
  for (const deploymentCommand of invalid) assert.deepEqual(clean(safeDeploymentFailure({ message: sentinel, deploymentCommand }, 'SCP_UPLOAD')), { schemaVersion: 1, result: 'failed', stage: 'SCP_UPLOAD', command: null });
  assert.deepEqual(clean(safeDeploymentFailure(Object.defineProperty({}, 'deploymentCommand', { get() { throw Error(sentinel); } }), 'SCP_UPLOAD')), { schemaVersion: 1, result: 'failed', stage: 'SCP_UPLOAD', command: null });
  for (const error of [null, undefined, sentinel, 1]) assert.deepEqual(clean(safeDeploymentFailure(error, 'SCP_UPLOAD')), { schemaVersion: 1, result: 'failed', stage: 'SCP_UPLOAD', command: null });
});

test('safe validation snapshots changing getters so values cannot turn private between validation and projection', () => {
  const valid = deploymentCommandFailure('SSH_PREPARE', 'ssh', { status: 1 }, { logReadStatus: 'READ', observedCauses: ['DISK_FULL'] });
  let programReads = 0;
  const changingProgram = Object.defineProperty({ ...valid }, 'program', { enumerable: true, get() { return ++programReads === 1 ? 'ssh' : sentinel; } });
  const first = clean(safeDeploymentFailure({ deploymentCommand: changingProgram }, 'SSH_PREPARE'));
  assert.deepEqual(first.command, valid); assert.equal(programReads, 1);
  let causeReads = 0;
  const changingCauses = Object.defineProperty({ ...valid }, 'observedCauses', { enumerable: true, get() { return ++causeReads <= 5 ? ['DISK_FULL'] : [sentinel]; } });
  const second = clean(safeDeploymentFailure({ deploymentCommand: changingCauses }, 'SSH_PREPARE'));
  assert.deepEqual(second.command, valid); assert.equal(causeReads, 1);
  let indexReads = 0;
  const causes = Object.defineProperty(['DISK_FULL'], '0', { enumerable: true, get() { return ++indexReads === 1 ? 'DISK_FULL' : sentinel; } });
  Object.defineProperty(causes, Symbol.iterator, { value() { throw Error(sentinel); } });
  assert.deepEqual(clean(safeDeploymentFailure({ deploymentCommand: { ...valid, observedCauses: causes } }, 'SSH_PREPARE')).command, valid);
  assert.equal(indexReads, 1);
});
