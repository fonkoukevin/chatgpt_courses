import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ActivityNoteView, LearningDashboard, QuizAttemptView, QuizCheckResult } from '../../apps/web/src/lib/api/generated/types.gen';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { learningPath } from '../../apps/web/src/lib/learning/routes';
import { activityNoteEtag } from '../../apps/web/src/lib/api/learning-validation';
import { createLearningFixture, enrollLearning, learningActivityHref, learningHeaders, type LearningFixture } from './learning-fixture';
import { methodLearner, loginMethodAccount, createPersonalMethod, methodFields, authPath, fillMethodLogin } from './methods-fixture';
import { contentAction, currentContent } from './editorial-api';
import { publishPublicContent } from './public-content-fixture';
import { controlApi } from './control';
import { registerLearningHistoryScenario } from './learning-history.scenario';

async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function captureRegion(page: Page, selector: string, name: string) {
  const region = page.locator(selector).first(), original = page.viewportSize()!, bounds = await region.boundingBox();
  if (!bounds) throw new Error('Visible learning region required.');
  try {
    await page.setViewportSize({ width: original.width, height: Math.max(original.height, Math.ceil(bounds.height) + 80) });
    await page.getByRole('main').focus();
    await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    await region.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
  } finally { await page.setViewportSize(original); }
}
async function openActivity(page: Page, fixture: LearningFixture, locale: 'fr' | 'en' = 'fr') {
  await page.goto(learningActivityHref(fixture, locale));
  await expect(page.getByRole('heading', { level: 1, name: fixture.activity[locale].value.title })).toBeVisible();
}
async function chooseAnswers(page: Page, fixture: LearningFixture, locale: 'fr' | 'en', correct = true) {
  const questions = fixture.activity[locale].value.document!.quiz;
  for (const question of questions) await page.getByRole('radio', { name: question.options[correct ? question.correctOption : 0], exact: true }).click();
}
async function saveNote(page: Page, text: string, locale: 'fr' | 'en' = 'fr', create = true) {
  const t = getLearningDictionary(locale);
  await page.getByRole('textbox', { name: t.notes, exact: true }).fill(text);
  const response = page.waitForResponse((value) => value.request().method() === (create ? 'POST' : 'PATCH') && /\/api\/v1\/me\/activity-notes(?:\/[^/?]+)?$/.test(value.url()));
  await page.getByRole('button', { name: t.saveNote, exact: true }).click();
  const saved = await response; expect(saved.status()).toBe(create ? 201 : 200);
  await expect(page.locator('[data-learning-note-state]')).toHaveAttribute('data-learning-note-state', 'saved');
  return await saved.json() as ActivityNoteView;
}
async function privateNotStored(page: Page, marker: string) {
  expect(await page.evaluate((value) => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((entry) => !String(entry).includes(value)), marker)).toBe(true);
}

