import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sharedCaddyCandidate, inspectSharedCandidate } from '../../scripts/deployment/shared-ingress-plan.mjs';

const existing = '# existing operator configuration\n{\n email operator@example.invalid\n}\nexisting.example.invalid {\n respond "existing service"\n}\n';
const options = { domain: 'staging.example.invalid', filesDomain: 'files-staging.example.invalid', expectedSha256: createHash('sha256').update(existing).digest('hex') };

test('the shared candidate preserves every byte of the operator configuration and targets only isolated aliases', () => {
  const candidate = sharedCaddyCandidate(existing, options);
  const unchangedSuffix = existing.slice(existing.indexOf('{\n') + 2);
  assert.ok(candidate.includes(unchangedSuffix));
  assert.ok(candidate.startsWith('# existing operator configuration\n{\n'));
  assert.ok(candidate.includes('reverse_proxy courses-staging-web:3000'));
  assert.ok(candidate.includes('reverse_proxy courses-staging-s3:8333'));
  assert.ok(!candidate.includes('handle_path'));
});

test('an operator edit, duplicate import or nonstaging destination cannot be silently overwritten', () => {
  assert.throws(() => sharedCaddyCandidate(existing + '# operator edit\n', options), /HASH_MISMATCH/u);
  for (const change of [{ domain: 'production.example.invalid' }, { filesDomain: 'other.example.invalid' }, { domain: 'staging.example.invalid\nmalicious', filesDomain: 'files-staging.example.invalid' }]) {
    assert.throws(() => sharedCaddyCandidate(existing, { ...options, ...change }), /STAGING_DOMAINS_REQUIRED/u);
  }
  const first = sharedCaddyCandidate(existing, options);
  assert.throws(() => sharedCaddyCandidate(first, { ...options, expectedSha256: createHash('sha256').update(first).digest('hex') }), /ALREADY_PRESENT/u);
  const noGlobal = 'existing.example.invalid { respond "existing" }';
  assert.throws(() => sharedCaddyCandidate(noGlobal, { ...options, expectedSha256: createHash('sha256').update(noGlobal).digest('hex') }), /FIRST_GLOBAL_BLOCK_REQUIRED/u);
});

test('shared logger inspection refuses secondary raw copies and broad or incomplete Courses loggers', () => {
  const original = { match: [{ host: ['existing.example.invalid'] }], handle: [{ handler: 'static_response', body: 'synthetic' }] };
  const before = { apps: { http: { servers: { srv0: { routes: [original] } } } } };
  function candidate() {
    const logs = { default: { exclude: ['http.log.access.courses_stage', 'http.log.error.courses_stage', 'http.log.access.courses_stage_files', 'http.log.error.courses_stage_files'] } };
    for (const name of ['courses_stage', 'courses_stage_files']) {
      for (const [logger, namespace] of [[name, `http.log.access.${name}`], [`${name}_errors`, `http.log.error.${name}`]]) {
        logs[logger] = { include: [namespace], encoder: { format: 'filter', wrap: { format: 'json' }, fields: {
          ...Object.fromEntries(['request', 'resp_headers', 'user_id', 'err_trace', 'error', 'first_error'].map(field => [field, { filter: 'delete' }])),
          msg: { filter: 'replace', value: 'COURSES_PROXY_EVENT' },
        } } };
      }
    }
    return { apps: before.apps, logging: { logs } };
  }
  assert.equal(inspectSharedCandidate(before, candidate()).additionalDuplicateLoggingExcluded, true);
  const implicitDefault = candidate(); delete implicitDefault.logging.logs.default;
  assert.throws(() => inspectSharedCandidate(before, implicitDefault), /DEFAULT_LOGGER_REQUIRED/u);
  for (const logger of [{}, { include: [] }, { include: ['*'] }, { include: ['http'] }, { include: ['http.log'] }, { include: ['http.log.error.courses_stage.child'] },
    { include: ['http.log'], exclude: ['http.log.access.courses_stage'] }, { include: ['http.log.*'] }, { exclude: ['*'] }, { include: 'http.log' }]) {
    const after = candidate(); after.logging.logs.secondary = { encoder: { format: 'json' }, writer: { output: 'stdout' }, ...logger };
    const unchanged = JSON.stringify(after);
    assert.throws(() => inspectSharedCandidate(before, after), /LOGGER_(?:DUPLICATION|NAMESPACE_POLICY_UNKNOWN)/u);
    assert.equal(JSON.stringify(after), unchanged);
  }
  for (const logger of [{ include: ['admin.api'] }, { exclude: ['http.log'] }, { include: ['*'], exclude: ['http'] }, { include: ['http.log.access'], exclude: ['http.log.access'] }]) {
    const after = candidate(); after.logging.logs.secondary = logger;
    assert.equal(inspectSharedCandidate(before, after).additionalDuplicateLoggingExcluded, true);
  }
  for (const field of ['request', 'resp_headers', 'user_id', 'err_trace', 'error', 'first_error', 'msg']) {
    const after = candidate(); delete after.logging.logs.courses_stage_errors.encoder.fields[field];
    assert.throws(() => inspectSharedCandidate(before, after), /PRIVATE_LOG_FILTER_REQUIRED/u);
  }
  const broad = candidate(); broad.logging.logs.courses_stage.include.push('http.log');
  assert.throws(() => inspectSharedCandidate(before, broad), /NAMED_LOGGER_REQUIRED/u);
  const excludedOwn = candidate(); excludedOwn.logging.logs.courses_stage.exclude = ['http.log'];
  assert.throws(() => inspectSharedCandidate(before, excludedOwn), /NAMED_LOGGER_REQUIRED/u);
  const rawWrap = candidate(); rawWrap.logging.logs.courses_stage.encoder.wrap.format = 'console';
  assert.throws(() => inspectSharedCandidate(before, rawWrap), /PRIVATE_LOG_FILTER_REQUIRED/u);
});
