import { randomUUID } from 'node:crypto';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext } from '@playwright/test';
import type { ActivityNoteView, ActivityProgressView, CreateContent, EnrollmentView, LearningActivity, MediaAccessContext, MediaProgressView, QuizAttemptView } from '../../apps/web/src/lib/api/generated/types.gen';
import { loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { learningContent, br01Answers, learningHeaders } from './learning-fixture';
import { publishPublicContent } from './public-content-fixture';
import { courseActivityHref, resourceHref } from '../../apps/web/src/lib/public/routes';

export type Locale = 'fr' | 'en';
export type BilingualPair = Record<Locale, RecordedContent>;
const locales = ['fr', 'en'] as const;

/** Owned tmpfs database and real editorial publication; no production seed or paid access is fabricated. */
export async function createBilingualFixture(request: APIRequestContext) {
  const editor = await loginEditor(request), marker = `p16-${randomUUID()}`, draftMarker = `P16-UNPUBLISHED-${randomUUID()}`;
  const mediaIds = { fr: randomUUID(), en: randomUUID() };
  async function pair(kind: CreateContent['kind'], name: Record<Locale, string>, children: string[] = [], video = false, publishEnglish = true): Promise<BilingualPair> {
    const command = learningContent('fr'); command.kind = kind; command.title = `Recette P16 · ${name.fr}`;
    command.summary = `Ressource fictive française de recette P16 : ${name.fr}.`;
    command.slug = `${marker}-${kind.toLowerCase()}-${randomUUID()}-fr`; command.childVersionIds = children;
    command.reason = 'P16 explicitly fictional equivalent publication fixture';
    command.document.media = video ? [{ assetId: mediaIds.fr, kind: 'VIDEO', label: 'Clip CC0 technique de test, aucune leçon commerciale', required: true }] : [];
    let fr = await createContent(request, command);
    const translated = learningContent('en');
    if (!publishEnglish) translated.document.blocks.push({ type: 'PARAGRAPH', text: draftMarker, url: null });
    translated.document.media = video ? [{ assetId: mediaIds.en, kind: 'VIDEO', label: 'Technical CC0 test clip, no commercial lesson', required: true }] : [];
    let en = await contentAction(request, fr, 'translations', { locale: 'en', slug: `${marker}-${kind.toLowerCase()}-${randomUUID()}-en`,
      title: `P16 check · ${name.en}`, summary: `Fictional English P16 verification resource: ${name.en}.`, document: translated.document,
      reason: 'P16 explicit equivalent translation; case facts stay unchanged' }, 201);
    if (video) importClips(editor.id, fr.value.resourceId, fr.value.versionId, mediaIds);
    fr = await publishPublicContent(request, fr);
    if (publishEnglish) en = await publishPublicContent(request, en);
    return { fr: await currentContent(request, fr.value.id), en: await currentContent(request, en.value.id) };
  }
  async function onlyFrench(kind: CreateContent['kind'], name: string, children: string[] = []) {
    const command = learningContent('fr'); command.kind = kind; command.title = `Recette P16 · ${name}`;
    command.slug = `${marker}-${kind.toLowerCase()}-${randomUUID()}`; command.childVersionIds = children;
    command.reason = 'P16 missing English translation fixture, never implicitly translated';
    return publishPublicContent(request, await createContent(request, command));
  }
  const activity = await pair('ACTIVITY', { fr: 'activité équivalente', en: 'equivalent activity' }, [], true);
  const module = await pair('MODULE', { fr: 'module commun', en: 'shared module' }, [activity.fr.value.versionId]);
  const course = await pair('COURSE', { fr: 'parcours commun', en: 'shared course' }, [module.fr.value.versionId]);
  const guide = await pair('GUIDE', { fr: 'guide localisé', en: 'localized guide' });
  const missingGuide = await onlyFrench('GUIDE', 'guide sans traduction publiée');
  const draftGuide = await pair('GUIDE', { fr: 'guide avec traduction en brouillon', en: 'unpublished draft guide' }, [], false, false);
  const frenchModule = await onlyFrench('MODULE', 'module français seulement', [activity.fr.value.versionId]);
  // The English course stays DRAFT: editorial readiness must not publish a programme whose module has no English publication.
  const missingParentCourse = await pair('COURSE', { fr: 'parent non traduit', en: 'untranslated parent' }, [frenchModule.value.versionId], false, false);
  return { editor, marker, draftMarker, activity, module, course, guide, missingGuide, draftGuide, frenchModule, missingParentCourse, mediaIds };
}
export type BilingualFixture = Awaited<ReturnType<typeof createBilingualFixture>>;

function importClips(actorId: string, resourceId: string, versionId: string, mediaIds: Record<Locale, string>) {
  const directory = process.env.COURSES_BROWSER_PRIVATE_DIRECTORY;
  if (process.env.APP_ENV !== 'test' || !directory || process.env.VIDEO_ENABLED !== 'true') throw new Error('Owned local video recipe required.');
  const filename = `p16-${randomUUID()}.mp4`, manifest = join(directory, `p16-manifest-${randomUUID()}.json`);
  copyFileSync(join(process.cwd(), 'tests/fixtures/media/flower.mp4'), join(directory, filename));
  writeFileSync(manifest, JSON.stringify({ actorId, items: locales.map(locale => ({ id: mediaIds[locale], resourceId, versionId, locale, file: filename,
    transcript: locale === 'fr' ? 'Fixture technique CC0 française, aucune leçon produite.' : 'English technical CC0 fixture, no produced lesson.',
    captionsVtt: `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${locale === 'fr' ? 'Test technique seulement.' : 'Technical test only.'}\n` })) }), { flag: 'wx', mode: 0o600 });
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  // Import the exact owned recipe artifact, never the Maven output that another validation may rebuild.
  const result = spawnSync(java, ['-Dloader.main=com.chatgptcourses.media.importing.LocalVideoImportMain', '-cp', join(directory, 'api.jar'),
    'org.springframework.boot.loader.launch.PropertiesLauncher', manifest], { windowsHide: true, encoding: 'utf8', timeout: 90_000 });
  expect(result.status === 0, 'Real local video importer succeeds; private process output is intentionally omitted').toBe(true);
}

export function publicHref(source: RecordedContent) {
  const value = source.value;
  if (value.kind === 'MODULE' || value.kind === 'ACTIVITY') throw new Error('Public detail route requires a public page kind.');
  return resourceHref({ ...value, kind: value.kind });
}
export function activityHref(fixture: BilingualFixture, locale: Locale, course = fixture.course) {
  const activity = fixture.activity[locale].value, parent = course[locale].value;
  return courseActivityHref(locale, parent.slug, activity.slug, activity.resourceId, activity.versionId, parent.versionId);
}
export function publicContextPath(fixture: BilingualFixture, locale: Locale, course = fixture.course) {
  return `/api/v1/catalog/resources/${course.fr.value.resourceId}/versions/${course.fr.value.versionId}/activities/${fixture.activity.fr.value.resourceId}/versions/${fixture.activity.fr.value.versionId}?locale=${locale}`;
}
export async function enroll(request: APIRequestContext, fixture: BilingualFixture, actor: string) {
  const response = await request.post('/api/v1/me/enrollments', { headers: await learningHeaders(request, actor), data: {
    courseResourceId: fixture.course.fr.value.resourceId, courseVersionId: fixture.course.fr.value.versionId, locale: 'fr' } });
  expect(response.status()).toBe(201); return await response.json() as EnrollmentView;
}
export async function learningState(request: APIRequestContext, fixture: BilingualFixture, enrollment: string, locale: Locale) {
  const activity = fixture.activity.fr.value;
  const response = await request.get(`/api/v1/me/enrollments/${enrollment}/activities/${activity.resourceId}?activityVersionId=${activity.versionId}&locale=${locale}`);
  expect(response.status()).toBe(200); return await response.json() as LearningActivity;
}
export async function completeActivity(request: APIRequestContext, fixture: BilingualFixture, actor: string, enrollment: string) {
  const activity = fixture.activity.fr.value, path = `/api/v1/me/activity-progress/${activity.resourceId}`;
  const before = await request.get(`${path}?enrollmentId=${enrollment}&activityVersionId=${activity.versionId}`); expect(before.status()).toBe(200);
  const response = await request.put(path, { headers: await learningHeaders(request, actor, before.headers().etag),
    data: { enrollmentId: enrollment, activityVersionId: activity.versionId, locale: 'fr', read: true, completed: true } });
  expect(response.status()).toBe(200); return await response.json() as ActivityProgressView;
}
export async function saveFrenchNote(request: APIRequestContext, fixture: BilingualFixture, actor: string, text: string) {
  const activity = fixture.activity.fr.value;
  const response = await request.post('/api/v1/me/activity-notes', { headers: await learningHeaders(request, actor),
    data: { activityId: activity.resourceId, activityVersionId: activity.versionId, locale: 'fr', text } });
  expect(response.status()).toBe(201); return await response.json() as ActivityNoteView;
}
export async function attemptQuiz(request: APIRequestContext, fixture: BilingualFixture, actor: string, enrollment: string) {
  const activity = fixture.activity.fr.value;
  const response = await request.post(`/api/v1/activities/${activity.resourceId}/quiz-attempts`, { headers: await learningHeaders(request, actor), data: {
    enrollmentId: enrollment, activityVersionId: activity.versionId, revisionId: activity.publishedRevisionId, locale: 'fr', submissionId: randomUUID(), answers: br01Answers } });
  expect(response.status()).toBe(201); return await response.json() as QuizAttemptView;
}
export function videoContext(fixture: BilingualFixture, locale: Locale): MediaAccessContext {
  return { resourceId: fixture.activity.fr.value.resourceId, versionId: fixture.activity.fr.value.versionId, locale, enrollmentId: null };
}
export async function videoProgress(request: APIRequestContext, fixture: BilingualFixture, locale: Locale) {
  const params = new URLSearchParams({ resourceId: fixture.activity.fr.value.resourceId, versionId: fixture.activity.fr.value.versionId, locale });
  const response = await request.get(`/api/v1/me/media-progress/${fixture.mediaIds[locale]}?${params}`); expect(response.status()).toBe(200);
  return { value: await response.json() as MediaProgressView, etag: response.headers().etag };
}