test.describe('P08 apprentissage réel', () => {
  let editor: APIRequestContext, fixture: LearningFixture;
  test.beforeAll(async ({ playwright }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    fixture = await createLearningFixture(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });

  for (const locale of ['fr', 'en'] as const) test(`${locale} : activité gratuite, quiz corrigé par Spring sans compte et programme mobile`, async ({ page, context }) => {
    const t = getLearningDictionary(locale), source = fixture.activity[locale].value;
    await openActivity(page, fixture, locale);
    await expect(page.getByText(t.noVideo, { exact: true })).toBeVisible();
    const initial = await context.request.get(`/api/v1/catalog/resources/${source.resourceId}/versions/${source.versionId}?locale=${locale}`);
    expect(initial.status()).toBe(200);
    const body = await initial.text(); expect(body.includes('correctOption')).toBe(false); expect(body.includes('explanation')).toBe(false);
    await page.getByRole('button', { name: t.checkQuiz, exact: true }).press('Enter');
    await expect(page.getByText(t.answerRequired, { exact: true })).toBeVisible();
    await chooseAnswers(page, fixture, locale);
    const response = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/quiz-checks'));
    await page.getByRole('button', { name: t.checkQuiz, exact: true }).press('Enter');
    const actual = await response; expect(actual.status()).toBe(200);
    const grade = await actual.json() as QuizCheckResult;
    expect(grade.passed).toBe(true); expect(grade.scorePoints).toBe(3); expect('id' in grade).toBe(false);
    await expect(page.locator('[data-learning-quiz-result="formative"]')).toContainText(t.formativeResult);
    expect((await context.request.get('/api/v1/me/learning?locale=fr')).status()).toBe(401);
    for (const width of locale === 'fr' ? [1440, 1024, 768, 390, 320] : [1440, 390]) {
      await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
      await capture(page, `${locale}-${width}-free-quiz-result`);
      if (width === 390) await captureRegion(page, '[data-learning-quiz-result="formative"]', `${locale}-390-quiz-result-readable`);
    }
    const trigger = page.getByRole('button', { name: t.openProgramme, exact: true }); await trigger.click();
    const panel = page.getByRole('dialog', { name: t.programme, exact: true }); await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: fixture.next[locale].value.title, exact: true })).toBeVisible();
    await panel.getByRole('button', { name: t.close, exact: true }).focus();
    await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-mobile-programme-open.png`), fullPage: false, animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.goto(learningActivityHref(fixture, locale, fixture.premium));
    await expect(page.getByText(getPublicDictionary(locale).protectedBody, { exact: true })).toBeVisible();
    expect((await page.content()).includes(fixture.secret)).toBe(false);
  });

  test('compte vide, inscription explicite, note et quiz durables, reprise sous une seconde session EN', async ({ page, context, browser }) => {
    const t = getLearningDictionary('fr'), account = await methodLearner(context.request);
    await loginMethodAccount(context.request, account);
    await page.goto(learningPath('fr'));
    await expect(page.getByText(t.emptyTitle, { exact: true })).toBeVisible();
    await capture(page, 'fr-1440-dashboard-empty');
    const method = await createPersonalMethod(context.request, account.id, methodFields('fr', `P08 méthode récente ${randomUUID()}`));
    await openActivity(page, fixture);
    await page.getByRole('button', { name: t.startCourse, exact: true }).click();
    await expect(page.getByText(t.enrolled, { exact: true })).toBeVisible();
    const marker = `Note française BR01 conservée sans traduction ${randomUUID()}`;
    const note = await saveNote(page, marker); await privateNotStored(page, marker);
    const read = page.waitForResponse((value) => value.request().method() === 'PUT' && value.url().includes('/me/activity-progress/'));
    await page.getByRole('checkbox', { name: t.read, exact: true }).check();
    await page.getByRole('button', { name: t.saveProgress, exact: true }).click(); expect((await read).status()).toBe(200);
    await chooseAnswers(page, fixture, 'fr', false);
    let gradeResponse = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/quiz-attempts'));
    await page.getByRole('button', { name: t.submitQuiz, exact: true }).click();
    const wrong = await gradeResponse; expect(wrong.status()).toBe(201); expect((await wrong.json() as QuizAttemptView).passed).toBe(false);
    await page.getByRole('button', { name: t.tryAgain, exact: true }).click(); await chooseAnswers(page, fixture, 'fr');
    gradeResponse = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/quiz-attempts'));
    await page.getByRole('button', { name: t.submitQuiz, exact: true }).click();
    const good = await gradeResponse; expect(good.status()).toBe(201); const passed = await good.json() as QuizAttemptView; expect(passed.scorePoints).toBe(3); expect(passed.passed).toBe(true);
    await capture(page, 'fr-1440-learning-saved-quiz');
    const state = await context.request.get('/api/v1/me/learning?locale=fr'); expect(state.status()).toBe(200);
    const dashboard = await state.json() as LearningDashboard, summary = dashboard.enrollments[0];
    expect(summary.progress).toEqual({ totalActivities: 3, readActivities: 1, completedActivities: 0, quizPassedActivities: 1, projectAvailability: 'NOT_AVAILABLE' });
    expect(dashboard.resume?.activityVersionId).toBe(fixture.activity.fr.value.versionId);
    await page.goto(learningPath('fr')); await expect(page.getByRole('link', { name: t.resume, exact: true })).toHaveAttribute('href', learningActivityHref(fixture, 'fr'));
    await expect(page.getByRole('link', { name: method.title, exact: true })).toBeVisible();
    for (const width of [1440, 1024, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await capture(page, `fr-${width}-dashboard-resume`); }
    const second = await browser.newContext();
    try {
      await loginMethodAccount(second.request, account); const other = await second.newPage(); await openActivity(other, fixture, 'en');
      const en = getLearningDictionary('en'); await expect(other.getByRole('textbox', { name: en.notes, exact: true })).toHaveValue(marker);
      const stored = await second.request.get(`/api/v1/me/activity-notes/${note.id}`); expect((await stored.json() as ActivityNoteView).locale).toBe('fr');
      const attempts = await second.request.get(`/api/v1/me/quiz-attempts?activityVersionId=${fixture.activity.fr.value.versionId}`);
      const history = await attempts.json() as { total: number; items: QuizAttemptView[] }; expect(history.total).toBe(2); expect(history.items.every((entry) => entry.locale === 'fr')).toBe(true);
      const historical = other.locator('details').first(); await historical.locator('summary').click();
      const historicalResult = historical.locator('[data-learning-quiz-result="attempt"]');
      await expect(historicalResult).toHaveAttribute('lang', 'en');
      await expect(historicalResult.getByRole('heading', { level: 4 }).first()).toHaveAttribute('lang', 'fr');
      await other.setViewportSize({ width: 390, height: 844 }); await capture(other, 'en-390-second-session-original-note');
      await captureRegion(other, '[data-learning-note-state]', 'en-390-original-note-readable');
      await captureRegion(other, 'details[open] [data-learning-quiz-result="attempt"]', 'en-390-historical-french-quiz-readable');
      await other.goto(learningPath('en')); await expect(other.getByRole('link', { name: en.resume, exact: true })).toHaveAttribute('href', learningActivityHref(fixture, 'en'));
      await capture(other, 'en-390-dashboard-resume');
    } finally { await second.close(); }
  });

  test('propriété réelle et ancienne page refusée après connexion d’un autre compte', async ({ page, context, browser }) => {
    const a = await methodLearner(context.request); await loginMethodAccount(context.request, a); const enrollment = await enrollLearning(context.request, fixture, a.id);
    await openActivity(page, fixture); const note = await saveNote(page, `A only ${randomUUID()}`);
    const other = await browser.newContext();
    try {
      const b = await methodLearner(other.request); await loginMethodAccount(other.request, b);
      for (const path of [`/me/enrollments/${enrollment.summary.id}?locale=fr`, `/me/activity-notes/${note.id}`]) expect((await other.request.get(`/api/v1${path}`)).status()).toBe(404);
      const denied = await other.request.patch(`/api/v1/me/activity-notes/${note.id}`, { headers: await learningHeaders(other.request, b.id, activityNoteEtag(note)), data: { text: 'unauthorized' } }); expect(denied.status()).toBe(404);
      await loginMethodAccount(context.request, b);
      await page.getByRole('textbox', { name: getLearningDictionary('fr').notes, exact: true }).fill('retained from A');
      const response = page.waitForResponse((value) => value.request().method() === 'PATCH' && value.url().endsWith(`/activity-notes/${note.id}`));
      await page.getByRole('button', { name: getLearningDictionary('fr').saveNote, exact: true }).click();
      const changed = await response; expect([403, 409]).toContain(changed.status());
      expect((await changed.json() as { code: string }).code).toBe(changed.status() === 403 ? 'CSRF_INVALID' : 'ACCOUNT_CONTEXT_CHANGED');
      await expect(page.getByText(getLearningDictionary('fr').accountChanged, { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: getLearningDictionary('fr').notes, exact: true })).toHaveValue('retained from A');
      await privateNotStored(page, 'retained from A'); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'fr-390-account-changed');
      const empty = await context.request.get('/api/v1/me/learning?locale=fr'); expect((await empty.json() as LearningDashboard).enrollments).toHaveLength(0);
      const bNote = await context.request.get(`/api/v1/me/activity-notes/by-activity/${fixture.activity.fr.value.resourceId}?activityVersionId=${fixture.activity.fr.value.versionId}`);
      expect((await bNote.json() as { note: unknown }).note).toBeNull();
      await loginMethodAccount(other.request, a);
      const unchanged = await other.request.get(`/api/v1/me/activity-notes/${note.id}`); expect((await unchanged.json() as ActivityNoteView).text).toBe(note.text);
    } finally { await other.close(); }
  });

  test('note : réponse retardée, saisie plus récente et conflit résolu explicitement entre onglets', async ({ page, context }) => {
    const t = getLearningDictionary('fr'), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    await enrollLearning(context.request, fixture, account.id); await openActivity(page, fixture);
    const note = await saveNote(page, `Initial ${randomUUID()}`), pattern = `**/api/v1/me/activity-notes/${note.id}`;
    let release!: () => void, entered!: () => void, delivered!: () => void, first = true;
    const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; }), finished = new Promise<void>((resolve) => { delivered = resolve; });
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'PATCH' || !first) return route.continue();
      first = false;
      try { const actual = await route.fetch(); expect(actual.status()).toBe(200); entered(); await gate; await route.fulfill({ response: actual }); }
      finally { delivered(); }
    });
    try {
      await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Snapshot réellement sauvegardé');
      await page.getByRole('button', { name: t.saveNote, exact: true }).click(); await started;
      await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Saisie plus récente pendant la réponse');
      release(); await finished;
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue('Saisie plus récente pendant la réponse');
      await expect(page.locator('[data-learning-note-state]')).toHaveAttribute('data-learning-note-state', 'modified');
      await saveNote(page, 'Saisie plus récente pendant la réponse', 'fr', false);
    } finally { release(); if (!first) await finished; await page.unrouteAll({ behavior: 'wait' }); }
    const second = await context.newPage();
    try {
      await openActivity(second, fixture);
      await second.getByRole('textbox', { name: t.notes, exact: true }).fill('Texte du deuxième onglet conservé');
      await saveNote(page, 'Texte du premier onglet confirmé', 'fr', false);
      const rejected = second.waitForResponse((value) => value.request().method() === 'PATCH' && value.url().endsWith(`/activity-notes/${note.id}`));
      await second.getByRole('button', { name: t.saveNote, exact: true }).click(); expect((await rejected).status()).toBe(412);
      await expect(second.getByRole('heading', { name: t.conflictTitle, exact: true })).toBeVisible();
      await expect(second.getByRole('textbox', { name: t.localVersion, exact: true })).toHaveValue('Texte du deuxième onglet conservé');
      await expect(second.getByRole('textbox', { name: t.serverVersion, exact: true })).toHaveValue('Texte du premier onglet confirmé');
      await second.setViewportSize({ width: 390, height: 844 }); await capture(second, 'fr-390-note-conflict');
      await captureRegion(second, '[data-learning-note-state]', 'fr-390-note-conflict-readable');
      await second.getByRole('button', { name: t.keepLocal, exact: true }).click();
      await second.getByRole('alertdialog', { name: t.keepLocal, exact: true }).getByRole('button', { name: t.confirm, exact: true }).click();
      await saveNote(second, 'Texte du deuxième onglet conservé', 'fr', false);
      const actual = await context.request.get(`/api/v1/me/activity-notes/${note.id}`); expect((await actual.json() as ActivityNoteView).text).toBe('Texte du deuxième onglet conservé');
    } finally { await second.close(); }
  });

  test('panne réelle de Spring, reprise clavier et perte de session sans perte de note', async ({ page, context }) => {
    const t = getLearningDictionary('fr'), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    await enrollLearning(context.request, fixture, account.id); await openActivity(page, fixture);
    const note = await saveNote(page, 'Avant panne'), marker = `Saisie locale pendant panne ${randomUUID()}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: t.notes, exact: true }).fill(marker);
    let stopped = false;
    try {
      await controlApi('stop-api'); stopped = true;
      await page.getByRole('button', { name: t.saveNote, exact: true }).press('Enter');
      await expect(page.locator('[data-learning-note-state]')).toHaveAttribute('data-learning-note-state', 'error');
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(marker); await privateNotStored(page, marker);
      await capture(page, 'fr-390-note-api-unavailable');
    } finally { if (stopped) await controlApi('start-api'); }
    await saveNote(page, marker, 'fr', false); await capture(page, 'fr-390-note-api-recovered');
    // Real missing session, without a fabricated API success or waiting thirty minutes.
    await context.clearCookies({ name: 'SESSION' });
    await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Saisie conservée sans session');
    const rejected = page.waitForResponse((value) => value.request().method() === 'PATCH' && value.url().endsWith(`/activity-notes/${note.id}`));
    await page.getByRole('button', { name: t.saveNote, exact: true }).press('Enter'); expect([401, 403]).toContain((await rejected).status());
    await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue('Saisie conservée sans session');
    await expect(page.getByText(t.expiredSession, { exact: true }).first()).toBeVisible();
    await capture(page, 'fr-390-note-session-missing');
  });

  test('quiz publié modifié : 412 explicite ; note personnelle conservée après retrait de l’activité', async ({ page, context, playwright }) => {
    const ownEditor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const isolated = await createLearningFixture(ownEditor), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
      await enrollLearning(context.request, isolated, account.id); await openActivity(page, isolated);
      const t = getLearningDictionary('fr'), marker = `Note indépendante du retrait ${randomUUID()}`, note = await saveNote(page, marker);
      await chooseAnswers(page, isolated, 'fr');
      let current = await currentContent(ownEditor, isolated.activity.fr.value.id);
      current = await contentAction(ownEditor, current, 'revisions', { title: current.value.title, summary: current.value.summary, document: { ...current.value.document!, blocks: [...current.value.document!.blocks, { type: 'PARAGRAPH', text: 'P08 correction éditoriale explicite, évaluation inchangée.', url: null }] }, reason: 'P08 real editorial correction preserving frozen evaluation' });
      current = await publishPublicContent(ownEditor, current);
      const rejected = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/quiz-attempts'));
      await page.getByRole('button', { name: t.submitQuiz, exact: true }).click(); expect((await rejected).status()).toBe(412);
      await expect(page.getByText(t.quizVersionChanged, { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(marker);
      await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'fr-390-quiz-version-changed');
      current = await contentAction(ownEditor, await currentContent(ownEditor, current.value.id), 'archive', { reason: 'P08 actual source withdrawal, preserve personal notes and history' });
      const preserved = await context.request.get(`/api/v1/me/activity-notes/${note.id}`); expect(preserved.status()).toBe(200); expect((await preserved.json() as ActivityNoteView).text).toBe(marker);
      page.once('dialog', (dialog) => dialog.accept());
      await page.reload(); await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(marker);
      await expect(page.getByText(getPublicDictionary('fr').WITHDRAWN, { exact: true }).first()).toBeVisible();
      await capture(page, 'fr-390-withdrawn-source-personal-note');
      const missing = await context.request.get(`/api/v1/catalog/resources/${isolated.activity.fr.value.resourceId}/versions/${isolated.activity.fr.value.versionId}?locale=en`);
      expect((await missing.json() as { availability: string }).availability).toBe('STALE');
    } finally { await ownEditor.dispose(); }
  });

  test('confirmation de note committée sous A puis retardée ignorée après vraie connexion B', async ({ page, context }) => {
    const t = getLearningDictionary('fr'), a = await methodLearner(context.request), b = await methodLearner(context.request);
    await loginMethodAccount(context.request, a); await openActivity(page, fixture);
    let release!: () => void, entered!: () => void, delivered!: () => void, active = false;
    const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; }), finished = new Promise<void>((resolve) => { delivered = resolve; });
    await page.route('**/api/v1/me/activity-notes', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      active = true;
      try { const actual = await route.fetch(); expect(actual.status()).toBe(201); entered(); await gate; await route.fulfill({ response: actual }); }
      finally { delivered(); }
    });
    const other = await context.newPage();
    try {
      await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Snapshot note du compte A');
      await page.getByRole('button', { name: t.saveNote, exact: true }).click(); await started;
      await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Nouvelle saisie A conservée après transition');
      await other.goto(authPath('fr', 'sign-in')); await fillMethodLogin(other, 'fr', b);
      await expect(other).toHaveURL(new RegExp('/fr/compte'));
      await expect(page.getByText(t.accountChanged, { exact: true })).toBeVisible(); release(); await finished;
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue('Nouvelle saisie A conservée après transition');
      await expect(page.locator('[data-learning-note-state]')).not.toHaveAttribute('data-learning-note-state', 'saved');
      await expect(page.getByRole('button', { name: t.saveNote, exact: true })).toBeDisabled();
      const lookup = await context.request.get(`/api/v1/me/activity-notes/by-activity/${fixture.activity.fr.value.resourceId}?activityVersionId=${fixture.activity.fr.value.versionId}`);
      expect((await lookup.json() as { note: unknown }).note).toBeNull(); await privateNotStored(page, 'Nouvelle saisie A');
      for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await capture(page, `fr-${width}-note-late-account-change`); }
    } finally { release(); if (active) await finished; await page.unrouteAll({ behavior: 'wait' }); await other.close(); }
  });

  test('une seule confirmation de départ pour notes, déclarations et réponses non enregistrées', async ({ page, context }) => {
    const t = getLearningDictionary('fr'), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    const enrollment = await enrollLearning(context.request, fixture, account.id); await openActivity(page, fixture);
    await page.getByRole('textbox', { name: t.notes, exact: true }).fill('Brouillon volontairement abandonné');
    await page.getByRole('checkbox', { name: t.read, exact: true }).check();
    await chooseAnswers(page, fixture, 'fr');
    const dialogs: string[] = [];
    const accept = async (dialog: import('@playwright/test').Dialog) => { dialogs.push(dialog.type()); await dialog.accept(); };
    page.on('dialog', accept);
    try {
      await page.getByRole('link', { name: `← ${getPublicDictionary('fr').backCourse}`, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: fixture.course.fr.value.title })).toBeVisible();
      expect(dialogs).toEqual(['confirm']);
      const note = await context.request.get(`/api/v1/me/activity-notes/by-activity/${fixture.activity.fr.value.resourceId}?activityVersionId=${fixture.activity.fr.value.versionId}`);
      expect((await note.json() as { note: unknown }).note).toBeNull();
      const progress = await context.request.get(`/api/v1/me/activity-progress/${fixture.activity.fr.value.resourceId}?enrollmentId=${enrollment.summary.id}&activityVersionId=${fixture.activity.fr.value.versionId}`);
      expect((await progress.json() as { readAt: unknown }).readAt).toBeNull();
      const attempts = await context.request.get(`/api/v1/me/quiz-attempts?activityVersionId=${fixture.activity.fr.value.versionId}`); expect((await attempts.json() as { total: number }).total).toBe(0);
    } finally { page.off('dialog', accept); }
  });
});

registerLearningHistoryScenario();
