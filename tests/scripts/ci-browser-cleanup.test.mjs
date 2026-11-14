import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserCleanupStep, sanitizeBrowserCleanup, sanitizeBrowserSession } from '../../scripts/ci-sanitize.mjs';

const contamination = 'SYNTHETIC_PRIVATE_MESSAGE_sk_test_ABC';
function probe(scenario) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../fixtures/ci-browser-cleanup-probe.mjs', import.meta.url)), JSON.stringify(scenario)], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  assert.equal(child.status, 0); assert.equal(child.stderr, '');
  assert.equal(child.stdout.includes(contamination), false);
  return JSON.parse(child.stdout.trim().split('\n').find(line => line.startsWith('CI_CLEANUP_PROBE ')).slice('CI_CLEANUP_PROBE '.length));
}
test('cleanup projection emits only fixed steps/errors and rejects contaminated or oversized structures', () => {
  const step = browserCleanupStep('DATABASE_STOP', 'failed', { code: 'EACCES', message: contamination, stack: contamination });
  assert.equal(step.errorCode, 'EACCES'); assert.equal(JSON.stringify(step).includes(contamination), false);
  assert.equal(browserCleanupStep('DATABASE_STOP', 'failed', { code: contamination }).errorCode, 'OPERATION_UNCONFIRMED');
  assert.equal(sanitizeBrowserCleanup({ format: 'browser-cleanup-summary-v1', steps: [step] }).status, 'RECORDED');
  for (const steps of [[{ ...step, message: contamination }], [{ ...step, stage: contamination }], [{ ...step, errorCode: contamination }], [{ ...step, processAfter: { argv: contamination } }], Array(257).fill(step)]) {
    const result = sanitizeBrowserCleanup({ format: 'browser-cleanup-summary-v1', steps }); assert.equal(result.status, 'INVALID'); assert.equal(JSON.stringify(result).includes(contamination), false);
  }
  assert.equal(sanitizeBrowserSession({ result: 'failed', cleanupConfirmed: false, cleanup: { format: 'browser-cleanup-summary-v1', steps: [step] } }).cleanupConfirmed, false);
});
test('real supervisor with in-memory adapters preserves success only when all owned cleanup steps pass', () => {
  const value = probe({}); assert.equal(value.supervisorRejected, false); assert.equal(value.session.result, 'passed'); assert.equal(value.session.cleanupConfirmed, true);
  assert.equal(value.starts, 3); assert.equal(value.realOperationsPerformed, false);
  assert.equal(value.session.cleanup.steps.filter(step => step.result === 'passed').length, 9);
  assert.equal(value.session.cleanup.steps.find(step => step.stage === 'EXTERNAL_SESSIONS').result, 'not-required');
});
test('each owned stop failure remains failed after completed browser work and every other cleanup is attempted once', () => {
  const stages = ['PROCESS_API', 'PROCESS_WEB', 'PROCESS_PLAYWRIGHT', 'CONTROL_SERVER', 'CONTROL_ENDPOINT', 'DATABASE_STOP', 'SERVICE_MAILPIT_STOP', 'SERVICE_S3_STOP', 'PROVIDER_STOP'];
  for (const stage of stages) {
    const value = probe({ fail: stage, code: 'EACCES' }); assert.equal(value.supervisorRejected, true); assert.equal(value.session.stage, 'COMPLETE');
    assert.equal(value.session.result, 'failed'); assert.equal(value.session.cleanupConfirmed, false); assert.equal(value.session.playwrightStarted, true); assert.equal(value.starts, 3);
    assert.equal(value.session.cleanup.steps.filter(step => step.result === 'failed').length, 1);
    assert.equal(value.session.cleanup.steps.find(step => step.result === 'failed').stage, stage);
    assert.equal(value.session.cleanup.steps.find(step => step.result === 'failed').errorCode, stage.startsWith('PROCESS_') ? 'BROWSER_PROCESS_STOP_UNCONFIRMED' : 'EACCES');
    for (const expected of stages) assert.equal(value.attempts.filter(item => item === expected).length, 1);
  }
});
test('leader-gone group-present observation is preserved without killing it or calling cleanup successful', () => {
  const value = probe({ fail: 'PROCESS_PLAYWRIGHT' }), failure = value.session.cleanup.steps.find(step => step.stage === 'PROCESS_PLAYWRIGHT');
  assert.equal(failure.result, 'failed'); assert.deepEqual(failure.processBefore, { leaderPresent: false, groupPresent: true, childExitObserved: true, exitCode: 0, signal: null, terminationConfirmed: false });
  assert.deepEqual(failure.processAfter, failure.processBefore); assert.equal(value.session.cleanupConfirmed, false);
});
