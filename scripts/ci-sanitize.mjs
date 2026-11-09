import { readFileSync, readdirSync, lstatSync, realpathSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const scenarioNames = Object.freeze({ 'P19-01': 'catalogue-search', 'P19-02': 'paid-bilingual-learning', 'P19-03': 'retained-personal-work', 'P19-04': 'account-and-permissions' });
export const screenshots = Object.freeze(['fr-390-catalogue-empty.png', 'fr-390-catalogue-unavailable.png', 'fr-390-paid-original-note.png', 'en-390-paid-original-note.png', 'en-390-paid-french-quiz-history.png', 'fr-390-project-conflict.png', 'en-390-participation-provenance.png', 'en-390-contextual-support.png']);
const screenshotScenario = Object.fromEntries(screenshots.map((path, index) => [path, index < 2 ? 'P19-01' : index < 5 ? 'P19-02' : index === 5 ? 'P19-03' : 'P19-04']));
const states = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const number = (value, maximum = 86_400_000) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function inside(root, path) { const child = relative(resolve(root), resolve(path)); return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith(sep) && !/^[A-Za-z]:/u.test(child); }
export function regularOwnedFile(root, file) {
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('CI_ROOT_DIRECTORY_REQUIRED');
  if (!inside(root, file)) throw new Error('CI_PATH_OUTSIDE_ROOT');
  for (let current = resolve(root), index = 0, parts = relative(root, file).split(sep); index < parts.length; index++) {
    current = join(current, parts[index]); if (lstatSync(current).isSymbolicLink()) throw new Error('CI_SYMLINK_REFUSED');
  }
  if (!lstatSync(file).isFile() || !inside(realpathSync(root), realpathSync(file))) throw new Error('CI_REGULAR_FILE_REQUIRED');
  return file;
}

export function sanitizePlaywright(raw) {
  const tests = []; let droppedMetadata = 0;
  function walk(suites) {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) {
      for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
        const id = typeof spec.title === 'string' ? spec.title.match(/^(P19-0[1-4])(?:\b|\s|[·:])/u)?.[1] : undefined;
        if (!id) { droppedMetadata++; continue; }
        for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
          const attempts = (Array.isArray(test.results) ? test.results : []).map(result => ({ status: states.has(result.status) ? result.status : 'invalid', durationMs: number(result.duration), retry: count(result.retry ?? 0) }));
          tests.push({ id, name: scenarioNames[id], attempts });
        }
      }
      walk(suite.suites);
    }
  }
  walk(raw?.suites);
  return { format: 'playwright-summary-v1', counts: { passed: count(raw?.stats?.expected), failed: count(raw?.stats?.unexpected), skipped: count(raw?.stats?.skipped), flaky: count(raw?.stats?.flaky) }, durationMs: number(raw?.stats?.duration), tests, droppedMetadata,
    automaticRetriesObserved: tests.some(test => test.attempts.length > 1 || test.attempts.some(attempt => attempt.retry !== 0)),
    privacy: 'Only fixed scenario IDs/names, statuses, bounded counts and durations; titles, errors, snippets, output, attachments and context are omitted.' };
}

export function requireReleaseSuccess(result) {
  const ids = result.tests.map(test => test.id);
  if (ids.length !== 4 || new Set(ids).size !== 4 || Object.keys(scenarioNames).some(id => !ids.includes(id)) || result.counts.passed !== 4 || result.counts.failed !== 0 || result.counts.skipped !== 0 || result.counts.flaky !== 0 || result.automaticRetriesObserved || result.tests.some(test => test.attempts.length !== 1 || test.attempts[0].status !== 'passed' || test.attempts[0].retry !== 0)) throw new Error('CI_FOUR_RELEASE_SCENARIOS_MUST_PASS_ONCE');
}

export function requireJUnitSuccess(suites, expected) {
  const names = suites.map(suite => suite.suite);
  if (!expected.length || names.length !== expected.length || new Set(names).size !== names.length || expected.some(name => !names.includes(name)) || suites.some(suite => !suite.counts.tests || suite.counts.tests !== suite.tests.length || suite.counts.failures !== 0 || suite.counts.errors !== 0 || suite.counts.skipped !== 0 || suite.tests.some(test => test.status !== 'passed'))) throw new Error('CI_ALL_SOURCE_TEST_SUITES_MUST_PASS_WITHOUT_SKIPS');
}

