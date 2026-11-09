import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { sanitizePlaywright, sanitizeBrowserSession, sanitizeSurefire, sanitizeTap, collectSurefire, digest, copyApprovedScreenshots, requireReleaseSuccess, requireJUnitSuccess, inside } from '../../scripts/ci-sanitize.mjs';
import { packBuild, restoreBuild } from '../../scripts/ci-build.mjs';
import { isolatedEnvironment } from '../../scripts/ci-run.mjs';
import { validatePublicReport } from '../../scripts/ci-report.mjs';

const temporaryRoot = resolve('.runtime/ci-unit-fixtures'); mkdirSync(temporaryRoot, { recursive: true });
function fixture(t) { const directory = mkdtempSync(join(temporaryRoot, 'case-')); t.after(() => { if (!inside(temporaryRoot, directory)) throw new Error('TEST_CLEANUP_OUTSIDE_ROOT'); rmSync(directory, { recursive: true, force: true }); }); return directory; }
const contamination = 'SYNTHETIC_PRIVATE_ABC_39';
function passingRelease() { return { suites: [{ specs: ['01', '02', '03', '04'].map(id => ({ title: `P19-${id} ${contamination}`, tests: [{ results: [{ status: 'passed', duration: 15, retry: 0, error: { message: contamination }, stdout: [contamination], attachments: [{ body: contamination }] }] }] })) }], stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0, duration: 60 } }; }
function webBuild(directory) { const base = join(directory, 'source'), next = join(base, 'apps/web/.next'); mkdirSync(join(next, 'server/app'), { recursive: true }); mkdirSync(join(next, 'static/chunks'), { recursive: true }); mkdirSync(join(next, 'cache'), { recursive: true }); writeFileSync(join(next, 'BUILD_ID'), 'synthetic-build'); writeFileSync(join(next, 'server/app/page.js'), 'module.exports = 1;'); writeFileSync(join(next, 'static/chunks/test.js'), 'export const n=1;'); writeFileSync(join(next, 'cache/private.tmp'), contamination); return { base, next }; }
const commit = 'a'.repeat(40);

test('pre-browser failures expose only finite stage and errno without private session contents', t => {
  const raw = { result: 'failed', cleanupConfirmed: true, stage: 'CONTROL_LISTEN', failureCode: 'EINVAL', playwrightStarted: false,
    message: contamination, path: contamination, processes: [{ args: contamination }], token: contamination };
  const result = sanitizeBrowserSession(raw);
  assert.deepEqual(result, { format: 'browser-harness-summary-v1', result: 'failed', cleanupConfirmed: true, stage: 'CONTROL_LISTEN', errorCode: 'EINVAL', playwrightStarted: false });
  assert.equal(JSON.stringify(result).includes(contamination), false);
  const directory = fixture(t); writeFileSync(join(directory, 'release-harness.json'), JSON.stringify(result));
  assert.equal(validatePublicReport(directory).length, 1);
  assert.equal(sanitizeBrowserSession({ ...raw, stage: contamination, failureCode: contamination }).stage, 'UNKNOWN');
  assert.equal(sanitizeBrowserSession({ ...raw, failureCode: contamination }).errorCode, 'HARNESS_FAILURE');
  assert.equal(sanitizeBrowserSession({ result: 'passed', failureCode: contamination }).errorCode, 'NONE');
});

test('report filtering preserves failures and retries while discarding all free-form payloads', () => {
  const raw = passingRelease(); raw.suites[0].specs[1].tests[0].results.push({ status: 'failed', duration: 8, retry: 1, error: contamination }); raw.stats.flaky = 1;
  const result = sanitizePlaywright(raw);
  assert.equal(JSON.stringify(result).includes(contamination), false);
  assert.equal(result.tests[1].attempts[1].status, 'failed'); assert.equal(result.automaticRetriesObserved, true);
  assert.throws(() => requireReleaseSuccess(result), /MUST_PASS_ONCE/u);
  const clean = sanitizePlaywright(passingRelease()); requireReleaseSuccess(clean);
  clean.tests[3].id = 'P19-01'; assert.throws(() => requireReleaseSuccess(clean), /MUST_PASS_ONCE/u);
});

