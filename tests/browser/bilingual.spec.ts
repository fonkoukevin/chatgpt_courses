import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { ActivityNoteView, ContentView, LearningDashboard, MediaProgressView, PublicActivityContext, QuizAttemptPage, QuizAttemptView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getAccountDictionary } from '../../apps/web/src/lib/i18n/account';
import { getVideoDictionary } from '../../apps/web/src/lib/i18n/video';
import { getCmsSlugDictionary } from '../../apps/web/src/lib/i18n/cms-slug';
import { getMemberAccessDictionary } from '../../apps/web/src/lib/i18n/member-access';
import { cmsPath } from '../../apps/web/src/lib/cms/routes';
import { activityDiscoveryHref, catalogueHref } from '../../apps/web/src/lib/public/routes';
import { accountPath, attestationsPath } from '../../apps/web/src/lib/account/routes';
import { learningHeaders } from './learning-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';
import { contentAction, currentContent } from './editorial-api';
import { publishPublicContent } from './public-content-fixture';
import { issue, nameProfile } from './account-fixture';
import { observeBilingualMedia } from './bilingual-diagnostics';
import { activityHref, attemptQuiz, completeActivity, createBilingualFixture, enroll, learningState, publicContextPath, publicHref,
  saveFrenchNote, videoContext, videoProgress, type BilingualFixture, type Locale } from './bilingual-fixture';

async function capture(page: Page, name: string, width = 390) {
  await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
  for (const locale of ['fr', 'en'] as const) {
    await expect(page.locator('[data-course-member-access]').getByText(getMemberAccessDictionary(locale).checking, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('[data-video-player]').getByText(getVideoDictionary(locale).loadingVideo, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText(getLearningDictionary(locale).privateLoading, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText(getAccountDictionary(locale).accountLoading, { exact: true }).filter({ visible: true })).toHaveCount(0);
  }
  await expect(page.locator('[data-media-progress-state="loading"]').filter({ visible: true })).toHaveCount(0);
  await page.getByRole('main').focus();
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); });
  let previousHeight = -1, equalObservations = 0;
  await expect.poll(async () => {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    equalObservations = height === previousHeight ? equalObservations + 1 : 0; previousHeight = height;
    return equalObservations >= 2;
  }, { timeout: 10_000, intervals: [50, 100, 200] }).toBe(true);
  await page.evaluate(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function noteAndQuiz(request: APIRequestContext, sources: BilingualFixture) {
  const account = await methodLearner(request); await loginMethodAccount(request, account);
  const enrollment = await enroll(request, sources, account.id), marker = `Note française personnelle non traduite · ${randomUUID()}`;
  const progress = await completeActivity(request, sources, account.id, enrollment.summary.id);
  const note = await saveFrenchNote(request, sources, account.id, marker);
  const attempt = await attemptQuiz(request, sources, account.id, enrollment.summary.id);
  return { account, enrollment, marker, progress, note, attempt };
}
async function publicHtml(page: Page, request: APIRequestContext, href: string) {
  const response = await request.get(href, { headers: { 'User-Agent': 'facebookexternalhit/1.1', 'X-Forwarded-Host': 'untrusted.invalid', 'X-Forwarded-Proto': 'https' } });
  expect(response.status()).toBe(200); expect(response.headers()['x-robots-tag']).toContain('noindex');
  const html = await response.text();
  const metadata = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return { lang: doc.documentElement.lang, titles: [...doc.querySelectorAll('title')].map(node => node.textContent),
      h1: [...doc.querySelectorAll('h1')].map(node => node.textContent), description: doc.querySelector('meta[name="description"]')?.getAttribute('content'),
      canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), alternates: doc.querySelectorAll('link[rel="alternate"][hreflang]').length,
      robots: doc.querySelector('meta[name="robots"]')?.getAttribute('content') };
  }, html);
  expect(metadata.robots).toContain('noindex'); expect(metadata.alternates).toBe(0);
  expect(metadata.canonical?.includes('untrusted.invalid')).toBe(false);
  return { metadata, html };
}

