import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

type SafeResult = { id: string; status: string; expectedStatus: string; retry: number; duration: number; stage: string; errorCode: string | null };
export default class StripeSafeReporter implements Reporter {
  private output: string; private phase: 'P12_EXTERNAL'|'P19_EXTERNAL'; private tests: SafeResult[] = []; private infrastructureError = false;
  constructor(options: { outputDirectory: string; phase: 'P12_EXTERNAL'|'P19_EXTERNAL' }) {
    if (!options?.outputDirectory || !['P12_EXTERNAL','P19_EXTERNAL'].includes(options.phase)) throw new Error('EXTERNAL_REPORTER_CONFIGURATION_INVALID');
    this.output = resolve(options.outputDirectory); this.phase = options.phase;
  }
  printsToStdio() { return true; }
  onStdOut() { /* Deliberately discard worker output; never forward hosted call logs. */ }
  onStdErr() { /* Deliberately discard worker output; never forward raw errors. */ }
  onError() { this.infrastructureError = true; }
  onTestEnd(test: TestCase, result: TestResult) {
    const file = this.phase === 'P19_EXTERNAL' ? 'stripe-release-external.spec.ts' : 'stripe-external.spec.ts';
    const id = this.phase === 'P19_EXTERNAL' ? 'P19-EXT-01' : 'P12-EXT-01';
    if (basename(test.location.file) !== file) this.infrastructureError = true;
    const status = ['passed','failed','timedOut','skipped','interrupted'].includes(result.status) ? result.status : 'failed';
    this.tests.push({ id, status, expectedStatus: test.expectedStatus === 'passed' ? 'passed' : 'unverified', retry: result.retry, duration: result.duration, stage: this.stage(), errorCode: status === 'passed' ? null : 'EXTERNAL_STRIPE_TEST_NOT_VALIDATED' });
    console.log(`${id}: ${status} (${Math.round(result.duration)} ms)`);
  }
  async onEnd(result: FullResult) {
    const passed = result.status === 'passed' && !this.infrastructureError && this.tests.length === 1 && this.tests.every(value => value.status === 'passed' && value.expectedStatus === 'passed' && value.retry === 0);
    writeFileSync(resolve(this.output, 'results.json'), JSON.stringify({ schemaVersion: 1, reporter: 'external-stripe-allowlist', phase: this.phase, status: passed ? 'passed' : 'failed', duration: result.duration, tests: this.tests, infrastructureError: this.infrastructureError, rawErrorsRecorded: false, providerArtifactsRecorded: false }, null, 2) + '\n', 'utf8');
    return { status: passed ? 'passed' as const : 'failed' as const };
  }
  private stage() {
    try { const proof = JSON.parse(readFileSync(resolve(this.output, 'stripe-test-proof.json'), 'utf8')); return /^[a-z0-9-]{1,64}$/.test(proof.stage ?? '') ? proof.stage as string : 'unverified'; }
    catch { return 'unverified'; }
  }
}