test('a skipped scenario or empty successful reporter is never accepted as a release pass', () => {
  const raw = passingRelease(); raw.suites[0].specs[2].tests[0].results[0].status = 'skipped'; raw.stats.expected = 3; raw.stats.skipped = 1;
  assert.throws(() => requireReleaseSuccess(sanitizePlaywright(raw)), /MUST_PASS_ONCE/u);
  assert.throws(() => requireReleaseSuccess(sanitizePlaywright({})), /MUST_PASS_ONCE/u);
});

test('JUnit and TAP summaries keep exact negative outcomes without properties, failures, logs or entities', () => {
  const xml = `<testsuite name="com.chatgptcourses.OwnerTest" tests="2" failures="1" errors="0" skipped="0" time="1.25"><properties><property name="password" value="${contamination}"/></properties><testcase classname="com.chatgptcourses.OwnerTest" name="ownerCannotReadOther" time="0.25"><failure message="${contamination}">${contamination}</failure><system-out>${contamination}</system-out></testcase><testcase classname="com.chatgptcourses.OwnerTest" name="success" time="1"/></testsuite>`;
  const disguised = xml.replace('</testsuite>', `<system-out><![CDATA[<testcase classname="com.chatgptcourses.PrivateTest" name="${contamination}" time="1"/>]]></system-out></testsuite>`);
  const result = sanitizeSurefire(disguised); assert.equal(JSON.stringify(result).includes(contamination), false); assert.equal(result.tests.length, 2); assert.equal(result.counts.failures, 1); assert.equal(result.tests[0].status, 'failed');
  assert.throws(() => requireJUnitSuccess([result], ['com.chatgptcourses.OwnerTest']), /WITHOUT_SKIPS/u);
  const good = sanitizeSurefire(xml.replace('failures="1"', 'failures="0"').replace(/<failure[\s\S]*?<\/failure>/u, '')); requireJUnitSuccess([good], ['com.chatgptcourses.OwnerTest']);
  assert.throws(() => requireJUnitSuccess([good], ['com.chatgptcourses.MissingTest']), /WITHOUT_SKIPS/u);
  assert.throws(() => sanitizeSurefire('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///private">]>' + xml), /REFUSED/u);
  const tap = sanitizeTap(`not ok 1 - ${contamination}\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n# duration_ms 15\n`);
  assert.equal(tap.counts.fail, 1); assert.equal(JSON.stringify(tap).includes(contamination), false);
});

function sourceBoundJUnitFixture(t, { capturedOutput = false } = {}) {
  const directory = fixture(t), source = join(directory, 'sources'), reports = join(directory, 'reports');
  mkdirSync(source); mkdirSync(reports);
  const file = 'S3BoundaryTest.java', classname = 'com.chatgptcourses.assets.S3BoundaryTest', method = 'rejectsInvalidContent';
  const lines = ['package com.chatgptcourses.assets;', ...(capturedOutput ? ['import org.springframework.boot.test.system.CapturedOutput;'] : []), 'class S3BoundaryTest {', `@Test void ${method}(${capturedOutput ? 'CapturedOutput output' : ''}) {`, ...Array.from({ length: 14 }, () => '// synthetic source fixture'), '}', '}'];
  writeFileSync(join(source, file), lines.join('\n'));
  const report = join(reports, `TEST-${classname}.xml`);
  const collect = ({ body = '', tag = 'failure', frameClass = classname, otherContent = '', caseClass = classname, caseName = capturedOutput ? `${method}(CapturedOutput)` : method } = {}) => {
    writeFileSync(report, `<testsuite name="${classname}" tests="1" failures="${tag === 'failure' ? 1 : 0}" errors="${tag === 'error' ? 1 : 0}" skipped="0" time="0.01"><testcase classname="${caseClass}" name="${caseName}" time="0.01"><${tag} message="${contamination}" type="${contamination}">${body || `at ${frameClass}.${method}(${file}:10)`}</${tag}>${otherContent}</testcase></testsuite>`);
    return collectSurefire(reports, source)[0];
  };
  return { directory, source, reports, file, classname, method, lineCount: lines.length, collect };
}

