import { expect, test, type APIRequestContext, type Page, type Dialog } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EnrollmentView, LearningActivity, ProjectView, QuizAttemptView, QuizCheckResult, SelfAssessmentView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { getPracticeDraftDictionary } from '../../apps/web/src/lib/i18n/practice-draft';
import { getActivityQuizDictionary } from '../../apps/web/src/lib/i18n/activity-quiz';
import { getProjectDraftDictionary } from '../../apps/web/src/lib/i18n/project-draft';
import { getExportsDictionary } from '../../apps/web/src/lib/i18n/exports';
import { projectDraftPrefix, projectDraftTtlMs } from '../../apps/web/src/lib/auth/project-draft';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { approveCourseShowcaseFixture, courseLessonHref, courseRecord, downloadBytes, grantCourseTestAccess, prepareCourseFixture, publishCourseFixture, sha256, type CourseFixture, type CourseLocale } from './course-content-fixture';
import { checkedUuid, commerceSql } from './commerce-fixture';
import { csrfHeaders } from './editorial-fixture';
import { fillMethodLogin, loginMethodAccount, methodLearner } from './methods-fixture';
import { createProjectFixture, projectRecord, projectSourceHref } from './projects-fixture';

const stage = process.env.COURSES_AUD05_STAGE ?? 'after';
if (!['before', 'after'].includes(stage)) throw new Error('AUD05 capture stage required.');
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const captures: string[] = [], observations: Array<Record<string, unknown>> = [], outcomes: Array<Record<string, unknown>> = [];
const exports: Array<Record<string, unknown>> = [];
async function capture(page: Page, name: string, fullPage = false) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (stage === 'after') expect(noOverflow).toBe(true);
  const file = `${stage}-${name}.png`; await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, file), fullPage, animations: 'disabled' }); captures.push(file);
  observations.push({ check: 'capture-layout', name, noOverflow, viewport: page.viewportSize() });
}
async function quizAnswers(page: Page, fixture: CourseFixture, locale: CourseLocale) {
  for (const question of courseRecord(fixture, 'activity-m01', locale).value.document!.quiz) await page.getByRole('radio', { name: question.options[question.correctOption], exact: true }).click();
}
async function exportDraft(page: Page, locale: CourseLocale, kind: 'practice' | 'project', textLocale: CourseLocale, marker: string) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: getExportsDictionary(locale).action, exact: true }).press('Enter');
  const download = await pending, bytes = await downloadBytes(download), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  expect(download.suggestedFilename()).toBe(`${kind}-${textLocale}.md`); expect(text.includes(marker)).toBe(true);
  exports.push({ kind, interfaceLocale: locale, textLocale, filename: download.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes), actualBrowserDownload: true, includesCurrentText: true });
}
async function saveProject(page: Page, locale: CourseLocale, create: boolean, ready = false) {
  const t = getProjectsDictionary(locale), response = page.waitForResponse(value => value.request().method() === (create ? 'POST' : 'PATCH') && /\/api\/v1\/me\/projects(?:\/[^/?]+)?$/.test(new URL(value.url()).pathname));
  await page.getByRole('button', { name: ready ? t.ready : t.save, exact: true }).click(); const result = await response; expect(result.status()).toBe(create ? 201 : 200);
  await expect(page.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'saved'); return await result.json() as ProjectView;
}

