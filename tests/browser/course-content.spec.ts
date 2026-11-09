import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { courseRecord, prepareCourseFixture, preparedFile, publishCourseFixture, type CourseFixture } from './course-content-fixture';
import { runCourseJourney } from './course-content-flow';
import { csrfHeaders } from './editorial-fixture';
import { methodLearner, loginMethodAccount } from './methods-fixture';
import { checkedUuid, commerceSql } from './commerce-fixture';

test.describe('P18 parcours rédactionnel réel FR/EN, import et ressources', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture;
  const journeys: Awaited<ReturnType<typeof runCourseJourney>>[] = [];
  test.beforeAll(async ({ playwright }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    fixture = await prepareCourseFixture(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });

  test('01 · plan puis import réel relançable, 28 brouillons et 12 aperçus privés avant publication technique', async () => {
    expect(fixture.records.size).toBe(28);
    expect([...fixture.records.values()].every(record => record.value.state === 'DRAFT' && record.value.publishedRevisionId === null)).toBe(true);
    expect(fixture.applied.files).toHaveLength(18);
    await publishCourseFixture(editor, fixture);
    expect([...fixture.records.values()].every(record => record.value.state === 'PUBLISHED')).toBe(true);
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'technical-publication.json'), JSON.stringify({
      technicalFixtureOnly: true, humanEditorialReview: false, sharedContentChanged: false, commercialActivation: false,
      reason: 'explicit automated technical fixture, not human review', translations: 28,
      items: [...fixture.records.entries()].map(([key, record]) => ({ key, resourceId: record.value.resourceId, versionId: record.value.versionId,
        translationId: record.value.id, publishedRevisionId: record.value.publishedRevisionId, state: record.value.state })),
    }, null, 2) + '\n', 'utf8');
  });

  for (const locale of ['fr', 'en'] as const) test(`${locale} · six leçons, méthode volontaire, atelier, grille déclarative, transfert BR02 et neuf téléchargements`, async ({ page, context }) => {
    // Also makes a deliberately targeted locale run self-contained after the same draft checks.
    await publishCourseFixture(editor, fixture);
    const observations: Record<string, unknown>[] = [], pending: Promise<void>[] = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      const kind = /\/me\/resources\//.test(path) ? 'member-resource' : /\/me\/enrollments\/[^/]+\/activities\//.test(path) ? 'learning-activity'
        : /\/me\/enrollments\/[^/]+\/visits$/.test(path) ? 'visit' : /\/me\/project-templates\//.test(path) ? 'member-project-template' : null;
      if (!kind) return;
      const entry: Record<string, unknown> = { kind, method: response.request().method(), status: response.status() }; observations.push(entry);
      pending.push((async () => { try { const body = await response.json() as Record<string, unknown>;
        if (typeof body.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.code)) entry.code = body.code;
        if (typeof body.accessStatus === 'string') entry.accessStatus = ['ACTIVE','PROTECTED','REVOKED','EXPIRED'].includes(body.accessStatus) ? body.accessStatus : 'OTHER';
        if (typeof body.availability === 'string') entry.availability = ['PUBLISHED','STALE','WITHDRAWN','MISSING_TRANSLATION'].includes(body.availability) ? body.availability : 'OTHER';
        entry.bodyPresent = Boolean(body.document || body.resource && typeof body.resource === 'object' && 'document' in body.resource && body.resource.document);
      } catch { entry.decoded = false; } })());
    });
    try { journeys.push(await runCourseJourney(page, context, fixture, locale)); }
    catch (error) {
      await Promise.allSettled(pending);
      const me = await context.request.get('/api/v1/auth/me'); let database: unknown = { available: false };
      if (me.status() === 200) {
        const actor = checkedUuid((await me.json() as { id: string }).id);
        database = JSON.parse(commerceSql(`SELECT jsonb_build_object('grantCount',count(*),'activeGrantCount',count(*) FILTER(WHERE revoked_at IS NULL AND starts_at<=clock_timestamp() AND(expires_at IS NULL OR expires_at>clock_timestamp())),'manualTestGrantCount',count(*) FILTER(WHERE origin_type='MANUAL_TEST')) FROM access_grants WHERE owner_id='${actor}';`));
      }
      writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-failure-before-cleanup.json`), JSON.stringify({
        recordedBeforeCleanup: true, authStatus: me.status(), observations: observations.slice(-12), database,
        privacy: 'No URL, identity, cookie, header, signature, secret or teaching/personal text recorded.', automaticRetry: false,
      }, null, 2) + '\n', 'utf8');
      throw error;
    }
  });

  test('04 · fichiers de corrigé cloisonnés, corps protégé absent du public et travail personnel propriétaire', async ({ playwright }) => {
    expect(journeys).toHaveLength(2);
    const downloaded = journeys.flatMap(journey => journey.receipt.downloads), exports = journeys.flatMap(journey => journey.receipt.localExports);
    expect(downloaded).toHaveLength(18); expect(new Set(downloaded.map(file => `${file.key}:${file.locale}`)).size).toBe(18);
    expect(new Set(downloaded.map(file => file.assetId)).size).toBe(18); expect(exports).toHaveLength(4);
    expect(downloaded.filter(file => file.purpose === 'SOLUTION')).toHaveLength(4);
    const outsider = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const source = courseRecord(fixture, 'activity-m04', 'fr').value;
      const publicResponse = await outsider.get(`/api/v1/catalog/resources/${source.resourceId}/versions/${source.versionId}?locale=fr`);
      expect(publicResponse.status()).toBe(200); expect((await publicResponse.json() as { document: unknown }).document).toBeNull();
      const solution = preparedFile(fixture, 'commented-solution-br01', 'fr');
      const generic = await outsider.post(`/api/v1/assets/${solution.assetId}/download-access`, { headers: await csrfHeaders(outsider),
        data: { resourceId: source.resourceId, versionId: source.versionId, locale: 'fr', enrollmentId: null } });
      expect(generic.status()).toBe(404);
      const account = await methodLearner(outsider, 'fr'); await loginMethodAccount(outsider, account);
      expect((await outsider.get(`/api/v1/me/projects/${journeys[0].projects[0].id}`)).status()).toBe(404);
    } finally { await outsider.dispose(); }
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'course-download-checks.json'), JSON.stringify({
      preparedFiles: 18, uniqueActualUiDownloads: 18, solutionFilesOnlyAfterExplicitReveal: 4,
      fileBytesAndSha256Matched: true, utf8Decoded: true, personalLocalMarkdownExports: 4,
      exportsDidNotImplicitlySave: true, interfaceLocales: ['fr', 'en'], lessonsOpened: 12,
      accessOrigin: 'MANUAL_TEST in owned tmpfs only, no purchase/payment claim',
      limits: ['Technical isolated publication does not constitute human editorial review or authorise sale.',
        'Lesson screenshots are representative viewports; all prepared teaching blocks are separately asserted readable in each real page.',
        'No video, measured lesson duration, external email, live Stripe or production deployment is claimed.'],
      files: downloaded, localExports: exports,
    }, null, 2) + '\n', 'utf8');
  });
});
