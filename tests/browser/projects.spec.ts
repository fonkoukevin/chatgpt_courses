import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { ProjectView, SaveProject, SelfAssessmentView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { getProjectDraftDictionary } from '../../apps/web/src/lib/i18n/project-draft';
import { getProjectEditorialDictionary } from '../../apps/web/src/lib/i18n/project-editorial';
import { getCmsDictionary } from '../../apps/web/src/lib/i18n/cms';
import { projectDraftPrefix } from '../../apps/web/src/lib/auth/project-draft';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { learningPath } from '../../apps/web/src/lib/learning/routes';
import { isProjectView, projectEtag } from '../../apps/web/src/lib/api/projects-validation';
import { sameProjectFields } from '../../apps/web/src/lib/projects/fields';
import { authPath, fillMethodLogin, loginMethodAccount, methodLearner } from './methods-fixture';
import { contentAction, createContent, currentContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publishPublicContent } from './public-content-fixture';
import { csrfHeaders } from './editorial-fixture';
import { controlApi } from './control';
import { createPersonalProject, createProjectFixture, patchProject, projectRecord, projectSourceHref, type ProjectFixture } from './projects-fixture';

type Locale = 'fr' | 'en';
async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function captureRegion(page: Page, region: Locator, name: string) {
  const original = page.viewportSize()!, bounds = await region.boundingBox(); if (!bounds) throw new Error('Visible project region required.');
  try {
    await page.setViewportSize({ width: original.width, height: Math.max(original.height, Math.ceil(bounds.height) + 80) });
    await page.getByRole('main').focus(); await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
    await region.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
  } finally { await page.setViewportSize(original); }
}
async function captureDialog(page: Page, dialog: Locator, name: string) {
  await expect(dialog).toBeVisible(); await dialog.getByRole('button').first().focus();
  await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: false, animations: 'disabled' });
}
async function privateNotStored(page: Page, marker: string) {
  expect(await page.evaluate((value) => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((entry) => !String(entry).includes(value)), marker)).toBe(true);
}
async function openProject(page: Page, locale: Locale, project: ProjectView) {
  await page.goto(projectsPath(locale, project.id)); await expect(page.getByRole('textbox', { name: getProjectsDictionary(locale).objective, exact: true })).toBeEnabled();
}
async function saveProject(page: Page, locale: Locale, ready = false) {
  const t = getProjectsDictionary(locale), form = page.locator('[data-project-save-state]');
  const button = ready ? form.getByRole('button', { name: t.ready, exact: true }) : form.locator('button[type="submit"]');
  await expect(button).toBeEnabled();
  if (!ready) expect([t.save, t.retry]).toContain(await button.innerText());
  const request = page.waitForResponse((response) => response.request().method() === 'PATCH' && /\/api\/v1\/me\/projects\/[^/?]+$/.test(response.url()));
  await button.press('Enter');
  const response = await request; expect(response.status()).toBe(200);
  await expect(page.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'saved');
  const raw: unknown = await response.json();
  expect(isProjectView(raw), 'Project response schema and captured source identity are valid').toBe(true);
  const value = raw as ProjectView, sent = response.request().postDataJSON() as SaveProject;
  expect(response.headers().etag, 'Strong ETag matches the returned project revision').toBe(projectEtag(value));
  expect(value.stage, 'Returned stage matches the submitted stage').toBe(sent.stage);
  expect(sameProjectFields(value.fields, sent.fields), 'Returned fields match the submitted snapshot; no private text is printed').toBe(true);
  return value;
}
async function prepareAssessment(page: Page, locale: Locale, project: ProjectView, blocking = false) {
  const t = getProjectsDictionary(locale); await page.getByRole('tab', { name: t.check, exact: true }).click();
  const grid = page.locator('[data-project-assessment-state]');
  for (const criterion of project.rubric.criteria) await grid.getByRole('checkbox', { name: criterion.label, exact: true }).check();
  if (blocking) await grid.getByRole('checkbox', { name: project.rubric.blockingIssues[0].label, exact: true }).check();
  const response = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith(`/me/projects/${project.id}/self-assessments`));
  await grid.getByRole('button', { name: t.submitAssessment, exact: true }).click(); const received = await response; expect(received.status()).toBe(201);
  return await received.json() as SelfAssessmentView;
}