test.describe('AUD05 practical workshop with distinct local and durable facts', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture, browserVersion = '';
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); browserVersion = browser.version();
    fixture = await prepareCourseFixture(editor); await publishCourseFixture(editor, fixture); await approveCourseShowcaseFixture(editor, fixture);
  });
  test.afterEach(async ({}, info) => { outcomes.push({ name: info.title, status: info.status, expectedStatus: info.expectedStatus }); });
  test.afterAll(async () => {
    await editor?.dispose(); writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud05-workshop-checks.json'), JSON.stringify({
      schemaVersion: 1, stage, browser: 'chromium', browserVersion, headless: true, beforeIsCaptureBaselineOnly: stage === 'before',
      fixture: 'Authored P18 course, technically published/selected only in owned PostgreSQL/S3 tmpfs.',
      humanEditorialApproval: false, sharedContentChanged: false, paymentOrProviderRequests: false, deployed: false, outcomes, observations, exports, captures,
    }, null, 2) + '\n', { flag: 'wx' });
  });
  test('M01 free activity FR/EN desktop/mobile baseline and final comparison', async ({ page }) => {
    for (const locale of ['fr', 'en'] as const) {
      const source = courseRecord(fixture, 'activity-m01', locale).value, t = getLearningDictionary(locale);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport); const response = await page.goto(courseLessonHref(fixture, 'm01', locale)); expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: source.title, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: t.checkQuiz, exact: true })).toBeEnabled();
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
        if (stage === 'after') {
          await expect(page.locator('[data-workshop-moment]')).toHaveCount(4);
          const draft = page.locator('[data-activity-practice-draft]'); await expect(draft.getByRole('textbox', { name: getPracticeDraftDictionary(locale).response, exact: true })).toBeEditable();
          await expect(draft.getByRole('textbox', { name: getPracticeDraftDictionary(locale).response, exact: true })).toHaveValue('');
          expect(await draft.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('[data-workshop-checklist]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        }
        await capture(page, `m01-${locale}-${viewport.width}`); await capture(page, `m01-${locale}-${viewport.width}-full`, true);
      }
      const preparation = page.getByRole('button', { name: getProjectsDictionary(locale).start, exact: true });
      observations.push({ check: 'baseline-m01-project-policy', locale, projectPolicyPresent: Boolean(source.document?.projectPolicy), preparationButtonPresent: await preparation.count() > 0 });
      if (stage === 'before' && await preparation.count()) { await preparation.click(); await expect(page.locator('[data-project-preparation]')).toBeVisible(); await capture(page, `m01-${locale}-390-preparation`, true); }
      if (stage === 'before') {
        for (const question of source.document!.quiz) await page.getByRole('radio', { name: question.options[question.correctOption], exact: true }).click();
        const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/quiz-checks'));
        await page.getByRole('button', { name: t.checkQuiz, exact: true }).click(); expect((await response).status()).toBe(200);
        await expect(page.locator('[data-learning-quiz-result="formative"]')).toBeVisible(); await capture(page, `m01-${locale}-390-quiz-result`, true);
      }
    }
    expect(captures.length).toBeGreaterThanOrEqual(8);
  });

  if (stage === 'after') {
    test('anonymous practice stays local, copies and exports real text and warns before language loss', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      for (const locale of ['fr', 'en'] as const) {
        const t = getPracticeDraftDictionary(locale); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(courseLessonHref(fixture, 'm01', locale));
        const draft = page.locator('[data-activity-practice-draft]'), text = draft.getByRole('textbox', { name: t.response, exact: true }); await expect(text).toBeEditable(); await expect(text).toHaveValue('');
        await expect(draft.getByRole('button', { name: t.copy, exact: true })).toBeDisabled();
        const marker = `AUD05 ${locale} mon essai personnel ${randomUUID()}`; await text.fill(marker); await draft.getByRole('combobox', { name: t.language, exact: true }).selectOption('fr');
        await expect(text).toHaveAttribute('lang', 'fr'); await draft.locator('summary').focus(); await page.keyboard.press('Enter');
        await expect(draft).toContainText(courseRecord(fixture, 'activity-m01', locale).value.document!.exercise!.instructions);
        await draft.getByRole('button', { name: t.copy, exact: true }).press('Enter'); await expect(draft.getByText(t.copied, { exact: true })).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(marker);
        await exportDraft(page, locale, 'practice', 'fr', marker);
        expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(entry => !String(entry).includes(value)), marker)).toBe(true);
        let momentDialogs = 0; const unexpectedMomentDialog = async (dialog: Dialog) => { momentDialogs++; await dialog.dismiss(); };
        page.on('dialog', unexpectedMomentDialog); await page.locator('[data-workshop-navigation] a[href="#activity-verify"]').click(); page.off('dialog', unexpectedMomentDialog); expect(momentDialogs).toBe(0); await expect(text).toHaveValue(marker);
        await capture(page, `practice-${locale}-390-written`, true);
        const language = page.getByRole('link', { name: locale === 'fr' ? 'English' : 'Français', exact: true }).first();
        let rejected = false; const refuse = async (dialog: Dialog) => { if (dialog.type() === 'confirm') { expect(dialog.message()).toBe(t.unsaved); rejected = true; } await dialog.dismiss(); };
        page.on('dialog', refuse); await language.click(); page.off('dialog', refuse); expect(rejected).toBe(true); await expect(text).toHaveValue(marker); await expect(text).toHaveAttribute('lang', 'fr');
        let accepted = false; const accept = async (dialog: Dialog) => { if (dialog.type() === 'confirm') { expect(dialog.message()).toBe(t.unsaved); accepted = true; } await dialog.accept(); };
        page.on('dialog', accept); await language.click(); await expect(page).toHaveURL(new RegExp(`/${locale === 'fr' ? 'en' : 'fr'}/`)); page.off('dialog', accept); expect(accepted).toBe(true);
        await expect(page.locator('[data-activity-practice-draft] textarea[name="practiceText"]')).toHaveValue(''); expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
        observations.push({ check: 'anonymous-local-practice', locale, initialTextEmpty: true, originalWritingLanguageKeptOnRefusedNavigation: 'fr', realClipboardCopy: true, realMarkdownExport: true, noBrowserPersistence: true, refusalKeepsText: true, acceptedNavigationHasClearLossWarning: true, accountNotRequired: true });
      }
    });

    test('formative quiz validates focus and explains answers before summary without saved attempts', async ({ page, context }) => {
      const before = commerceSql('SELECT count(*) FROM learning_quiz_attempts;');
      for (const locale of ['fr', 'en'] as const) {
        const t = getLearningDictionary(locale), q = getActivityQuizDictionary(locale), source = courseRecord(fixture, 'activity-m01', locale).value;
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(courseLessonHref(fixture, 'm01', locale));
        await page.getByRole('button', { name: t.checkQuiz, exact: true }).press('Enter'); await expect(page.getByText(t.answerRequired, { exact: true })).toBeVisible(); await expect(page.getByRole('radio').first()).toBeFocused();
        await quizAnswers(page, fixture, locale); const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/quiz-checks'));
        await page.getByRole('button', { name: t.checkQuiz, exact: true }).press('Enter'); const received = await response; expect(received.status()).toBe(200); const result = await received.json() as QuizCheckResult; expect(result.passed).toBe(true); expect('id' in result).toBe(false);
        const feedback = page.locator('[data-learning-quiz-result="formative"]'); await expect(feedback.locator('[data-quiz-conservation="page"]')).toContainText(q.pageOnly);
        expect(await feedback.evaluate(node => Boolean(node.querySelector('[data-quiz-answers]')!.compareDocumentPosition(node.querySelector('[data-quiz-summary]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        for (const question of source.document!.quiz) { await expect(feedback).toContainText(question.options[question.correctOption]); await expect(feedback).toContainText(question.explanation); }
        await expect(page.getByRole('button', { name: q.checkAgain, exact: true })).toBeVisible(); await capture(page, `formative-${locale}-390-answers-explained`, true);
        expect((await context.request.get('/api/v1/me/quiz-attempts?activityVersionId=' + source.versionId)).status()).toBe(401);
        observations.push({ check: 'formative-quiz', locale, requiredAnswerFocus: true, explanationsBeforeScoreSummary: true, noAttemptId: true, noRecoveryPromisedAfterLogin: true });
      }
      expect(commerceSql('SELECT count(*) FROM learning_quiz_attempts;')).toBe(before);
    });

    test('configured FREE technical P09 workshop retains only consented two-hour draft and imports explicitly', async ({ page, context, playwright }) => {
      const technical = await createProjectFixture(editor), source = technical.BR01.fr, t = getProjectsDictionary('fr'), draftText = getProjectDraftDictionary('fr');
      const account = await methodLearner(context.request), marker = `AUD05 préparation technique personnelle ${randomUUID()}`;
      await page.setViewportSize({ width: 390, height: 844 }); await page.goto(projectSourceHref(source, 'fr'));
      const start = page.getByRole('button', { name: t.start, exact: true }); await expect(start).toBeEnabled(); await start.focus(); await page.keyboard.press('Enter');
      const preparation = page.locator('[data-project-preparation]'); await expect(preparation.getByRole('textbox', { name: t.objective, exact: true })).toBeEditable();
      for (const field of ['objective', 'scope', 'method', 'timeline', 'budget', 'clarifications', 'nextStep', 'externalText'] as const) await expect(preparation.getByRole('textbox', { name: t[field], exact: true })).toHaveValue('');
      await preparation.getByRole('textbox', { name: t.title, exact: true }).fill(marker); await preparation.getByRole('textbox', { name: t.objective, exact: true }).fill('Ma rédaction indépendante en français.');
      const briefButton = preparation.getByRole('button', { name: t.openBrief, exact: true }); await briefButton.click(); const brief = page.getByRole('dialog', { name: t.brief, exact: true }); await expect(brief).toBeVisible(); await page.keyboard.press('Escape'); await expect(briefButton).toBeFocused(); await expect(preparation.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue('Ma rédaction indépendante en français.');
      expect(await page.evaluate(prefix => Object.keys(sessionStorage).some(key => key.startsWith(prefix)), projectDraftPrefix)).toBe(false);
      await expect(preparation.getByRole('button', { name: t.keepAndSignIn, exact: true })).toBeDisabled();
      await preparation.getByRole('checkbox', { name: t.consentDraft, exact: true }).check(); await preparation.getByRole('button', { name: t.keepAndSignIn, exact: true }).click();
      const consent = page.getByRole('alertdialog', { name: t.keepAndSignIn, exact: true }); await expect(consent).toContainText(t.anonymousHelp); await capture(page, 'p09-technical-consent-390', true); await consent.getByRole('button', { name: t.keepAndSignIn, exact: true }).click();
      const stored = await page.evaluate(prefix => { const key = Object.keys(sessionStorage).find(value => value.startsWith(prefix)); if (!key) return null; const value = JSON.parse(sessionStorage.getItem(key)!); return { remainingMs: value.expiresAt - Date.now(), locale: value.fields.locale, enrollmentId: value.source.enrollmentId }; }, projectDraftPrefix);
      expect(stored).not.toBeNull(); expect(stored!.remainingMs).toBeLessThanOrEqual(projectDraftTtlMs); expect(stored!.remainingMs).toBeGreaterThan(projectDraftTtlMs - 120000); expect(stored!.locale).toBe('fr'); expect(stored!.enrollmentId).toBeNull();
      await fillMethodLogin(page, 'fr', account); await expect(page.getByRole('button', { name: draftText.importAction, exact: true })).toBeVisible();
      expect((await (await context.request.get('/api/v1/me/projects')).json()).total).toBe(0); await page.getByRole('button', { name: draftText.importAction, exact: true }).click();
      const objective = page.getByRole('textbox', { name: t.objective, exact: true }); await expect(objective).toHaveValue('Ma rédaction indépendante en français.'); expect((await (await context.request.get('/api/v1/me/projects')).json()).total).toBe(0);
      const title = page.getByRole('textbox', { name: t.title, exact: true }); await title.fill(''); await page.getByRole('button', { name: t.save, exact: true }).click(); await expect(page.getByText(t.titleRequired, { exact: true })).toBeVisible(); await expect(title).toBeFocused(); await title.fill(marker);
      const project = await saveProject(page, 'fr', true); expect(project.fields.locale).toBe('fr'); expect(project.fields.objective).toBe('Ma rédaction indépendante en français.');
      expect(await page.evaluate(prefix => Object.keys(sessionStorage).some(key => key.startsWith(prefix)), projectDraftPrefix)).toBe(false);
      await page.goto(projectsPath('en', project.id)); await expect(page.getByRole('textbox', { name: getProjectsDictionary('en').objective, exact: true })).toHaveValue('Ma rédaction indépendante en français.'); expect((await projectRecord(context.request, project.id)).fields.locale).toBe('fr'); await capture(page, 'p09-saved-fr-text-in-en-interface-390', true);
      const outsider = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); try { const other = await methodLearner(outsider); await loginMethodAccount(outsider, other); expect((await outsider.get(`/api/v1/me/projects/${project.id}`)).status()).toBe(404); } finally { await outsider.dispose(); }
      observations.push({ check: 'technical-free-p09-draft', technicalFixtureNotM01OrProductionM04: true, consentRequired: true, storedTtlUpperBoundMs: projectDraftTtlMs, sampledRemainingMs: stored!.remainingMs, importDoesNotSave: true, explicitSave: true, fieldErrorFocus: true, sourceLocale: 'fr', productionLocale: 'fr', englishInterfaceDoesNotTranslate: true, outsiderRefused: true });
    });

    test('authenticated quiz and declared reading remain separate from completion and project evidence', async ({ page, context }) => {
      const locale = 'fr', t = getLearningDictionary(locale), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
      const course = courseRecord(fixture, 'course-client-proposal', locale).value, source = courseRecord(fixture, 'activity-m01', locale).value;
      const enrollmentResponse = await context.request.post('/api/v1/me/enrollments', { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': account.id }, data: { courseResourceId: course.resourceId, courseVersionId: course.versionId, locale } }); expect(enrollmentResponse.status()).toBe(201); const enrollment = await enrollmentResponse.json() as EnrollmentView;
      await page.goto(courseLessonHref(fixture, 'm01', locale)); await expect(page.locator('[data-learning-progress]')).toBeVisible(); await quizAnswers(page, fixture, locale);
      const grading = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/quiz-attempts')); await page.getByRole('button', { name: t.submitQuiz, exact: true }).click(); const response = await grading; expect(response.status()).toBe(201); const attempt = await response.json() as QuizAttemptView; expect(attempt.passed).toBe(true);
      await expect(page.locator('[data-learning-quiz-result="attempt"]').first().locator('[data-quiz-conservation="saved"]')).toContainText(getActivityQuizDictionary(locale).saved);
      const progress = page.locator('[data-learning-progress]'); await progress.getByRole('checkbox', { name: t.read, exact: true }).check(); const changed = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname.startsWith('/api/v1/me/activity-progress/')); await progress.getByRole('button', { name: t.saveProgress, exact: true }).click(); expect((await changed).status()).toBe(200);
      const actual = await context.request.get(`/api/v1/me/enrollments/${enrollment.summary.id}/activities/${source.resourceId}?activityVersionId=${source.versionId}&locale=fr`); expect(actual.status()).toBe(200); const value = await actual.json() as LearningActivity; expect(value.progress.readAt).not.toBeNull(); expect(value.progress.completedAt).toBeNull();
      expect(commerceSql(`SELECT count(*) FROM projects WHERE owner_id='${checkedUuid(account.id)}';`)).toBe('0'); await capture(page, 'authenticated-quiz-reading-not-completion-1440', true);
      observations.push({ check: 'durable-quiz-independent-facts', attemptId: attempt.id, durableAttemptSaved: true, readDeclared: true, completionNotDeclared: true, noProjectCreatedByQuiz: true });
    });

    test('protected configured M04 project keeps source, declared assessment and revealed solution distinct', async ({ page, context }) => {
      const accessEvents: Array<{ kind: string; method: string; status: number }> = [];
      page.on('response', response => { const path = new URL(response.url()).pathname; const kind = /\/me\/resources\//.test(path) ? 'member-resource' : /\/me\/project-templates\//.test(path) ? 'project-template' : /\/visits$/.test(path) ? 'visit' : null; if (kind) accessEvents.push({ kind, method: response.request().method(), status: response.status() }); });
      const account = await methodLearner(context.request); await loginMethodAccount(context.request, account); grantCourseTestAccess(account.id, fixture);
      try {
        const source = courseRecord(fixture, 'activity-m04', 'fr').value, t = getProjectsDictionary('fr');
        const member = await context.request.get(`/api/v1/me/resources/${source.resourceId}/versions/${source.versionId}?locale=fr`); expect(member.status()).toBe(200);
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(courseLessonHref(fixture, 'm04', 'fr')); await page.getByRole('button', { name: t.start, exact: true }).click();
        const preparation = page.locator('[data-project-preparation]');
        for (const field of ['objective', 'scope', 'method', 'timeline', 'budget', 'clarifications', 'nextStep', 'externalText'] as const) await expect(preparation.getByRole('textbox', { name: t[field], exact: true })).toHaveValue('');
        await preparation.getByRole('textbox', { name: t.objective, exact: true }).fill('Ma proposition personnelle à vérifier contre le dossier.');
        const project = await saveProject(page, 'fr', true); expect(project.origin.activityId).toBe(source.resourceId); expect(project.origin.activityVersionId).toBe(source.versionId); await saveProject(page, 'fr', false, true);
        await page.goto(projectsPath('fr', project.id)); await page.getByRole('tab', { name: t.check, exact: true }).click(); const grid = page.locator('[data-project-assessment-state]');
        const current = await projectRecord(context.request, project.id); for (const criterion of current.rubric.criteria) await grid.getByRole('checkbox', { name: criterion.label, exact: true }).check(); await grid.getByRole('checkbox', { name: current.rubric.blockingIssues[0].label, exact: true }).check();
        const recorded = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/self-assessments')); await grid.getByRole('button', { name: t.submitAssessment, exact: true }).click(); const assessmentResponse = await recorded; expect(assessmentResponse.status()).toBe(201); const assessment = await assessmentResponse.json() as SelfAssessmentView; expect(assessment.scorePoints).toBe(assessment.maxPoints); expect(assessment.thresholdMet).toBe(true); expect(assessment.needsRevision).toBe(true); expect(assessment.blockingIssues).toHaveLength(1);
        await expect(page.locator(`[data-project-assessment-result="${assessment.id}"]`)).toContainText(t.assessmentNotice); await capture(page, 'm04-declared-assessment-blocking-390', true);
        await page.getByRole('tab', { name: t.solution, exact: true }).click(); await page.getByRole('button', { name: t.reveal, exact: true }).click(); const confirm = page.getByRole('alertdialog', { name: t.revealTitle, exact: true }); const revealed = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/solution-reveals')); await confirm.getByRole('button', { name: t.reveal, exact: true }).click(); expect((await revealed).status()).toBe(200);
        await expect(page.locator('[data-project-solution]')).toBeVisible(); expect((await projectRecord(context.request, project.id)).currentRevisionId).toBe(current.currentRevisionId); await capture(page, 'm04-solution-not-project-validation-390', true);
        observations.push({ check: 'protected-project-policy-preserved', origin: 'MANUAL_TEST', exactSourceRetained: true, initialProductionEmpty: true, declarationNeedsRevisionDespitePoints: true, correctionRevealDoesNotChangeProductionRevision: true, noHumanReviewClaimed: true });
      } catch (error) {
        const facts = JSON.parse(commerceSql(`SELECT jsonb_build_object('grantCount',count(*),'activeGrantCount',count(*) FILTER(WHERE revoked_at IS NULL AND starts_at<=clock_timestamp() AND(expires_at IS NULL OR expires_at>clock_timestamp())),'manualTestGrantCount',count(*) FILTER(WHERE origin_type='MANUAL_TEST')) FROM access_grants WHERE owner_id='${checkedUuid(account.id)}';`));
        writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'protected-access-failure-before-cleanup.json'), JSON.stringify({ recordedBeforeCleanup: true, authStatus: (await context.request.get('/api/v1/auth/me')).status(), accessEvents, facts, automaticRetry: false, privacy: 'No personal text, identity, URL, cookie or secret recorded.' }, null, 2) + '\n', { flag: 'wx' }); throw error;
      }
    });
  }
});
