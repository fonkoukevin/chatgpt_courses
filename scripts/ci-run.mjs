import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, environment, root, windows } from './lib/runtime.mjs';
import { sanitizeTap, sanitizePlaywright, collectSurefire, copyApprovedScreenshots, regularOwnedFile, writePublicJson, requireReleaseSuccess, requireJUnitSuccess } from './ci-sanitize.mjs';

export const steps = Object.freeze({ install: ['ci'], contract: ['run', 'api:check'], client: ['run', 'verify:client'], content: ['run', 'verify:content', '--', 'P19'], contrast: ['run', 'verify:contrast', '--', 'P19'], stripeConfig: ['run', 'verify:stripe-config'], lint: ['run', 'lint'], types: ['run', 'typecheck'], browserTypes: ['run', 'typecheck:browser'], web: ['run', 'build:web'], api: ['run', 'verify:api'], release: ['run', 'verify:release'], production: ['run', 'verify:production-config'] });
const jobs = new Set(['web', 'api', 'e2e']);
export function isolatedEnvironment(inherited, build = false) {
  const allowed = /^(?:PATH|Path|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|TEMP|TMP|TMPDIR|SystemRoot|SYSTEMROOT|COMSPEC|ComSpec|PATHEXT|ProgramFiles|PROGRAMFILES|APPDATA|LOCALAPPDATA|JAVA_HOME|LANG|LC_ALL|TZ|NUMBER_OF_PROCESSORS)$/u;
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => allowed.test(key)));
  Object.assign(env, { CI: 'true', APP_ENV: build ? 'production' : 'test', SPRING_PROFILES_ACTIVE: 'test', NEXT_TELEMETRY_DISABLED: '1',
    APP_PUBLIC_ORIGIN: build ? 'https://courses-ci.invalid' : 'http://127.0.0.1:3000', APP_DEFAULT_LOCALE: 'fr', APP_PUBLISHED_LOCALES: '',
    API_INTERNAL_URL: 'http://127.0.0.1:8080', API_PORT: '8080', API_TIMEOUT_MS: '30000', SESSION_COOKIE_SECURE: build ? 'true' : 'false',
    COMMERCE_ENABLED: 'false', STRIPE_ENABLED: 'false', STORAGE_ENABLED: 'false', VIDEO_ENABLED: 'false', MAIL_MODE: 'disabled',
    NOTIFICATION_OUTBOX_ENABLED: 'false', PAYMENT_INBOX_ENABLED: 'false', REFUND_WORKER_ENABLED: 'false', ASSET_STAGING_CLEANUP_WORKER_ENABLED: 'false',
    BROWSER_WEB_PORT: '3101', BROWSER_API_PORT: '8181', PLAYWRIGHT_BROWSERS_PATH: join(root, '.tools/playwright'), PLAYWRIGHT_NO_COPY_PROMPT: '1',
    SERVICE_TEST_KEY: randomBytes(32).toString('hex'), NOTIFICATION_OUTBOX_KEY: randomBytes(32).toString('base64') });
  if (build) env.NODE_ENV = 'production';
  return env;
}
function evidenceRuns() { const directory = join(root, 'docs/evidence/P19-browser'); return existsSync(directory) ? readdirSync(directory).filter(name => /^\d{4}-\d{2}-\d{2}T[\dTZ-]+-[a-f0-9-]{36}$/u.test(name)) : []; }
function collectRelease(before, destination) {
  const runs = evidenceRuns().filter(name => !before.includes(name));
  if (runs.length !== 1) throw new Error('CI_EXACTLY_ONE_NEW_RELEASE_RUN_REQUIRED');
  const directory = join(root, 'docs/evidence/P19-browser', runs[0]);
  const read = name => JSON.parse(readFileSync(regularOwnedFile(directory, join(directory, name)), 'utf8'));
  const result = sanitizePlaywright(read('results.json')), session = read('session.json');
  const captures = existsSync(join(directory, 'capture-manifest.json')) ? copyApprovedScreenshots(directory, join(destination, 'screenshots'), read('capture-manifest.json')) : [];
  writePublicJson(join(destination, 'release.json'), { ...result, cleanupConfirmed: session.cleanupConfirmed === true, harnessResult: session.result === 'passed' ? 'passed' : 'failed', captures });
  if (session.cleanupConfirmed !== true || session.result !== 'passed' || captures.length !== 8) throw new Error('CI_RELEASE_EVIDENCE_INCOMPLETE');
  requireReleaseSuccess(result);
}
export function collectProduction(destination) {
  const source = JSON.parse(readFileSync(join(root, 'docs/evidence/P19-production-config-checks.json'), 'utf8'));
  const safeName = value => typeof value === 'string' && /^[A-Za-z0-9_./-]{1,120}$/u.test(value) ? value : 'REDACTED_CHECK';
  const observed = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : undefined;
  const checks = (Array.isArray(source.checks) ? source.checks : []).map(check => ({ name: safeName(check.name), passed: check.passed === true,
    ...(observed(check.observed) === undefined ? {} : { observed: observed(check.observed) }),
    ...(check.observed && typeof check.observed === 'object' ? { counts: Object.fromEntries(['users', 'resources', 'offers', 'orders', 'grants', 'migrations'].filter(key => observed(check.observed[key]) !== undefined).map(key => [key, observed(check.observed[key])])) } : {}) }));
  writePublicJson(join(destination, 'production.json'), { result: source.result === 'passed' ? 'passed' : 'failed', cleanupConfirmed: source.cleanupConfirmed === true,
    jarSha256: /^[a-f0-9]{64}$/u.test(source.jarSha256) ? source.jarSha256 : null,
    webBuildId: /^[A-Za-z0-9_-]{1,100}$/u.test(source.webBuildId) ? source.webBuildId : null,
    tlsDeploymentClaimed: false, checks });
  if (source.result !== 'passed' || source.cleanupConfirmed !== true || !checks.length || checks.some(check => !check.passed)) throw new Error('CI_PRODUCTION_PROBE_FAILED');
}
export function runStep(job, step) {
  if (!jobs.has(job) || !Object.hasOwn(steps, step) && !['scripts', 'browsers', 'smoke'].includes(step)) throw new Error('CI_STEP_NOT_APPROVED');
  const destination = join(root, '.runtime/ci-public', job), privateDirectory = join(root, '.runtime/ci-private', job);
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  const log = join(privateDirectory, `${step}.log`), handle = openSync(log, 'w', 0o600), before = step === 'release' ? evidenceRuns() : [];
  const env = isolatedEnvironment(environment({ loadLocal: false }), step === 'web');
  // Node 24's default reporter is not a stable machine-readable interface.
  // This constant reaches the nested node:test process launched by verify:client.
  if (['scripts', 'client', 'stripeConfig'].includes(step)) env.NODE_OPTIONS = '--test-reporter=tap';
  let executable, args;
  if (step === 'scripts') { executable = process.execPath; args = ['--test', ...readdirSync(join(root, 'tests/scripts')).filter(name => /^(?:ci-|deployment-|shared-ingress-).*\.test\.mjs$/u.test(name)).toSorted().map(name => join(root, 'tests/scripts', name)), join(root, 'tests/scripts/stripe-artifact-privacy.test.mjs')]; }
  else if (step === 'browsers') { executable = process.execPath; args = [join(root, 'node_modules/@playwright/test/cli.js'), 'install', '--with-deps', 'chromium']; }
  else if (step === 'smoke') { executable = process.execPath; args = [join(root, 'scripts/ci-smoke.mjs')]; }
  else [executable, args] = command(windows ? join(dirname(process.execPath), 'npm.cmd') : 'npm', steps[step]);
  const started = performance.now(); let result;
  try { result = spawnSync(executable, args, { cwd: root, env, windowsHide: true, windowsVerbatimArguments: windows && executable === 'cmd.exe', stdio: ['ignore', handle, handle], timeout: 35 * 60 * 1000 }); }
  finally { closeSync(handle); }
  const summary = { schemaVersion: 1, job, step, exitCode: Number.isInteger(result.status) ? result.status : null, result: result.status === 0 && !result.error ? 'passed' : 'failed', durationMs: Math.round(performance.now() - started), ...(['content', 'contrast'].includes(step) ? { evidencePhase: 'P19' } : {}) };
  if (['scripts', 'client', 'stripeConfig'].includes(step)) summary.tap = sanitizeTap(readFileSync(log, 'utf8'));
  if (step === 'api' && existsSync(join(root, 'apps/api/target/surefire-reports'))) summary.junit = collectSurefire(join(root, 'apps/api/target/surefire-reports'));
  writePublicJson(join(destination, `${step}.json`), summary);
  let collectionFailed = false;
  try {
    if (step === 'release') collectRelease(before, destination);
    if (step === 'production') collectProduction(destination);
    if (step === 'api') {
      const source = join(root, 'apps/api/src/test/java');
      const expected = readdirSync(source, { recursive: true }).filter(name => /Test\.java$/u.test(name)).map(name => {
        const text = readFileSync(join(source, name), 'utf8'), packageName = text.match(/^package\s+([A-Za-z0-9_.]+);/mu)?.[1], className = name.split(/[\\/]/u).at(-1).replace(/\.java$/u, '');
        if (!packageName) throw new Error('CI_TEST_PACKAGE_REQUIRED'); return `${packageName}.${className}`;
      });
      requireJUnitSuccess(summary.junit ?? [], expected);
    }
    if (['scripts', 'client', 'stripeConfig'].includes(step) && (!summary.tap.counts.tests || summary.tap.counts.fail !== 0 || summary.tap.counts.skipped !== 0 || summary.tap.counts.cancelled !== 0 || summary.tap.counts.todo !== 0)) throw new Error('CI_TAP_TESTS_MUST_PASS_WITHOUT_SKIPS');
  }
  catch { collectionFailed = true; writePublicJson(join(destination, `${step}-collection.json`), { result: 'failed', code: 'CI_EVIDENCE_NOT_APPROVED' }); }
  console.log(JSON.stringify({ job, step, exitCode: summary.exitCode, result: summary.result, collectionFailed }));
  return result.status === 0 && !result.error && !collectionFailed ? 0 : result.status || 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runStep(process.argv[2], process.argv[3]); }
  catch { console.error('CI_RUNNER_FAILED_NO_RAW_OUTPUT'); process.exitCode = 1; }
}