test('JUnit failure locations come only from the indexed source and omit all private failure and CDATA contents', t => {
  const data = sourceBoundJUnitFixture(t);
  const body = `<![CDATA[${contamination}\n\tat ${data.classname}.${data.method}(${data.file}:10)\n<testcase classname="com.chatgptcourses.ForgedTest" name="secret"/>]]>`;
  const result = data.collect({ body, otherContent: `<system-out><![CDATA[${contamination}<testcase classname="com.chatgptcourses.ForgedTest" name="fake"/>]]></system-out>` });
  assert.equal(result.tests.length, 1); assert.equal(result.tests[0].status, 'failed');
  assert.deepEqual(result.tests[0].diagnostic, { kind: 'ASSERTION_FAILURE', file: data.file, line: 10 });
  assert.equal(JSON.stringify(result).includes(contamination), false);
  const error = data.collect({ tag: 'error' });
  assert.deepEqual(error.tests[0].diagnostic, { kind: 'TEST_ERROR', file: data.file, line: 10 });
  const published = join(data.directory, 'public'); mkdirSync(published);
  writeFileSync(join(published, 'api.json'), JSON.stringify({ junit: [result, error] }));
  assert.equal(validatePublicReport(published).length, 1);
});

test('JUnit locations refuse cross-class or cross-file frames, invalid source lines and frames confined to logs', t => {
  const data = sourceBoundJUnitFixture(t), frame = (file = data.file, line = 10, classname = data.classname, method = data.method) => `at ${classname}.${method}(${file}:${line})`;
  const rejected = [
    { body: frame('OtherTest.java') }, { body: frame('../S3BoundaryTest.java') }, { body: frame(data.file, 0) },
    { body: frame(data.file, data.lineCount + 1) }, { body: frame(data.file, -1) },
    { body: frame(data.file, 10, 'com.chatgptcourses.assets.OtherTest') }, { body: frame(data.file, 10, data.classname, 'otherMethod') },
    { body: frame(), caseClass: 'com.chatgptcourses.assets.UnknownTest' },
    { body: `${frame()}\n${frame(data.file, 11)}` },
    { body: contamination, otherContent: `<system-out><![CDATA[${frame()}]]></system-out><system-err>${frame()}</system-err>` }
  ];
  for (const input of rejected) {
    const result = data.collect(input);
    assert.equal(result.counts.failures, 1); assert.equal(result.tests.length, 1); assert.equal(result.tests[0].status, 'failed');
    assert.equal(result.tests[0].diagnostic, undefined); assert.equal(JSON.stringify(result).includes(contamination), false);
  }
  const unindexed = sanitizeSurefire(`<testsuite name="${data.classname}" tests="1" failures="1" errors="0" skipped="0"><testcase classname="${data.classname}" name="${data.method}"><failure>${frame()}</failure></testcase></testsuite>`);
  assert.equal(unindexed.tests[0].diagnostic, undefined);
});