const safeJavaName = value => typeof value === 'string' && /^[A-Za-z_$][A-Za-z0-9_$.]{0,199}$/u.test(value) && !/(?:whsec_|(?:sk|pk)_(?:test|live)_|bearer|cookie|authorization)/iu.test(value);
const attributes = text => Object.fromEntries([...text.matchAll(/([A-Za-z][A-Za-z0-9_-]*)="([^"<>]*)"/gu)].map(match => [match[1], match[2]]));
export function sanitizeSurefire(xml) {
  if (typeof xml !== 'string' || xml.length > 40 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error('CI_JUNIT_SOURCE_REFUSED');
  // A console body can contain text that looks like XML test metadata. Remove
  // these payload regions before inspecting any tags; never promote their text
  // into a published test name or a second testcase.
  const metadata = xml.replace(/<!--[\s\S]*?-->/gu, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '')
    .replace(/<(properties|system-out|system-err)\b[^>]*>[\s\S]*?<\/\1>/gu, '')
    .replace(/<(failure|error|skipped)\b[^>]*(?:\/>|>[\s\S]*?<\/\1>)/gu, (_match, name) => `<${name}/>`);
  const root = metadata.match(/<testsuite\s+([^>]+)>/u); if (!root) throw new Error('CI_JUNIT_SUITE_REQUIRED');
  const data = attributes(root[1]);
  const result = { format: 'junit-summary-v1', suite: safeJavaName(data.name) ? data.name : 'REDACTED_SUITE', counts: { tests: count(Number(data.tests)), failures: count(Number(data.failures)), errors: count(Number(data.errors)), skipped: count(Number(data.skipped)) }, durationMs: number(Number(data.time) * 1000), tests: [], droppedMetadata: 0 };
  for (const match of metadata.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu)) {
    const item = attributes(match[1]), content = match[2] ?? '';
    const valid = safeJavaName(item.classname) && item.classname.startsWith('com.chatgptcourses.') && safeJavaName(item.name);
    if (!valid) result.droppedMetadata++;
    result.tests.push({ name: valid ? `${item.classname}#${item.name}` : 'REDACTED_TEST', status: /<error\b/u.test(content) ? 'error' : /<failure\b/u.test(content) ? 'failed' : /<skipped\b/u.test(content) ? 'skipped' : 'passed', durationMs: number(Number(item.time) * 1000) });
  }
  return result;
}

export function sanitizeTap(text) {
  const result = { format: 'tap-summary-v1', counts: {}, durationMs: null };
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const values = [...String(text).matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gmu'))];
    result.counts[key] = values.length ? count(Number(values.at(-1)[1])) : null;
  }
  const duration = [...String(text).matchAll(/^# duration_ms ([\d.]+)$/gmu)].at(-1)?.[1]; result.durationMs = duration ? number(Number(duration)) : null;
  return result;
}

export function copyApprovedScreenshots(evidence, destination, manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.fixtureDataOnly !== true || !Array.isArray(manifest.captures) || manifest.captures.length > screenshots.length) throw new Error('CI_CAPTURE_MANIFEST_REFUSED');
  const copied = [], seen = new Set();
  for (const capture of manifest.captures) {
    if (!Object.hasOwn(scenarioNames, capture.scenarioId) || screenshotScenario[capture.path] !== capture.scenarioId || seen.has(capture.path) || capture.syntheticApp !== true || capture.provider !== false || capture.capturedFromLoopbackApp !== true || !/^[a-f0-9]{64}$/u.test(capture.sha256)) throw new Error('CI_CAPTURE_NOT_APPROVED');
    seen.add(capture.path);
    const file = regularOwnedFile(evidence, join(evidence, capture.path)), bytes = readFileSync(file);
    if (bytes.length < 33 || bytes.length > 15 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || digest(bytes) !== capture.sha256 || bytes.readUInt32BE(16) !== capture.width || bytes.readUInt32BE(20) !== capture.height || capture.width < 1 || capture.width > 4096 || capture.height < 1 || capture.height > 20000) throw new Error('CI_CAPTURE_BYTES_MISMATCH');
    mkdirSync(destination, { recursive: true }); copyFileSync(file, join(destination, capture.path));
    copied.push({ scenarioId: capture.scenarioId, path: capture.path, sha256: capture.sha256, width: capture.width, height: capture.height });
  }
  return copied;
}

export function collectSurefire(directory) {
  return readdirSync(directory).filter(name => /^TEST-[A-Za-z0-9_$.]+\.xml$/u.test(name)).toSorted().map(name => sanitizeSurefire(readFileSync(regularOwnedFile(directory, join(directory, name)), 'utf8')));
}
export function writePublicJson(path, value) { mkdirSync(dirnameOf(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); }
function dirnameOf(path) { return resolve(path, '..'); }
