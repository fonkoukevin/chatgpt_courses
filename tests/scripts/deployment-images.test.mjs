import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyImageBuildLog, safeImageBuildDiagnostic } from '../../scripts/deployment/release-diagnostics.mjs';

const fixture = fileURLToPath(new URL('../fixtures/deployment/image-build-probe.mjs', import.meta.url));
function probe(scenario) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|Path|HOME|USERPROFILE|TEMP|TMP|TMPDIR|SystemRoot|SYSTEMROOT|LANG)$/u.test(key)));
  const child = spawnSync(process.execPath, [fixture, JSON.stringify(scenario)], { env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(child.error, undefined);
  assert.equal((child.stdout + child.stderr).includes('SYNTHETIC_PRIVATE'), false);
  const line = child.stdout.split(/\r?\n/u).find(value => value.startsWith('IMAGE_BUILD_PROBE '));
  assert.ok(line); const value = JSON.parse(line.slice('IMAGE_BUILD_PROBE '.length)); assert.equal(child.status, value.exitCode); return value;
}

test('real image CLI reports Git/precondition failure before Docker without disclosing source paths or stderr', () => {
  const dirty = probe({ dirty: true });
  assert.equal(dirty.diagnostic.failureCode, 'IMAGE_INPUTS_MUST_BE_COMMITTED'); assert.equal(dirty.diagnostic.phase, 'VALIDATION');
  assert.deepEqual(dirty.commands, []); assert.equal(dirty.report, null);
  const absent = probe({ gitUnavailable: true });
  assert.equal(absent.diagnostic.failureCode, 'IMAGE_GIT_COMMAND_FAILED'); assert.equal(absent.diagnostic.exitCode, 128);
  assert.deepEqual(absent.diagnostic.observedCauses, ['GIT_REPOSITORY_UNAVAILABLE']); assert.deepEqual(absent.commands, []);
});

test('failed builds retain service and bounded cause observations, stop before the next service, and distinguish spawn failures', () => {
  const web = probe({ serviceFailure: 'web', log: 'toomanyrequests: You have reached your unauthenticated pull rate limit.' });
  assert.equal(web.diagnostic.service, 'web'); assert.equal(web.diagnostic.exitCode, 1); assert.equal(web.diagnostic.phase, 'BUILD');
  assert.deepEqual(web.diagnostic.observedCauses, ['DOCKER_HUB_RATE_LIMIT']); assert.deepEqual(web.commands, ['web']); assert.equal(web.report, null);
  const api = probe({ serviceFailure: 'api', large: true, log: '\nE: Version \'1.2.3\' for \'synthetic-package\' was not found' });
  assert.equal(api.diagnostic.service, 'api'); assert.equal(api.diagnostic.logReadStatus, 'TAIL_ONLY'); assert.deepEqual(api.commands, ['web', 'api']);
  assert.deepEqual(api.diagnostic.observedCauses, ['APT_PACKAGE_UNAVAILABLE']);
  const unavailable = probe({ spawnFailure: true });
  assert.equal(unavailable.diagnostic.failureCode, 'IMAGE_BUILD_START_FAILED'); assert.equal(unavailable.diagnostic.spawnCode, 'ENOENT');
  const unexplainedKill = probe({ serviceFailure: 'web', exitCode: 137 });
  assert.deepEqual(unexplainedKill.diagnostic.observedCauses, []);
});

test('successful real image CLI retains both builds and emits no failure diagnostic', () => {
  const result = probe({}); assert.equal(result.exitCode, 0); assert.deepEqual(result.commands, ['web', 'api']);
  assert.equal(result.diagnostic, null); assert.equal(result.report.registryPublished, false); assert.deepEqual(Object.keys(result.report.images), ['web', 'api']);
});

test('classifier emits enums only and diagnostic validator rejects foreign commits, free strings and contaminated schemas', () => {
  const log = 'SYNTHETIC_PRIVATE npm error code E404\nFailed to compile.\nno space left on device\ni/o timeout';
  assert.deepEqual(classifyImageBuildLog(log), ['NETWORK_TIMEOUT', 'NPM_PACKAGE_UNAVAILABLE', 'COMPILATION_FAILED', 'DISK_FULL']);
  assert.deepEqual(classifyImageBuildLog('S'.repeat(1024 * 1024 + 1)), []);
  const value = probe({ serviceFailure: 'web' }).diagnostic, commit = 'a'.repeat(40);
  assert.deepEqual(safeImageBuildDiagnostic(value, commit), value);
  for (const changes of [{ sourceCommit: 'b'.repeat(40) }, { extra: 'SYNTHETIC_PRIVATE' }, { failureCode: 'SYNTHETIC_PRIVATE' },
    { service: 'SYNTHETIC_PRIVATE' }, { phase: 'SYNTHETIC_PRIVATE' }, { spawnCode: 'SYNTHETIC_PRIVATE' }, { signal: 'SYNTHETIC_PRIVATE' },
    { observedCauses: ['SYNTHETIC_PRIVATE'] }, { observedCauses: ['DISK_FULL', 'DISK_FULL'] }, { exitCode: 256 }, { logReadStatus: 'SYNTHETIC_PRIVATE' }]) {
    assert.equal(safeImageBuildDiagnostic({ ...value, ...changes }, commit), null);
  }
  assert.equal(safeImageBuildDiagnostic(Object.defineProperty({}, 'sourceCommit', { enumerable: true, get() { throw Error('SYNTHETIC_PRIVATE'); } }), commit), null);
});