test('a source-declared CapturedOutput case keeps its display name redacted but exposes only its verified Java failure location', t => {
  const data = sourceBoundJUnitFixture(t, { capturedOutput: true }), result = data.collect();
  assert.equal(result.tests[0].name, 'REDACTED_TEST'); assert.equal(result.droppedMetadata, 1); assert.equal(result.tests[0].status, 'failed');
  assert.deepEqual(result.tests[0].diagnostic, { kind: 'ASSERTION_FAILURE', file: data.file, line: 10 });
  assert.equal(JSON.stringify(result).includes(contamination), false);
  for (const caseName of [`${data.method}(${contamination})`, `${data.method}(CapturedOutput,${contamination})`, `${data.method}(OtherOutput)`, data.method]) {
    const rejected = data.collect({ caseName });
    assert.equal(rejected.tests[0].status, 'failed'); assert.equal(rejected.tests[0].diagnostic, undefined);
    assert.equal(JSON.stringify(rejected).includes(contamination), false);
  }
  const sourceFile = join(data.source, data.file), original = readFileSync(sourceFile, 'utf8');
  for (const changed of [original.replace('org.springframework.boot.test.system.CapturedOutput', 'other.CapturedOutput'), original.replace('@Test void', 'void')]) {
    writeFileSync(sourceFile, changed);
    const rejected = data.collect(); assert.equal(rejected.tests[0].name, 'REDACTED_TEST'); assert.equal(rejected.tests[0].diagnostic, undefined);
  }
});

function storageFactsFixture(t, imported = false) {
  const directory = fixture(t), source = join(directory, 'sources'), reports = join(directory, 'reports'); mkdirSync(source); mkdirSync(reports);
  const file = imported ? 'ContentImportIntegrationTest.java' : 'AssetServiceIntegrationTest.java', classname = `com.chatgptcourses.${file.replace('.java', '')}`;
  const method = imported ? 'changedSourceAppendsDraftRevisionButKeepsLogicalIdentityAndReadyFileBytes' : 'projectTextRoundTripsPrivatelyAndSurvivesSourceWithdrawalWithoutSharingOwnership';
  const sourceLines = ['package com.chatgptcourses;', ...(!imported ? ['import org.springframework.boot.test.system.CapturedOutput;'] : []), `class ${file.replace('.java', '')} {`, `@Test void ${method}(${imported ? '' : 'CapturedOutput output'}) {`, ...Array(15).fill('// synthetic fixture'), '}', '}'];
  writeFileSync(join(source, file), sourceLines.join('\n'));
  const marker = `\tSuppressed: com.chatgptcourses.S3CiDiagnostic$FailureDetails: P21_S3_DIAG_V1 phase=${imported ? 'FIRST_IMPORT' : 'CONFIRM'} state=EXPIRED rejection=NONE expired=true elapsedMs=4020 ageMs=3010 error=${imported ? 'API_ASSET_NOT_READY' : 'ASSERTION'}`;
  const collect = ({ line = marker, caseName = imported ? method : `${method}(CapturedOutput)`, failureMarker = true, frameClass = classname, other = '' } = {}) => {
    const tag = imported ? 'error' : 'failure';
    writeFileSync(join(reports, `TEST-${classname}.xml`), `<testsuite name="${classname}" tests="1" failures="${imported ? 0 : 1}" errors="${imported ? 1 : 0}" skipped="0"><testcase classname="${classname}" name="${caseName}"><${tag}><![CDATA[${contamination}\n at ${frameClass}.${method}(${file}:10)\n${failureMarker ? line : ''}]]></${tag}>${other}</testcase></testsuite>`);
    return collectSurefire(reports, source)[0];
  };
  return { directory, marker, method, collect };
}

test('only the two source-bound S3 cases expose finite storage facts while original failures remain failures', t => {
  for (const imported of [false, true]) {
    const fixture = storageFactsFixture(t, imported), result = fixture.collect();
    assert.deepEqual(result.tests[0].diagnostic.storageFacts, { phase: imported ? 'FIRST_IMPORT' : 'CONFIRM', state: 'EXPIRED', rejection: 'NONE', expired: true, elapsedMs: 4020, ageMs: 3010, error: imported ? 'API_ASSET_NOT_READY' : 'ASSERTION' });
    assert.equal(result.tests[0].status, imported ? 'error' : 'failed'); assert.equal(JSON.stringify(result).includes(contamination), false);
    assert.throws(() => requireJUnitSuccess([result], [result.suite]), /WITHOUT_SKIPS/u);
    const unknown = fixture.collect({ line: fixture.marker.replace('expired=true', 'expired=unknown').replace('ageMs=3010', 'ageMs=unknown') });
    assert.equal(unknown.tests[0].diagnostic.storageFacts.expired, null); assert.equal(unknown.tests[0].diagnostic.storageFacts.ageMs, null);
    const published = join(fixture.directory, 'public'); mkdirSync(published); writeFileSync(join(published, 'api.json'), JSON.stringify({ junit: [result, unknown] }));
    assert.equal(validatePublicReport(published).length, 1);
  }
});

