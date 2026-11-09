import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext, type Download, type Page } from '@playwright/test';
import type { ContentDocument, ContentView } from '../../apps/web/src/lib/api/generated/types.gen';
import { activityDiscoveryHref, courseActivityHref, resourceHref } from '../../apps/web/src/lib/public/routes';
import { contentAction, currentContent, type RecordedContent } from './editorial-api';
import { loginEditor } from './editorial-fixture';
import { checkedUuid, commerceSql } from './commerce-fixture';

export type CourseLocale = 'fr' | 'en';
type ManifestItem = { key: string; kind: string; locale: CourseLocale; sourceFile: string; childKeys: string[]; resourceFileKeys: string[]; solutionFileKeys: string[] };
type ManifestFile = { key: string; locale: CourseLocale; path: string; purpose: 'RESOURCE' | 'SOLUTION'; sha256: string };
type ImportItem = { key: string; locale: CourseLocale; state: string; translationId: string | null; resourceId: string | null; versionId: string | null; revisionId: string | null };
type ImportFile = { key: string; locale: CourseLocale; purpose: 'RESOURCE' | 'SOLUTION'; assetId: string | null; state: string };
type ImportReport = { mode: 'PLAN' | 'APPLY'; namespace: string; items: ImportItem[]; files: ImportFile[] };
export type DownloadReceipt = { key: string; locale: CourseLocale; purpose: 'RESOURCE' | 'SOLUTION'; assetId: string; filename: string; bytes: number; sha256: string; utf8: true; actualUiDownload: true };
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function contained(base: string, child: string) {
  const file = realpathSync(resolve(base, child)), difference = relative(realpathSync(base), file);
  if (!difference || difference.startsWith('..') || isAbsolute(difference)) throw new Error('Prepared course file must remain inside its manifest directory.');
  return file;
}
function runImport(mode: '--plan' | '--apply', actor: string, manifest: string): ImportReport {
  const jar = process.env.COURSES_BROWSER_API_JAR, privateDirectory = process.env.COURSES_BROWSER_LOGS;
  if (process.env.APP_ENV !== 'test' || !jar || !privateDirectory || resolve(jar) !== join(resolve(privateDirectory), 'api.jar')) throw new Error('The owned copied browser JAR is required.');
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const result = spawnSync(java, ['-Dloader.main=com.chatgptcourses.editorial.importing.ContentImportMain', '-cp', jar,
    'org.springframework.boot.loader.launch.PropertiesLauncher', mode, '--actor', checkedUuid(actor), '--manifest', manifest],
  { cwd: process.cwd(), env: process.env, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    const safe = /^Content import failed: ([A-Z_]+|invalid configuration, manifest or source)\s*$/.exec(result.stderr.trim())?.[1] ?? 'CLI_NOT_CONFIRMED';
    throw new Error(`Isolated content import ${mode} failed: ${safe}; private configuration and output are not printed.`);
  }
  let value: ImportReport;
  try { value = JSON.parse(result.stdout.trim()) as ImportReport; } catch { throw new Error('The import CLI must return a single sanitized JSON report.'); }
  expect(value.mode).toBe(mode === '--plan' ? 'PLAN' : 'APPLY'); expect(value.namespace).toBe('course-client-proposal');
  expect(value.items).toHaveLength(28); expect(value.files).toHaveLength(18); return value;
}

export async function prepareCourseFixture(request: APIRequestContext) {
  const editor = await loginEditor(request);
  const prepared = spawnSync(process.execPath, [join(process.cwd(), 'scripts/prepare-course-content.mjs')], { cwd: process.cwd(), env: process.env,
    windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
  if (prepared.status !== 0) throw new Error('Real course preparation failed; no source content or private environment is printed.');
  const directory = realpathSync(join(process.cwd(), '.runtime/content-course-client-proposal')), manifest = join(directory, 'manifest.json');
  const input = JSON.parse(readFileSync(manifest, 'utf8')) as { schemaVersion: number; namespace: string; items: ManifestItem[]; files: ManifestFile[] };
  expect(input.schemaVersion).toBe(1); expect(input.namespace).toBe('course-client-proposal');
  expect(input.items).toHaveLength(28); expect(input.files).toHaveLength(18);
  for (const file of input.files) expect(sha256(readFileSync(contained(directory, file.path)))).toBe(file.sha256);
  const plan = runImport('--plan', editor.id, manifest);
  expect(plan.items.every(item => item.state === 'CREATE_DRAFT' && item.translationId === null)).toBe(true);
  const applied = runImport('--apply', editor.id, manifest), replay = runImport('--apply', editor.id, manifest);
  expect(applied.items.every(item => item.state === 'CREATED_DRAFT')).toBe(true);
  expect(replay.items.every(item => item.state === 'UNCHANGED')).toBe(true);
  expect(applied.files.every(file => file.state === 'READY' && file.assetId !== null)).toBe(true);
  expect(replay.items.map(({ state: _state, ...item }) => item)).toEqual(applied.items.map(({ state: _state, ...item }) => item));
  expect(replay.files.map(({ state: _state, ...file }) => file)).toEqual(applied.files.map(({ state: _state, ...file }) => file));
  const records = new Map<string, RecordedContent>();
  for (const item of applied.items) {
    const record = await currentContent(request, checkedUuid(item.translationId!));
    expect(record.value.state).toBe('DRAFT'); expect(record.value.publishedRevisionId).toBeNull(); records.set(`${item.key}:${item.locale}`, record);
  }
  for (const item of input.items.filter(item => item.key.startsWith('activity-'))) {
    const record = records.get(`${item.key}:${item.locale}`)!;
    const preview = await request.get(`/api/v1/admin/contents/${record.value.id}/preview`); expect(preview.status()).toBe(200);
    const body = await preview.json() as ContentView, expected = JSON.parse(readFileSync(contained(directory, item.sourceFile), 'utf8')) as { document: ContentDocument };
    expect(body.state).toBe('DRAFT'); expect(body.document?.blocks).toEqual(expected.document.blocks);
    expect(body.document?.exercise?.correction === expected.document.exercise?.correction).toBe(true);
    const publicResponse = await request.get(`/api/v1/catalog/resources/${record.value.resourceId}/versions/${record.value.versionId}?locale=${item.locale}`);
    expect(publicResponse.status(), 'Unpublished versions have no public projection').toBe(404);
  }
  const evidence = process.env.COURSES_BROWSER_EVIDENCE!;
  for (const [name, value] of [['import-plan', plan], ['import-applied', applied], ['import-replay', replay]] as const) writeFileSync(join(evidence, `${name}.json`), JSON.stringify(value, null, 2) + '\n', 'utf8');
  writeFileSync(join(evidence, 'import-draft-checks.json'), JSON.stringify({ copiedApiJarSha256: sha256(readFileSync(process.env.COURSES_BROWSER_API_JAR!)),
    draftTranslations: 28, modulePreviews: 12, publicUnpublishedVersion404: 12, readyFiles: 18, replayUnchanged: true,
    publicationAtThisStage: false, commercialActivation: false }, null, 2) + '\n', 'utf8');
  return { editor, directory, manifest, input, applied, records, published: false };
}
export type CourseFixture = Awaited<ReturnType<typeof prepareCourseFixture>>;
export function courseRecord(fixture: CourseFixture, key: string, locale: CourseLocale): RecordedContent {
  const record = fixture.records.get(`${key}:${locale}`); if (!record) throw new Error('Prepared content identity missing.'); return record;
}
export function preparedActivity(fixture: CourseFixture, key: string, locale: CourseLocale) {
  const item = fixture.input.items.find(item => item.key === `activity-${key}` && item.locale === locale)!;
  return JSON.parse(readFileSync(contained(fixture.directory, item.sourceFile), 'utf8')) as { title: string; document: ContentDocument };
}
export function preparedFile(fixture: CourseFixture, key: string, locale: CourseLocale) {
  const expected = fixture.input.files.find(file => file.key === key && file.locale === locale), imported = fixture.applied.files.find(file => file.key === key && file.locale === locale);
  if (!expected || !imported?.assetId) throw new Error('Ready imported file identity missing.');
  return { ...expected, assetId: checkedUuid(imported.assetId), bytes: readFileSync(contained(fixture.directory, expected.path)) };
}

export async function publishCourseFixture(request: APIRequestContext, fixture: CourseFixture) {
  if (fixture.published) return;
  for (const key of [...Array.from({ length: 6 }, (_, i) => `activity-m0${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `module-m0${i + 1}`), 'course-client-proposal', 'method-client-proposal']) {
    for (const locale of ['fr', 'en'] as const) {
      let input = await currentContent(request, courseRecord(fixture, key, locale).value.id);
      const reason = 'explicit automated technical fixture, not human review';
      if (input.value.state === 'DRAFT') input = await contentAction(request, input, 'transition', { state: 'TO_REVIEW', reason, sourceRevisionId: null });
      const source = input.value.sourceTranslationId ? await currentContent(request, input.value.sourceTranslationId) : null;
      input = await contentAction(request, input, 'transition', { state: 'READY', reason, sourceRevisionId: source?.value.currentRevisionId ?? null });
      const published = await contentAction(request, input, 'publish', { revisionId: input.value.currentRevisionId, reason });
      fixture.records.set(`${key}:${locale}`, published);
    }
    expect(courseRecord(fixture, key, 'fr').value.versionId).toBe(courseRecord(fixture, key, 'en').value.versionId);
  }
  fixture.published = true;
}
export function grantCourseTestAccess(ownerId: string, fixture: CourseFixture) {
  const course = courseRecord(fixture, 'course-client-proposal', 'fr').value, id = randomUUID(), origin = randomUUID();
  const result = commerceSql(`INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at)
    VALUES('${id}','${checkedUuid(ownerId)}','${checkedUuid(course.resourceId)}','${checkedUuid(course.versionId)}','MANUAL_TEST','${origin}','["fr","en"]'::jsonb,'PINNED',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day');
    SELECT count(*) FROM access_grants WHERE id='${id}' AND origin_type='MANUAL_TEST' AND owner_id='${checkedUuid(ownerId)}';`);
  expect(result).toBe('1');
  return { origin: 'MANUAL_TEST', scope: 'P18 owned tmpfs only; no purchase or payment claimed', grantId: id };
}
export function courseLessonHref(fixture: CourseFixture, key: string, locale: CourseLocale) {
  const course = courseRecord(fixture, 'course-client-proposal', locale).value, activity = courseRecord(fixture, `activity-${key}`, locale).value;
  return courseActivityHref(locale, course.slug, activity.slug, activity.resourceId, activity.versionId, course.versionId);
}
export const freeLessonHref = (fixture: CourseFixture, locale: CourseLocale) => {
  const value = courseRecord(fixture, 'activity-m01', locale).value; return activityDiscoveryHref(locale, value.resourceId, value.versionId);
};
export const courseMethodHref = (fixture: CourseFixture, locale: CourseLocale) => {
  const value = courseRecord(fixture, 'method-client-proposal', locale).value;
  return resourceHref({ locale, kind: 'METHOD_TEMPLATE', slug: value.slug, resourceId: value.resourceId, versionId: value.versionId });
};

export async function downloadBytes(download: Download) {
  const stream = await download.createReadStream(); if (!stream) throw new Error('Real browser download stream missing.');
  const chunks: Buffer[] = []; let size = 0; for await (const chunk of stream) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 1024 * 1024) throw new Error('Course download exceeds the expected bound.'); chunks.push(bytes); }
  return Buffer.concat(chunks);
}
export async function captureCourse(page: Page, name: string, fullPage = false) {
  await page.getByRole('main').focus(); await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.skip-link').evaluate(node => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage, animations: 'disabled' });
}