test.describe('P16 · équivalences publiées et histoires personnelles', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, sources: BilingualFixture;
  test.beforeAll(async ({ playwright }, info) => {
    info.setTimeout(240_000);
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    sources = await createBilingualFixture(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });

  test('01 · HTML serveur FR/EN, liens équivalents et canonicals sans filtres', async ({ page, context }) => {
    for (const locale of ['fr', 'en'] as const) {
      for (const source of [sources.course[locale], sources.guide[locale]]) {
        const href = publicHref(source), { metadata } = await publicHtml(page, context.request, href);
        expect(metadata.lang).toBe(locale); expect(metadata.titles.some(title => title?.includes(source.value.title))).toBe(true);
        expect(metadata.h1).toContain(source.value.title); expect(metadata.description).toBe(source.value.summary);
        const canonical = new URL(metadata.canonical!); expect(canonical.origin).toBe(process.env.COURSES_BROWSER_ORIGIN);
        expect(canonical.pathname).toBe(new URL(href, canonical.origin).pathname); expect(canonical.search).toBe('');
      }
      const result = await publicHtml(page, context.request, catalogueHref(locale, { locale, q: 'P16', type: 'COURSE', page: 1 }));
      expect(new URL(result.metadata.canonical!).search).toBe('');
      await page.goto(publicHref(sources.course[locale]));
      const other: Locale = locale === 'fr' ? 'en' : 'fr';
      const language = page.locator(`[data-language-switch="${other}"]`);
      await expect(language).toHaveAccessibleName(other === 'fr' ? 'Français' : 'English');
      await expect(language).toHaveAttribute('data-language-available', 'true');
      await language.click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText(sources.course[other].value.title);
      expect(new URL(page.url()).searchParams.get('version')).toBe(sources.course.fr.value.versionId);
      await capture(page, `${other}-${other === 'fr' ? 1440 : 390}-public-equivalent`, other === 'fr' ? 1440 : 390);
      await capture(page, `${other}-1024-public-language-navigation`, 1024);
    }
  });

  test('02 · ancien slug redirige directement vers sa même identité/version, inconnu reste404', async ({ page, context }) => {
    const old = sources.guide.fr, oldHref = publicHref(old), nextSlug = `p16-remplacement-${randomUUID()}`;
    await loginMethodAccount(context.request, { email: sources.editor.address, password: sources.editor.password });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(cmsPath('fr', old.value.id));
    const t = getCmsSlugDictionary('fr');
    let renameRequests = 0;
    page.on('request', request => { if (request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/v1/admin/contents/${old.value.id}/slug`) renameRequests++; });
    await page.locator('[data-cms-slug]').getByRole('button', { name: t.open, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t.title, exact: true }), form = dialog.locator('[data-cms-slug-form]');
    await form.getByLabel(t.slug).fill(nextSlug); await form.getByLabel(t.reason).fill('Recette P16 : remplacement explicite de cette adresse, sans modifier le contenu.');
    await form.getByRole('button', { name: t.confirm, exact: true }).click();
    const confirmation = page.getByRole('alertdialog', { name: t.confirmTitle, exact: true });
    const renamed = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/admin/contents/${old.value.id}/slug`));
    await confirmation.getByRole('button', { name: t.confirm, exact: true }).click();
    const renamedResponse = await renamed; expect(renamedResponse.status()).toBe(200);
    sources.guide.fr = { value: await renamedResponse.json() as ContentView, etag: renamedResponse.headers().etag };
    expect(sources.guide.fr.etag).toBe(`"content-${sources.guide.fr.value.id}-r${sources.guide.fr.value.revision}"`);
    await expect(dialog.getByText(t.saved, { exact: true })).toBeVisible();
    expect(renameRequests).toBe(1);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await dialog.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'fr-390-slug-rename-confirmed-dialog.png'), animations: 'disabled' });
    await dialog.getByText(t.saved, { exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByText(t.saved, { exact: true })).toBeInViewport();
    await dialog.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'fr-390-slug-rename-saved-ack.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: t.close, exact: true }).click();
    const response = await context.request.get(oldHref, { maxRedirects: 0 }); expect(response.status()).toBe(308);
    const destination = new URL(response.headers().location, process.env.COURSES_BROWSER_ORIGIN);
    expect(destination.pathname).toBe(`/fr/guides/${nextSlug}`); expect(destination.searchParams.get('version')).toBe(old.value.versionId);
    const canonical = await context.request.get(destination.toString(), { maxRedirects: 0 }); expect(canonical.status()).toBe(200);
    await page.goto(oldHref); await expect(page.getByRole('heading', { level: 1 })).toHaveText(old.value.title);
    expect(new URL(page.url()).pathname).toBe(destination.pathname);
    const missing = await context.request.get(`/fr/guides/p16-inconnu-${randomUUID()}`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
    expect(missing.status()).toBe(404); expect(missing.headers()['x-robots-tag']).toContain('noindex');
    await capture(page, 'fr-390-renamed-canonical-guide');
  });

  test('03 · traduction absente, brouillon, périmée et parent manquant ne deviennent pas des équivalents', async ({ page, context }) => {
    const diagnostic = observeBilingualMedia(page, sources);
    try {
    await page.goto(publicHref(sources.missingGuide));
    await expect(page.locator('[data-language-switch="en"]')).toHaveAttribute('data-language-available', 'false');
    const draft = await context.request.get(publicHref(sources.draftGuide.en));
    expect(draft.status()).toBe(200); expect((await draft.text()).includes(sources.draftMarker)).toBe(false);
    expect(draft.headers()['x-robots-tag']).toContain('noindex');
    const source = await currentContent(editor, sources.guide.fr.value.id);
    const changed = structuredClone(source.value.document!);
    changed.blocks.push({ type: 'PARAGRAPH', text: 'Précision source P16 réellement ajoutée, traduction à revoir.', url: null });
    await contentAction(editor, source, 'revisions', { title: source.value.title, summary: source.value.summary, document: changed,
      reason: 'P16 source correction marks the existing English translation stale' });
    await page.goto(publicHref(sources.guide.en));
    await expect(page.getByText(getPublicDictionary('en').STALE, { exact: true }).first()).toBeVisible();
    await capture(page, 'en-390-stale-translation');
    const response = await context.request.get(publicContextPath(sources, 'en', sources.missingParentCourse)); expect(response.status()).toBe(200);
    const chain = await response.json() as PublicActivityContext; expect(chain.availability).toBe('MISSING_TRANSLATION');
    diagnostic.context(chain);
    expect(chain.languages.find(item => item.locale === 'en')?.availability).toBe('MISSING_TRANSLATION');
    await page.goto(activityHref(sources, 'fr', sources.missingParentCourse));
    await expect(page.locator('[data-language-switch="en"]')).toHaveAttribute('data-language-available', 'false');
    await expect(page.locator('[data-language-alternative="en"]')).toHaveAttribute('data-language-reason', 'COURSE_CONTEXT_UNAVAILABLE');
    const alternative = page.locator('[data-language-alternative="en"]').getByRole('link', { name: getPublicDictionary('fr').openStandaloneActivity, exact: true });
    const href = await alternative.getAttribute('href'); expect(new URL(href!, page.url()).pathname).toBe('/en/catalog');
    await alternative.click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText(sources.activity.en.value.title);
    expect(new URL(page.url()).searchParams.get('activity')).toBe(sources.activity.fr.value.resourceId);
    await capture(page, 'en-390-voluntary-standalone-alternative');
    await diagnostic.save('PASSED');
    } catch (failure) { try { await diagnostic.save('FAILED'); } catch { /* Preserve the actual assertion failure. */ } throw failure; }
    finally { diagnostic.stop(); }
  });

  test('04 · T14 même inscription/progrès et note française, tentative conserve sa langue', async ({ page, context }) => {
    const saved = await noteAndQuiz(context.request, sources);
    await page.goto(activityHref(sources, 'fr')); await expect(page.getByRole('textbox', { name: getLearningDictionary('fr').notes, exact: true })).toHaveValue(saved.marker);
    await page.locator('[data-language-switch="en"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(sources.activity.en.value.title);
    await expect(page.getByRole('textbox', { name: getLearningDictionary('en').notes, exact: true })).toHaveValue(saved.marker);
    const english = await learningState(context.request, sources, saved.enrollment.summary.id, 'en');
    expect(english.progress).toEqual(saved.progress); expect(english.quiz?.attemptsUsed).toBe(1);
    const note = await context.request.get(`/api/v1/me/activity-notes/${saved.note.id}`); expect(await note.json() as ActivityNoteView).toEqual(saved.note);
    const attempts = await context.request.get(`/api/v1/me/quiz-attempts?activityVersionId=${sources.activity.fr.value.versionId}`);
    const history = await attempts.json() as QuizAttemptPage; expect(history.total).toBe(1); expect(history.items[0]).toEqual(saved.attempt);
    const dashboard = await context.request.get('/api/v1/me/learning?locale=en'); const state = await dashboard.json() as LearningDashboard;
    expect(state.enrollments).toHaveLength(1); expect(state.enrollments[0].id).toBe(saved.enrollment.summary.id);
    expect(state.enrollments[0].progress.completedActivities).toBe(1);
    await capture(page, 'en-390-original-french-note-and-common-progress');
    // FREE content proves equivalence, not purchase coverage; Stripe TEST and grants are covered separately in P12.
  });

  test('05 · T14 deux médias FR/EN gardent des positions propres sans modifier les acquis', async ({ page, context }) => {
    const account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    const enrollment = await enroll(context.request, sources, account.id), before = await learningState(context.request, sources, enrollment.summary.id, 'fr');
    for (const [locale, position] of [['fr', 1], ['en', 2]] as const) {
      const initial = await videoProgress(context.request, sources, locale); expect(initial.value.updatedAt).toBeNull();
      const response = await context.request.put(`/api/v1/me/media-progress/${sources.mediaIds[locale]}`, { headers: await learningHeaders(context.request, account.id, initial.etag),
        data: { context: videoContext(sources, locale), positionSeconds: position } }); expect(response.status()).toBe(200);
      const value = await response.json() as MediaProgressView; expect(value.positionSeconds).toBe(position); expect(value.updatedAt).not.toBeNull();
    }
    expect((await videoProgress(context.request, sources, 'fr')).value.positionSeconds).toBe(1);
    expect((await videoProgress(context.request, sources, 'en')).value.positionSeconds).toBe(2);
    expect((await learningState(context.request, sources, enrollment.summary.id, 'en')).progress).toEqual(before.progress);
    await page.goto(activityDiscoveryHref('fr', sources.activity.fr.value.resourceId, sources.activity.fr.value.versionId));
    for (const [locale, position] of [['fr', 1], ['en', 2]] as const) {
      if (locale === 'en') await page.locator('[data-language-switch="en"]').click();
      const panel = page.locator(`[data-video-player="${sources.mediaIds[locale]}"]`);
      await panel.getByRole('button', { name: getVideoDictionary(locale).resumePosition, exact: true }).click();
      const video = panel.locator('video'); await expect(video).toBeVisible();
      await expect.poll(() => video.evaluate((node, expected) => {
        const media = node as HTMLVideoElement;
        return media.error === null && media.readyState >= HTMLMediaElement.HAVE_METADATA && media.videoWidth > 0
          && !media.seeking && Math.abs(media.currentTime - expected) < 0.2;
      }, position)).toBe(true);
    }
    expect((await videoProgress(context.request, sources, 'fr')).value.positionSeconds).toBe(1);
    expect((await videoProgress(context.request, sources, 'en')).value.positionSeconds).toBe(2);
    expect((await learningState(context.request, sources, enrollment.summary.id, 'en')).progress).toEqual(before.progress);
    await capture(page, 'en-390-separate-test-video-position');
  });

  test('06 · T16 correction puis nouvelle pédagogie conservent historique et HTML d’attestation exact', async ({ page, context }) => {
    const saved = await noteAndQuiz(context.request, sources); await nameProfile(context.request, saved.account.id, 'Élodie · participation déclarée P16');
    const issued = await issue(context.request, saved.account.id, saved.enrollment.summary.id, 'fr');
    const document = await context.request.get(`/api/v1/me/attestations/${issued.summary.id}/document`); expect(document.status()).toBe(200);
    const bytes = await document.body(); expect(createHash('sha256').update(bytes).digest('hex')).toBe(issued.summary.document.sha256);
    let source = await currentContent(editor, sources.activity.fr.value.id);
    const minor = structuredClone(source.value.document!); minor.blocks.push({ type: 'PARAGRAPH', text: 'Correction mineure P16 tracée, objectif et barème inchangés.', url: null });
    source = await contentAction(editor, source, 'revisions', { title: source.value.title, summary: source.value.summary, document: minor, reason: 'P16 real minor correction' });
    source = await publishPublicContent(editor, source); expect(source.value.versionId).toBe(saved.attempt.activityVersionId);
    expect(source.value.publishedRevisionId).not.toBe(saved.attempt.revisionId);
    sources.activity.en = await publishPublicContent(editor, await currentContent(editor, sources.activity.en.value.id));
    source = await currentContent(editor, source.value.id); sources.activity.fr = source;
    const newDocument = structuredClone(minor); newDocument.objective = 'Objectif pédagogique P16 différent, version deux explicitement distincte.';
    const version = await publishPublicContent(editor, await contentAction(editor, source, 'versions', { objectives: newDocument.objective,
      evaluationDefinition: 'Évaluation P16 de la nouvelle exigence, distincte de la première version.', title: 'Recette P16 · nouvelle version pédagogique',
      summary: source.value.summary, document: newDocument, childVersionIds: [], reason: 'P16 explicit new pedagogical version' }, 201));
    expect(version.value.versionId).not.toBe(saved.attempt.activityVersionId); expect(version.value.versionNumber).toBe(source.value.versionNumber + 1);
    const attempt = await context.request.get(`/api/v1/me/quiz-attempts/${saved.attempt.id}`); expect(await attempt.json() as QuizAttemptView).toEqual(saved.attempt);
    expect((await learningState(context.request, sources, saved.enrollment.summary.id, 'en')).progress).toEqual(saved.progress);
    const after = await context.request.get(`/api/v1/me/attestations/${issued.summary.id}/document`); expect((await after.body()).equals(bytes)).toBe(true);
    expect(after.headers()['cache-control']).toContain('no-store'); expect(after.headers()['x-robots-tag']).toContain('noindex');
    await page.goto(activityDiscoveryHref('fr', version.value.resourceId, version.value.versionId));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(version.value.title);
    expect(new URL(page.url()).searchParams.get('version')).toBe(version.value.versionId);
    await capture(page, 'fr-390-explicit-new-pedagogical-version');
    await page.goto(attestationsPath('fr', issued.summary.id));
    await expect(page.getByText(getAccountDictionary('fr').noHumanReview, { exact: true })).toBeVisible();
    await capture(page, 'fr-390-original-attestation-after-new-version');
    await page.goto(attestationsPath('en', issued.summary.id)); await expect(page.getByText(getAccountDictionary('en').noHumanReview, { exact: true })).toBeVisible();
    await capture(page, 'en-390-original-french-attestation-after-new-version');
  });

  test('07 · clavier mobile, préférence explicite et un seul choix avant de quitter une saisie', async ({ page, context }) => {
    const account = await methodLearner(context.request); await loginMethodAccount(context.request, account); await enroll(context.request, sources, account.id);
    await context.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });
    await page.setViewportSize({ width: 320, height: 844 }); await page.goto(activityHref(sources, 'fr'));
    await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
    const t = getLearningDictionary('fr'), marker = `Brouillon français sans sauvegarde · ${randomUUID()}`;
    const note = page.getByRole('textbox', { name: t.notes, exact: true }); await note.fill(marker);
    await page.getByRole('checkbox', { name: t.read, exact: true }).check();
    let choices = 0; page.on('dialog', async dialog => { choices++; await dialog.dismiss(); });
    const before = page.url(), english = page.locator('[data-language-switch="en"]'); await english.focus(); await page.keyboard.press('Enter');
    expect(choices).toBe(1); expect(page.url()).toBe(before); await expect(note).toHaveValue(marker);
    expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(item => !item.includes(value)), marker)).toBe(true);
    await capture(page, 'fr-320-language-cancel-keeps-unsaved-note', 320);
    const savedNote = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/v1/me/activity-notes'));
    await page.getByRole('button', { name: t.saveNote, exact: true }).click(); expect((await savedNote).status()).toBe(201);
    const progress = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/me/activity-progress/'));
    await page.getByRole('button', { name: t.saveProgress, exact: true }).click(); expect((await progress).status()).toBe(200);
    await expect(page.locator('[data-learning-note-state]')).toHaveAttribute('data-learning-note-state', 'saved');
    await expect(page.locator('[data-learning-progress]')).toHaveAttribute('data-learning-progress', 'saved');
    await english.focus(); await page.keyboard.press('Enter'); await expect(page.locator('html')).toHaveAttribute('lang', 'en'); expect(choices).toBe(1);
    await expect(page.getByRole('textbox', { name: getLearningDictionary('en').notes, exact: true })).toHaveValue(marker);
    await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await capture(page, 'en-320-explicit-language-and-original-note', 320);
    // P16 adds guards to these independent account forms; the existing P08 note/progress guard above is not their substitute.
    await page.goto(accountPath('fr'));
    const a = getAccountDictionary('fr'), profile = page.locator('[data-account-profile]'), preferences = page.locator('[data-account-preferences]');
    const declaredName = 'Élodie · préférence explicite P16';
    await profile.getByRole('textbox', { name: a.displayName, exact: true }).fill(declaredName);
    await preferences.getByLabel(a.interfaceLanguage, { exact: true }).selectOption('en');
    const accountUrl = page.url(), beforeChoices = choices;
    await page.locator('[data-language-switch="en"]').focus(); await page.keyboard.press('Enter');
    expect(choices).toBe(beforeChoices + 1); expect(page.url()).toBe(accountUrl);
    await expect(profile.getByRole('textbox', { name: a.displayName, exact: true })).toHaveValue(declaredName);
    await expect(preferences.getByLabel(a.interfaceLanguage, { exact: true })).toHaveValue('en');
    expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(item => !item.includes(value)), declaredName)).toBe(true);
    await capture(page, 'fr-320-two-account-drafts-language-cancelled', 320);
    const profileSaved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/api/v1/me/profile'));
    await profile.getByRole('button', { name: a.saveProfile, exact: true }).click(); expect((await profileSaved).status()).toBe(200);
    await expect(profile.getByText(a.saved, { exact: true })).toBeVisible();
    const preferenceSaved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/api/v1/me/preferences'));
    await preferences.getByRole('button', { name: a.savePreferences, exact: true }).click(); expect((await preferenceSaved).status()).toBe(200);
    await expect(preferences.getByText(a.saved, { exact: true })).toBeVisible();
    await page.locator('[data-language-switch="en"]').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en'); expect(choices).toBe(beforeChoices + 1);
    const englishAccount = getAccountDictionary('en');
    await expect(page.locator('[data-account-profile]').getByRole('textbox', { name: englishAccount.displayName, exact: true })).toHaveValue(declaredName);
    await expect(page.locator('[data-account-preferences]').getByLabel(englishAccount.interfaceLanguage, { exact: true })).toHaveValue('en');
    await capture(page, 'en-320-account-saved-explicit-preference', 320);
  });
});