test('S3 storage facts reject free-form data, out-of-range numbers, duplicate markers, logs and other source methods', t => {
  const fixture = storageFactsFixture(t), base = fixture.marker;
  const rejected = [
    { line: base.replace('state=EXPIRED', `state=${contamination}`) }, { line: base.replace('rejection=NONE', `rejection=https://${contamination}.invalid`) },
    { line: base.replace('expired=true', 'expired=yes') }, { line: base.replace('elapsedMs=4020', 'elapsedMs=120001') },
    { line: base.replace('elapsedMs=4020', 'elapsedMs=04020') }, { line: base.replace('elapsedMs=4020', 'elapsedMs=-1') },
    { line: base.replace('ageMs=3010', 'ageMs=999999') }, { line: base.replace('error=ASSERTION', `error=${contamination}`) },
    { line: `${base}\n${base}` }, { line: `${base} ${contamination}` }, { line: base.replace('phase=CONFIRM', 'phase=FIRST_IMPORT') },
    { line: base.replace('S3CiDiagnostic$FailureDetails', 'OtherHelper$FailureDetails') },
    { caseName: 'otherSourceMethod' }, { frameClass: 'com.chatgptcourses.OtherTest' },
    { failureMarker: false, other: `<system-out><![CDATA[${base}]]></system-out><system-err>${contamination}</system-err>` },
  ];
  for (const input of rejected) {
    const result = fixture.collect(input); assert.equal(result.tests[0].status, 'failed');
    assert.equal(result.tests[0].diagnostic?.storageFacts, undefined); assert.equal(JSON.stringify(result).includes(contamination), false);
  }
});

test('private inherited credentials and public bundle variables cannot enter CI child processes', () => {
  const inherited = { PATH: '/usr/bin', HOME: '/home/runner', JAVA_HOME: '/jdk', STRIPE_SECRET_KEY: contamination, POSTGRES_PASSWORD: contamination, GITHUB_TOKEN: contamination, NEXT_PUBLIC_SECRET: contamination, NODE_OPTIONS: contamination, STAGING_BASIC_PASSWORD: contamination, APP_ENV: 'local' };
  const env = isolatedEnvironment(inherited); assert.equal(Object.values(env).includes(contamination), false); assert.equal(env.APP_ENV, 'test'); assert.equal(env.STRIPE_ENABLED, 'false'); assert.equal(env.NODE_ENV, undefined);
  const build = isolatedEnvironment(inherited, true); assert.equal(build.APP_ENV, 'production'); assert.equal(build.SESSION_COOKIE_SECURE, 'true'); assert.equal(build.APP_PUBLISHED_LOCALES, '');
});

test('only attested synthetic app PNG bytes with exact hashes and dimensions may be published', t => {
  const directory = fixture(t), source = join(directory, 'source'), destination = join(directory, 'published'); mkdirSync(source);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFssAAAAASUVORK5CYII=', 'base64'), name = 'fr-390-catalogue-empty.png'; writeFileSync(join(source, name), bytes);
  const capture = { scenarioId: 'P19-01', path: name, sha256: digest(bytes), width: 1, height: 1, syntheticApp: true, provider: false, capturedFromLoopbackApp: true }, manifest = { schemaVersion: 1, fixtureDataOnly: true, captures: [capture] };
  assert.equal(copyApprovedScreenshots(source, destination, manifest).length, 1); assert.equal(readFileSync(join(destination, name)).equals(bytes), true);
  for (const bad of [{ provider: true }, { capturedFromLoopbackApp: false }, { path: '../outside.png' }, { sha256: '0'.repeat(64) }, { width: 2 }]) assert.throws(() => copyApprovedScreenshots(source, destination, { ...manifest, captures: [{ ...capture, ...bad }] }));
});

