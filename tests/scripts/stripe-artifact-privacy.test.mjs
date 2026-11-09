import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import StripeSafeReporter from '../browser/stripe-safe-reporter.ts';
import { externalFailure, protectExternalArtifacts } from '../browser/stripe-privacy.ts';
import { expireKnownExternalSessions } from '../../scripts/lib/stripe-session-cleanup.mjs';

test('external failure has only a stable code, without original stack, cause or code frame', () => {
  const failure = externalFailure('HOSTED_TEST_FORM_NOT_COMPLETED');
  assert.equal(failure.message, 'HOSTED_TEST_FORM_NOT_COMPLETED');
  assert.equal(failure.stack, undefined); assert.equal(failure.cause, undefined);
  assert.equal(externalFailure('unsafe provider value').message, 'EXTERNAL_TEST_NOT_VALIDATED');
});

test('external teardown removes raw error material before recording without changing failure status', async () => {
  let closed = false;
  const page = { isClosed: () => closed, close: async options => { assert.equal(options.runBeforeUnload, false); closed = true; } };
  const native = new Error('SENTINEL_PROVIDER_VALUE', { cause: new Error('SENTINEL_PROVIDER_VALUE') });
  const info = { status: 'failed', expectedStatus: 'passed', errors: [{ message: 'SENTINEL_PROVIDER_VALUE', stack: 'SENTINEL_PROVIDER_VALUE', errorContext: 'SENTINEL_PROVIDER_VALUE', value: { raw: 'SENTINEL_PROVIDER_VALUE' }, snippet: 'SENTINEL_PROVIDER_VALUE' }, native] };
  await protectExternalArtifacts(page, info);
  assert.equal(closed, true); assert.equal(info.status, 'failed'); assert.equal(info.expectedStatus, 'passed');
  assert.deepEqual(info.errors[0], { message: 'EXTERNAL_STRIPE_TEST_NOT_VALIDATED' });
  assert.equal(info.errors[1].stack, undefined); assert.equal(info.errors[1].cause, undefined); assert.equal(info.errors[1].message, 'EXTERNAL_STRIPE_TEST_NOT_VALIDATED');
});

test('external reporter writes an allowlist and discards errors, provider output and unknown fields', async () => {
  const workspace = resolve('.runtime'); mkdirSync(workspace, { recursive: true }); const directory = mkdtempSync(join(workspace, 'p19-stripe-reporter-'));
  const output = [], original = console.log;
  try {
    console.log = value => output.push(String(value));
    writeFileSync(join(directory, 'stripe-test-proof.json'), JSON.stringify({ stage: 'hosted-card-number', ignored: 'SENTINEL_PROVIDER_VALUE' }));
    const reporter = new StripeSafeReporter({ outputDirectory: directory, phase: 'P19_EXTERNAL' });
    reporter.onStdOut('SENTINEL_PROVIDER_VALUE'); reporter.onStdErr('SENTINEL_PROVIDER_VALUE'); reporter.onError({ message: 'SENTINEL_PROVIDER_VALUE' });
    reporter.onTestEnd({ location: { file: '/fixture/stripe-release-external.spec.ts' }, expectedStatus: 'passed', title: 'SENTINEL_PROVIDER_VALUE' }, { status: 'failed', retry: 0, duration: 1, errors: [{ message: 'SENTINEL_PROVIDER_VALUE' }], stdout: ['SENTINEL_PROVIDER_VALUE'] });
    assert.equal((await reporter.onEnd({ status: 'failed', duration: 1 })).status, 'failed');
    const bytes = readFileSync(join(directory, 'results.json'), 'utf8'), report = JSON.parse(bytes);
    assert.equal(bytes.includes('SENTINEL_PROVIDER_VALUE'), false); assert.equal(output.join('\n').includes('SENTINEL_PROVIDER_VALUE'), false);
    assert.equal(report.status, 'failed'); assert.equal(report.tests[0].errorCode, 'EXTERNAL_STRIPE_TEST_NOT_VALIDATED'); assert.equal(report.tests[0].stage, 'hosted-card-number');
    assert.equal(report.rawErrorsRecorded, false); assert.equal(reporter.printsToStdio(), true);
  } finally {
    console.log = original;
    // Only this test's freshly created, checked workspace directory is removed.
    assert.equal(dirname(directory), workspace); assert.equal(basename(directory).startsWith('p19-stripe-reporter-'), true);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('external cleanup attempts every known session even after a previous expiration fails', async () => {
  const called = [];
  await assert.rejects(expireKnownExternalSessions({ sessions: ['first', 'second'] }, async reference => {
    called.push(reference);
    if (reference === 'first') throw new Error('SENTINEL_PROVIDER_VALUE');
    return { paid: true, sessionRetained: true };
  }), error => {
    assert.equal(error.message, 'EXTERNAL_TEST_SESSION_CLEANUP_UNCONFIRMED');
    assert.equal(error.stack.includes('SENTINEL_PROVIDER_VALUE'), false);
    assert.deepEqual(error.cleanupFacts, { attempted: 2, failed: 1, unknownLookup: false });
    return true;
  });
  assert.deepEqual(called, ['first', 'second']);
});

test('external cleanup refuses confirmation when a checkout lookup was not resolved', async () => {
  let attempted = 0;
  await assert.rejects(expireKnownExternalSessions({ sessions: ['known'], checkoutOperationLookupFailed: true }, async () => {
    attempted++; return { paid: true, sessionRetained: true };
  }), error => {
    assert.deepEqual(error.cleanupFacts, { attempted: 1, failed: 0, unknownLookup: true });
    return true;
  });
  assert.equal(attempted, 1);
});

test('external cleanup confirms two retained paid sessions without a financial fallback', async () => {
  const result = await expireKnownExternalSessions({ sessions: ['first', 'second'] }, async () => ({ paid: true, sessionRetained: true }));
  assert.equal(result.cleanupConfirmed, true); assert.equal(result.testMode, true);
  assert.deepEqual(result.sessions, [{ paid: true, sessionRetained: true }, { paid: true, sessionRetained: true }]);
});
