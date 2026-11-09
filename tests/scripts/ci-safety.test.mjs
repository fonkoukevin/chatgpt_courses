import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { sanitizePlaywright, sanitizeSurefire, sanitizeTap, digest, copyApprovedScreenshots, requireReleaseSuccess, requireJUnitSuccess, inside } from '../../scripts/ci-sanitize.mjs';
import { packBuild, restoreBuild } from '../../scripts/ci-build.mjs';
import { isolatedEnvironment } from '../../scripts/ci-run.mjs';
import { validatePublicReport } from '../../scripts/ci-report.mjs';

const temporaryRoot = resolve('.runtime/ci-unit-fixtures'); mkdirSync(temporaryRoot, { recursive: true });
function fixture(t) { const directory = mkdtempSync(join(temporaryRoot, 'case-')); t.after(() => { if (!inside(temporaryRoot, directory)) throw new Error('TEST_CLEANUP_OUTSIDE_ROOT'); rmSync(directory, { recursive: true, force: true }); }); return directory; }
const contamination = 'SYNTHETIC_PRIVATE_ABC_39';
function passingRelease() { return { suites: [{ specs: ['01', '02', '03', '04'].map(id => ({ title: `P19-${id} ${contamination}`, tests: [{ results: [{ status: 'passed', duration: 15, retry: 0, error: { message: contamination }, stdout: [contamination], attachments: [{ body: contamination }] }] }] })) }], stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0, duration: 60 } }; }
function webBuild(directory) { const base = join(directory, 'source'), next = join(base, 'apps/web/.next'); mkdirSync(join(next, 'server/app'), { recursive: true }); mkdirSync(join(next, 'static/chunks'), { recursive: true }); mkdirSync(join(next, 'cache'), { recursive: true }); writeFileSync(join(next, 'BUILD_ID'), 'synthetic-build'); writeFileSync(join(next, 'server/app/page.js'), 'module.exports = 1;'); writeFileSync(join(next, 'static/chunks/test.js'), 'export const n=1;'); writeFileSync(join(next, 'cache/private.tmp'), contamination); return { base, next }; }
const commit = 'a'.repeat(40);

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