test('build transfer restores exact bytes while excluding cache, and refuses existing active build directories', t => {
  const directory = fixture(t), { base } = webBuild(directory), archive = join(directory, 'web.gz'), destination = join(directory, 'restored');
  const packed = packBuild(base, 'web', commit, archive), restored = restoreBuild(destination, 'web', commit, archive, packed.archiveSha256);
  assert.equal(restored.buildId, 'synthetic-build'); assert.equal(existsSync(join(destination, 'apps/web/.next/cache')), false);
  for (const file of restored.files) assert.equal(digest(readFileSync(join(destination, 'apps/web/.next', file.path))), file.sha256);
  assert.throws(() => restoreBuild(destination, 'web', commit, archive, packed.archiveSha256), /MUST_BE_ABSENT/u);
  assert.throws(() => restoreBuild(join(directory, 'wrong-source'), 'web', 'b'.repeat(40), archive, packed.archiveSha256), /IDENTITY_MISMATCH/u);
});

test('tampered archives and path traversal are rejected before any output is written', t => {
  const directory = fixture(t), { base } = webBuild(directory), archive = join(directory, 'web.gz'); packBuild(base, 'web', commit, archive);
  assert.throws(() => restoreBuild(join(directory, 'hash-rejected'), 'web', commit, archive, '0'.repeat(64)), /HASH_MISMATCH/u);
  const plain = gunzipSync(readFileSync(archive)), magicLength = Buffer.byteLength('COURSES_CI_BUILD_V1\n'), metaSize = Number(plain.readBigUInt64BE(magicLength)), start = magicLength + 8, metadata = JSON.parse(plain.toString('utf8', start, start + metaSize));
  metadata.files[0].path = '../outside'; const encoded = Buffer.from(JSON.stringify(metadata)), size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(encoded.length)); const malformed = gzipSync(Buffer.concat([plain.subarray(0, magicLength), size, encoded, plain.subarray(start + metaSize)])); writeFileSync(archive, malformed);
  const destination = join(directory, 'rejected'); assert.throws(() => restoreBuild(destination, 'web', commit, archive, digest(malformed)), /FILE_REFUSED/u); assert.equal(existsSync(destination), false);
});

test('build packaging refuses secret filenames and symlinked trees instead of following them', t => {
  const directory = fixture(t), { base, next } = webBuild(directory), archive = join(directory, 'web.gz'); writeFileSync(join(next, '.env.local'), contamination);
  assert.throws(() => packBuild(base, 'web', commit, archive), /SECRET_FILENAME/u); rmSync(join(next, '.env.local'));
  const external = join(directory, 'other'); mkdirSync(external); writeFileSync(join(external, 'hidden.js'), contamination); symlinkSync(external, join(next, 'server/linked'), 'junction');
  assert.throws(() => packBuild(base, 'web', commit, archive), /SYMLINK/u); assert.equal(existsSync(archive), false);
});

test('the final artifact boundary rejects raw reports and credential-bearing JSON', t => {
  const directory = fixture(t), publicDirectory = join(directory, 'public'); mkdirSync(publicDirectory); writeFileSync(join(publicDirectory, 'client.json'), JSON.stringify({ result: 'failed', count: 1 })); assert.equal(validatePublicReport(publicDirectory).length, 1);
  writeFileSync(join(publicDirectory, 'results.json'), '{}'); assert.throws(() => validatePublicReport(publicDirectory), /DATA_REFUSED/u); rmSync(join(publicDirectory, 'results.json'));
  writeFileSync(join(publicDirectory, 'client.json'), JSON.stringify({ result: 'Bearer SYNTHETIC_CREDENTIAL' })); assert.throws(() => validatePublicReport(publicDirectory), /DATA_REFUSED/u);
});