test.describe('P09 projets personnels et déclarations réelles', () => {
  let editor: APIRequestContext, fixture: ProjectFixture;
  test.beforeAll(async ({ playwright }) => { editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); fixture = await createProjectFixture(editor); });
  test.afterAll(async () => { await editor?.dispose(); });

  for (const locale of ['fr', 'en'] as const) test(`${locale} · T02 préparation anonyme consentie, connexion, import volontaire et sauvegarde`, async ({ page, context, browser }) => {
    const t = getProjectsDictionary(locale), draft = getProjectDraftDictionary(locale), account = await methodLearner(context.request, locale), source = fixture.BR01[locale];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(projectSourceHref(source, locale)); await page.getByRole('button', { name: t.start, exact: true }).click();
    const preparation = page.locator('[data-project-preparation]'); await expect(preparation.getByRole('textbox', { name: t.objective, exact: true })).toBeEnabled();
    const marker = `P09 anonymous deliberate ${locale} ${randomUUID()}`;
    await preparation.getByRole('textbox', { name: t.title, exact: true }).fill(marker);
    await preparation.getByRole('textbox', { name: t.objective, exact: true }).fill('Ma rédaction préparée avant connexion.');
    await preparation.getByRole('button', { name: t.importText, exact: true }).click();
    const imported = page.getByRole('dialog', { name: t.importText, exact: true });
    await imported.getByRole('textbox', { name: t.externalText, exact: true }).fill(`${marker} · external independent`);
    await imported.getByRole('button', { name: t.importConfirm, exact: true }).click();
    await expect(preparation.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Ma rédaction préparée avant connexion.');
    expect(await page.evaluate((prefix) => Object.keys(sessionStorage).some((key) => key.startsWith(prefix)), projectDraftPrefix)).toBe(false);
    await captureRegion(page, preparation, `${locale}-390-anonymous-preparation`);
    await preparation.getByRole('checkbox', { name: t.consentDraft, exact: true }).check();
    await preparation.getByRole('button', { name: t.keepAndSignIn, exact: true }).click();
    const confirmation = page.getByRole('alertdialog', { name: t.keepAndSignIn, exact: true }); await captureDialog(page, confirmation, `${locale}-390-draft-consent`);
    await confirmation.getByRole('button', { name: t.keepAndSignIn, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(authPath(locale, 'sign-in')));
    await fillMethodLogin(page, locale, account); await expect(page.getByRole('button', { name: draft.importAction, exact: true })).toBeVisible();
    expect((await (await context.request.get('/api/v1/me/projects')).json() as { total: number }).total).toBe(0);
    await capture(page, `${locale}-390-voluntary-import`);
    const loadedTemplate = page.waitForResponse((value) => value.request().method() === 'GET' && value.url().includes(`/project-templates/${source.value.resourceId}/versions/${source.value.versionId}`));
    await page.getByRole('button', { name: draft.importAction, exact: true }).click(); expect((await loadedTemplate).status()).toBe(200);
    await expect(page.getByRole('textbox', { name: t.externalText, exact: true })).toHaveValue(`${marker} · external independent`);
    await expect(page.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Ma rédaction préparée avant connexion.');
    expect((await (await context.request.get('/api/v1/me/projects')).json() as { total: number }).total).toBe(0);
    if (locale === 'fr') {
      // Real publication change after the temporary preparation was read.
      const prior = await currentContent(editor, source.value.id), revisedBrief = 'P09 dossier révisé : confirmez la disponibilité des éléments avant de promettre le démarrage.';
      fixture.BR01.fr = await publishPublicContent(editor, await contentAction(editor, prior, 'revisions', { title: prior.value.title, summary: prior.value.summary,
        document: { ...prior.value.document!, blocks: [...prior.value.document!.blocks, { type: 'PARAGRAPH', text: revisedBrief, url: null }] }, reason: 'P09 real source revision before explicit personal creation' }));
      fixture.BR01.en = await publishPublicContent(editor, await currentContent(editor, fixture.BR01.en.value.id));
      const rejected = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/api/v1/me/projects'));
      await page.getByRole('button', { name: t.save, exact: true }).click(); expect((await rejected).status()).toBe(412);
      await expect(page.getByText(t.sourceConflict, { exact: true })).toBeVisible(); await page.getByRole('button', { name: t.checkSource, exact: true }).click();
      await page.getByRole('button', { name: t.useSource, exact: true }).click(); await page.getByRole('alertdialog', { name: t.useSource, exact: true }).getByRole('button', { name: t.confirm, exact: true }).click();
      await page.getByRole('button', { name: t.openBrief, exact: true }).click(); const brief = page.getByRole('dialog', { name: t.brief, exact: true }); await expect(brief).toContainText(revisedBrief); await page.keyboard.press('Escape');
      await expect(page.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Ma rédaction préparée avant connexion.');
      await expect(page.getByRole('textbox', { name: t.externalText, exact: true })).toHaveValue(`${marker} · external independent`);
    }
    const created = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/api/v1/me/projects'));
    await page.getByRole('button', { name: t.save, exact: true }).press('Enter'); const response = await created; expect(response.status()).toBe(201); const project = await response.json() as ProjectView;
    await expect(page).toHaveURL(new RegExp(projectsPath(locale, project.id) + '$')); await expect(page.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'saved');
    expect(await page.evaluate((prefix) => Object.keys(sessionStorage).some((key) => key.startsWith(prefix)), projectDraftPrefix)).toBe(false);
    await page.getByRole('textbox', { name: t.method, exact: true }).fill('Retouche privée après création'); await saveProject(page, locale);
    await privateNotStored(page, 'Retouche privée après création'); await page.reload(); await expect(page.getByRole('textbox', { name: t.method, exact: true })).toHaveValue('Retouche privée après création');
    expect((await saveProject(page, locale, true)).stage).toBe('READY_FOR_SELF_ASSESSMENT');
    for (const width of locale === 'fr' ? [1440, 1024, 768, 390, 320] : [1440, 390]) { await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 }); await capture(page, `${locale}-${width}-project-editor`); }
    await page.goto(projectsPath(locale)); await expect(page.getByRole('link', { name: marker, exact: true })).toBeVisible(); await capture(page, `${locale}-${page.viewportSize()!.width}-project-library`);
    const secondSession = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      expect((await secondSession.request.get('/api/v1/auth/me')).status()).toBe(401);
      await loginMethodAccount(secondSession.request, account);
      const restored = await secondSession.newPage(); await openProject(restored, locale, project);
      await expect(restored.getByRole('textbox', { name: t.title, exact: true })).toHaveValue(marker);
      await expect(restored.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Ma rédaction préparée avant connexion.');
      await expect(restored.getByRole('textbox', { name: t.method, exact: true })).toHaveValue('Retouche privée après création');
      await expect(restored.getByRole('textbox', { name: t.externalText, exact: true })).toHaveValue(`${marker} · external independent`);
      expect(await restored.evaluate((prefix) => Object.keys(sessionStorage).some((key) => key.startsWith(prefix)), projectDraftPrefix)).toBe(false);
      await restored.goto(learningPath(locale));
      await expect(restored.locator('[data-learning-recent-projects]').getByRole('link', { name: marker, exact: true })).toBeVisible();
      for (const width of [1440, 390]) { await restored.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await capture(restored, `${locale}-${width}-dashboard-recent-project`); }
    } finally { await secondSession.close(); }
  });

  for (const [locale, caseCode] of [['fr', 'BR01'], ['en', 'BR02']] as const) test(`${caseCode} · ${locale} grille déclarative, erreurs bloquantes, corrigé et anciennes révisions`, async ({ page, context }) => {
    const t = getProjectsDictionary(locale), account = await methodLearner(context.request, locale); await loginMethodAccount(context.request, account);
    const own = await createPersonalProject(context.request, account.id, fixture[caseCode][locale]); await openProject(page, locale, own); await page.setViewportSize({ width: 390, height: 844 });
    const assessment = await prepareAssessment(page, locale, own, true); expect(assessment.scorePoints).toBe(20); expect(assessment.thresholdMet).toBe(true); expect(assessment.needsRevision).toBe(true); expect(assessment.blockingIssues.length).toBe(1);
    const result = page.locator(`[data-project-assessment-result="${assessment.id}"]`); await expect(result).toContainText(t.stateRevise); await expect(result).toContainText(t.declaredScore); await expect(result).toContainText(t.assessmentNotice);
    await captureRegion(page, result, `${locale}-390-self-assessment-blocking-readable`); await capture(page, `${locale}-390-assessment-grid`);
    // A replay after an unknown outcome returns the same immutable evidence.
    const replay = await context.request.post(`/api/v1/me/projects/${own.id}/self-assessments`, { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': account.id, 'If-Match': projectEtag(own) }, data: {
      submissionId: assessment.submissionId, projectRevisionId: assessment.projectRevisionId, rubricVersionId: assessment.rubricVersionId, answers: assessment.answers, blockingDeclarations: assessment.blockingDeclarations, comment: assessment.comment,
    } }); expect(replay.status()).toBe(201); expect((await replay.json() as SelfAssessmentView).id).toBe(assessment.id);
    expect((await projectRecord(context.request, own.id)).revision).toBe(own.revision);
    await page.getByRole('tab', { name: t.solution, exact: true }).click(); await page.getByRole('button', { name: t.reveal, exact: true }).click();
    const revealDialog = page.getByRole('alertdialog', { name: t.revealTitle, exact: true }); await captureDialog(page, revealDialog, `${locale}-390-reveal-confirmation`);
    const revealed = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/solution-reveals'));
    await revealDialog.getByRole('button', { name: t.reveal, exact: true }).click(); expect((await revealed).status()).toBe(200);
    await expect(page.locator('[data-project-solution]')).toContainText(caseCode === 'BR02' ? '1,180' : '1 200'); await capture(page, `${locale}-390-project-solution`);
    await page.getByRole('tab', { name: t.write, exact: true }).click(); await page.getByRole('textbox', { name: t.nextStep, exact: true }).fill('Une révision plus récente garde les anciennes déclarations intactes.'); const updated = await saveProject(page, locale);
    expect(updated.currentRevisionId).not.toBe(assessment.projectRevisionId); await page.getByRole('tab', { name: t.check, exact: true }).click(); await expect(result).toContainText(t.olderAssessment);
    await page.getByRole('tab', { name: t.history, exact: true }).click(); await expect(page.getByRole('heading', { name: t.revisions, exact: true })).toBeVisible(); await capture(page, `${locale}-390-project-history`);
    await page.goto(projectsPath(locale === 'fr' ? 'en' : 'fr', own.id)); await expect(page.locator('textarea[name="nextStep"]')).toHaveValue('Une révision plus récente garde les anciennes déclarations intactes.');
    expect((await projectRecord(context.request, own.id)).fields.locale).toBe(locale);
  });

  test('réponse retardée, deux éditeurs, 412 comparé et panne réelle sans perte de production', async ({ page, context }) => {
    const t = getProjectsDictionary('fr'), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    const own = await createPersonalProject(context.request, account.id, fixture.BR01.fr); await openProject(page, 'fr', own); await page.setViewportSize({ width: 390, height: 844 });
    let release!: () => void, entered!: () => void, delivered!: () => void, first = true;
    const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; }), finished = new Promise<void>((resolve) => { delivered = resolve; });
    await page.route(`**/api/v1/me/projects/${own.id}`, async (route) => {
      if (route.request().method() !== 'PATCH' || !first) return route.continue(); first = false;
      try { const response = await route.fetch(); expect(response.status()).toBe(200); entered(); await gate; await route.fulfill({ response }); } finally { delivered(); }
    });
    const objective = page.getByRole('textbox', { name: t.objective, exact: true });
    try {
      await objective.fill('Snapshot réellement enregistré'); await page.getByRole('button', { name: t.save, exact: true }).click(); await started;
      await objective.fill('Dernière saisie locale pendant la réponse'); release(); await finished;
      await expect(objective).toHaveValue('Dernière saisie locale pendant la réponse'); await expect(page.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'modified'); await saveProject(page, 'fr');
    } finally { release(); if (!first) await finished; await page.unrouteAll({ behavior: 'wait' }); }
    await objective.fill('Saisie conservée quand la navigation est annulée');
    const navigationPrompt = new Promise<void>((resolve) => page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toBe(t.unsavedLeave); await dialog.dismiss(); resolve();
    }));
    await page.getByRole('link', { name: t.back, exact: true }).click(); await navigationPrompt;
    await expect(page).toHaveURL(new RegExp(projectsPath('fr', own.id) + '$'));
    await expect(objective).toHaveValue('Saisie conservée quand la navigation est annulée');
    const second = await context.newPage();
    try {
      await second.setViewportSize({ width: 390, height: 844 }); await openProject(second, 'fr', own); await second.getByRole('textbox', { name: t.objective, exact: true }).fill('Production conservée du deuxième onglet');
      await objective.fill('Production confirmée du premier onglet'); await saveProject(page, 'fr');
      const rejected = second.waitForResponse((value) => value.request().method() === 'PATCH' && value.url().endsWith(`/me/projects/${own.id}`)); await second.getByRole('button', { name: t.save, exact: true }).click(); expect((await rejected).status()).toBe(412);
      await expect(second.getByRole('heading', { name: t.conflictTitle, exact: true })).toBeVisible(); await expect(second.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Production conservée du deuxième onglet');
      await expect(second.locator('pre').filter({ hasText: 'Production confirmée du premier onglet' })).toBeVisible(); await capture(second, 'fr-390-project-conflict');
      await second.getByRole('button', { name: t.keepLocal, exact: true }).click(); await second.getByRole('alertdialog', { name: t.keepLocal, exact: true }).getByRole('button', { name: t.keepLocal, exact: true }).click();
      let stopped = false;
      try {
        await controlApi('stop-api'); stopped = true; await second.getByRole('button', { name: t.save, exact: true }).click(); await expect(second.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'error');
        await expect(second.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Production conservée du deuxième onglet'); await capture(second, 'fr-390-project-api-unavailable');
      } finally { if (stopped) await controlApi('start-api'); }
      const recoveredStatus = second.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/me/projects/${own.id}/status`) && response.status() === 200);
      const recovered = await saveProject(second, 'fr');
      expect((await (await recoveredStatus).json() as { currentRevisionId: string }).currentRevisionId).toBe(recovered.currentRevisionId);
      const projectHeader = second.getByRole('main').locator('header').filter({ hasText: t.stateHelp });
      await expect(projectHeader.getByText(t.unavailable, { exact: true })).toHaveCount(0);
      await expect(projectHeader.getByRole('alert')).toHaveCount(0);
      await capture(second, 'fr-390-project-api-recovered'); await privateNotStored(second, 'Production conservée du deuxième onglet');
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await second.getByRole('button', { name: t.copy, exact: true }).click();
      await expect(second.getByText(t.copied, { exact: true })).toBeVisible();
      expect(await second.evaluate(() => navigator.clipboard.readText())).toContain('Production conservée du deuxième onglet');
      // A return to identical data is a valid no-op response, not a failed save.
      await second.getByRole('textbox', { name: t.objective, exact: true }).fill('Retouche annulée'); await second.getByRole('textbox', { name: t.objective, exact: true }).fill('Production conservée du deuxième onglet'); await saveProject(second, 'fr');
      await context.clearCookies({ name: 'SESSION' }); await second.getByRole('textbox', { name: t.objective, exact: true }).fill('Saisie gardée après expiration');
      await second.getByRole('button', { name: t.save, exact: true }).click(); await expect(second.getByText(t.expiredSession, { exact: true }).first()).toBeVisible(); await expect(second.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Saisie gardée après expiration'); await capture(second, 'fr-390-project-session-expired');
    } finally { await second.close(); }
  });

  test('propriété, retrait réel du dossier et accès personnel conservé sans corrigé public', async ({ page, context, browser }) => {
    const t = getProjectsDictionary('fr'), a = await methodLearner(context.request); await loginMethodAccount(context.request, a);
    const own = await createPersonalProject(context.request, a.id, fixture.BR02.fr), other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const b = await methodLearner(other.request); await loginMethodAccount(other.request, b);
      expect((await other.request.get(`/api/v1/me/projects/${own.id}`)).status()).toBe(404);
      expect((await patchProject(other.request, b.id, own, own.fields)).status()).toBe(404);
      expect((await other.request.get(`/api/v1/me/projects/${own.id}/revisions`)).status()).toBe(404);
      const foreign = await other.newPage(); const denied = await foreign.goto(projectsPath('fr', own.id)); expect(denied?.status()).toBe(404); expect((await foreign.content()).includes(own.fields.externalText)).toBe(false);
    } finally { await other.close(); }
    const source = await currentContent(editor, fixture.BR02.fr.value.id); await contentAction(editor, source, 'archive', { reason: 'P09 pedagogical withdrawal retains personal production and evidence' });
    await openProject(page, 'fr', own); await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: t.openBrief, exact: true }).click(); const dossier = page.getByRole('dialog', { name: t.brief, exact: true }); await expect(dossier).toContainText(t.sourceUnavailable); await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: t.clarifications, exact: true }).fill('Production personnelle conservée après retrait'); await saveProject(page, 'fr');
    await page.getByRole('tab', { name: t.solution, exact: true }).click(); await expect(page.getByRole('button', { name: t.reveal, exact: true })).toBeDisabled(); await expect(page.getByText(t.revealUnavailable, { exact: true })).toBeVisible(); await capture(page, 'fr-390-withdrawn-source-personal-project');
    await page.getByRole('tab', { name: t.write, exact: true }).click(); await expect(page.getByRole('textbox', { name: t.clarifications, exact: true })).toHaveValue('Production personnelle conservée après retrait');
  });

  test('création 201 retenue puis véritable connexion B : aucun accusé adopté sous le nouveau compte', async ({ page, context }) => {
    const t = getProjectsDictionary('en'), a = await methodLearner(context.request, 'en'), b = await methodLearner(context.request, 'en'); await loginMethodAccount(context.request, a);
    await page.goto(projectSourceHref(fixture.BR01.en, 'en')); await page.getByRole('button', { name: t.start, exact: true }).click();
    const prep = page.locator('[data-project-preparation]'), marker = `P09 account boundary ${randomUUID()}`; await prep.getByRole('textbox', { name: t.title, exact: true }).fill(marker); await prep.getByRole('textbox', { name: t.objective, exact: true }).fill(marker);
    let release!: () => void, delivered!: () => void, started = false, committed: ProjectView | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; }), finished = new Promise<void>((resolve) => { delivered = resolve; });
    await page.route('**/api/v1/me/projects', async (route) => {
      if (route.request().method() !== 'POST') return route.continue(); started = true;
      try { const actual = await route.fetch(); expect(actual.status()).toBe(201); committed = await actual.json() as ProjectView; await gate; await route.fulfill({ response: actual }); } finally { delivered(); }
    });
    const otherTab = await context.newPage();
    try {
      await prep.getByRole('button', { name: t.save, exact: true }).click(); await expect.poll(() => committed !== null).toBe(true);
      await otherTab.goto(`${authPath('en', 'sign-in')}?returnTo=${encodeURIComponent(projectsPath('en'))}`); await fillMethodLogin(otherTab, 'en', b); await expect(otherTab).toHaveURL(new RegExp(projectsPath('en') + '$'));
      const notice = prep.getByRole('status').filter({ hasText: t.accountChanged }); await expect(notice).toBeVisible(); release(); await finished;
      await expect(prep.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'error'); await expect(prep.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue(marker); await expect(prep.getByRole('button', { name: t.save, exact: true })).toBeDisabled(); await expect(prep.getByText(t.saved, { exact: true })).toHaveCount(0);
      expect((await (await context.request.get('/api/v1/me/projects')).json() as { total: number }).total).toBe(0); await privateNotStored(page, marker);
      for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await captureRegion(page, prep, `en-${width}-project-account-changed`); }
    } finally { release(); if (started) await finished; await page.unrouteAll({ behavior: 'wait' }); await otherTab.close(); }
  });

  test('CMS réel : consulter BR02 ne remplace rien, appliquer puis modifier et sauvegarder sans publier', async ({ browser }) => {
    const cms = getCmsDictionary('fr'), t = getProjectEditorialDictionary('fr');
    const original = await createContent(editor, editorialContent('fr'));
    const cmsContext = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN, storageState: await editor.storageState() });
    try {
      const page = await cmsContext.newPage(); await page.goto(`/fr/admin/content/${original.value.id}/edit`);
      const policy = page.getByRole('heading', { name: t.title, exact: true }).locator('..');
      await policy.getByRole('combobox', { name: t.reference, exact: true }).selectOption('BR02');
      const loaded = page.waitForResponse((value) => value.request().method() === 'GET' && value.url().includes('/admin/project-presets/BR02?locale=fr'));
      await policy.getByRole('button', { name: t.load, exact: true }).click(); expect((await loaded).status()).toBe(200);
      await expect(page.getByRole('textbox', { name: cms.criterion, exact: true })).toHaveCount(1);
      expect((await currentContent(editor, original.value.id)).value.currentRevisionId).toBe(original.value.currentRevisionId);
      await expect(policy.getByRole('spinbutton', { name: t.threshold, exact: true })).toHaveCount(0);
      await policy.getByRole('button', { name: t.apply, exact: true }).click();
      const confirmation = page.getByRole('alertdialog', { name: t.replaceTitle, exact: true });
      await captureDialog(page, confirmation, 'fr-1440-cms-project-apply-confirmation');
      await confirmation.getByRole('button', { name: t.confirm, exact: true }).click();
      await expect(page.getByRole('textbox', { name: cms.criterion, exact: true })).toHaveCount(20);
      for (let index = 1; index <= 4; index++) await expect(policy.getByRole('textbox', { name: `${t.issue} ${index}`, exact: true })).not.toBeEmpty();
      await expect(policy.getByRole('spinbutton', { name: t.threshold, exact: true })).toHaveValue('16');
      await expect(policy.getByRole('combobox', { name: t.reveal, exact: true })).toHaveValue('EXPLICIT');
      await policy.getByRole('spinbutton', { name: t.threshold, exact: true }).fill('18');
      await policy.getByRole('combobox', { name: t.reveal, exact: true }).selectOption('AFTER_SUBMISSION');
      const issue = policy.getByRole('textbox', { name: `${t.issue} 1`, exact: true }), label = `${await issue.inputValue()} · libellé revu localement`;
      await issue.fill(label); await page.locator('#cms-reason').fill('P09 explicit reference selection and review; keep this fixture a draft');
      const saved = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith(`/admin/contents/${original.value.id}/revisions`));
      await page.getByRole('button', { name: cms.save, exact: true }).click(); expect((await saved).status()).toBe(200);
      await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
      const current = (await currentContent(editor, original.value.id)).value;
      expect(current.document?.projectPolicy?.caseCode).toBe('BR02'); expect(current.document?.projectPolicy?.passPoints).toBe(18); expect(current.document?.projectPolicy?.revealPolicy).toBe('AFTER_SUBMISSION');
      expect(current.document?.projectPolicy?.blockingIssues[0].label).toBe(label); expect(current.document?.rubric).toHaveLength(20);
      expect(current.document?.blocks).toEqual(original.value.document?.blocks); expect(current.document?.exercise).toEqual(original.value.document?.exercise);
      expect(current.state).toBe('DRAFT'); expect(current.publishedRevisionId).toBeNull();
      for (const width of [1440, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await captureRegion(page, policy, `fr-${width}-cms-project-policy-saved`); }
    } finally { await cmsContext.close(); }
  });
});
