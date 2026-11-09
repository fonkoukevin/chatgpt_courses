import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { ActivityNoteView, AttestationView, EnrollmentView, LearningDashboard, MethodView, ProjectView, QuizAttemptView, SelfAssessmentView, SupportTicketView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getMethodsDictionary } from '../../apps/web/src/lib/i18n/methods';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { getAccountDictionary } from '../../apps/web/src/lib/i18n/account';
import { getAssetsDictionary } from '../../apps/web/src/lib/i18n/assets';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { catalogueHref } from '../../apps/web/src/lib/public/routes';
import { ordersPath, orderStatusPath } from '../../apps/web/src/lib/commerce/routes';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { methodsPath } from '../../apps/web/src/lib/methods/routes';
import { accountPath, attestationsHref, attestationsPath, helpHref, helpPath } from '../../apps/web/src/lib/account/routes';
import { projectEtag } from '../../apps/web/src/lib/api/projects-validation';
import { isLearningActivity, isVisitView } from '../../apps/web/src/lib/api/learning-validation';
import { courseRecord, preparedActivity, preparedFile, downloadBytes, sha256 } from './course-content-fixture';
import { contentAction, currentContent } from './editorial-api';
import { commerceHeaders, commerceSql, checkedUuid } from './commerce-fixture';
import { advancePayment, openPaymentCheckoutUi, paymentCount, paymentOrder, waitForPayment } from './payments-fixture';
import { methodLearner, loginMethodAccount, createPersonalMethod, methodFields, methodRecord } from './methods-fixture';
import { projectFields, projectRecord } from './projects-fixture';
import { accountHeaders, nameProfile } from './account-fixture';
import { controlApi } from './control';
import { captureRelease, confirmReleaseDialog, evidenceJson, openPaidCourseLesson, prepareReleaseFixture, prepareReleaseOrder, pressEnabled, recordReleaseFailure, saveReleaseProject, type ReleaseFixture, type ReleasePayment, type ScenarioId } from './release-candidate-fixture';

test.describe('P19 controlled release candidate', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: ReleaseFixture, payment: ReleasePayment, enrollment: EnrollmentView;
  let note: ActivityNoteView, attempt: QuizAttemptView, method: MethodView, project: ProjectView;
  test.beforeAll(async ({ playwright }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    fixture = await prepareReleaseFixture(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });
  test.afterEach(async ({ context }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && payment) await recordReleaseFailure(context.request, fixture.course, payment.owner.id, testInfo.title.slice(0, 6) as ScenarioId);
  });

  test('P19-01 catalogue selection, return, empty result and real service failure', async ({ page }) => {
    const t = getPublicDictionary('fr'), course = courseRecord(fixture.course, 'course-client-proposal', 'fr').value;
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(catalogueHref('fr'));
    await page.getByRole('searchbox', { name: t.search, exact: true }).fill('brief client');
    await pressEnabled(page.getByRole('button', { name: t.searchAction, exact: true }));
    for (const [label, value] of [[t.type, 'COURSE'], [t.level, 'BEGINNER'], [t.access, 'PROTECTED'], [t.contentLanguage, 'fr']] as const) await page.getByLabel(label, { exact: true }).selectOption(value);
    await pressEnabled(page.getByRole('button', { name: t.apply, exact: true }));
    await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: course.title, exact: true }).press('Enter'); await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: `← ${t.backCatalogue}`, exact: true }).press('Enter');
    await expect(page).toHaveURL(url => url.pathname === '/fr/catalogue' && Object.entries({ q: 'brief client', type: 'COURSE', level: 'BEGINNER', access: 'PROTECTED', locale: 'fr' }).every(([key, value]) => url.searchParams.get(key) === value));
    const filtered = page.url();
    await page.getByRole('searchbox', { name: t.search, exact: true }).fill(`p19-no-match-${randomUUID()}`);
    await pressEnabled(page.getByRole('button', { name: t.searchAction, exact: true })); await expect(page.getByText(t.emptyTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(t.serviceUnavailable, { exact: true })).toHaveCount(0); await captureRelease(page, 'P19-01', 'fr-390-catalogue-empty');
    let stopped = false;
    try {
      await controlApi('stop-api'); stopped = true; await page.goto(filtered);
      await expect(page.getByText(t.serviceUnavailable, { exact: true }).filter({ visible: true })).toBeVisible(); await expect(page.getByText(t.emptyTitle, { exact: true })).toHaveCount(0);
      await captureRelease(page, 'P19-01', 'fr-390-catalogue-unavailable');
    } finally { if (stopped) await controlApi('start-api'); }
    await pressEnabled(page.getByRole('button', { name: t.retry, exact: true }).filter({ visible: true }));
    await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible();
    for (const [key, value] of Object.entries({ type: 'COURSE', level: 'BEGINNER', access: 'PROTECTED', locale: 'fr' })) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
    evidenceJson('P19-01.json', { scenarioId: 'P19-01', filtersPreservedOnReturn: true, zeroResultDistinctFromActualApiOutage: true, restoredWithoutSubstituteContent: true });
  });

  test('P19-02 paid ORDER_LINE covers the same course and preserved French work in English', async ({ page, context }) => {
    payment = await prepareReleaseOrder(page, fixture);
    const owner = checkedUuid(payment.owner.id), source = courseRecord(fixture.course, 'activity-m04', 'fr').value;
    expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${owner}';`)).toBe('0');
    await openPaymentCheckoutUi(page, payment, true);
    await advancePayment(payment.order.value.id, 'PAID', 'checkout.session.completed'); await waitForPayment(context.request, payment.order.value.id, 'PAID', 'READY');
    expect(paymentCount(payment.order.value.id, 'grants')).toBe(1);
    expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${owner}' AND origin_type='MANUAL_TEST';`)).toBe('0');
    expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${owner}' AND origin_type='ORDER_LINE' AND locales @> '["fr","en"]'::jsonb AND revoked_at IS NULL;`)).toBe('1');
    await page.goto(orderStatusPath('fr', payment.order.value.id)); await expect(page.getByText(getPaymentDictionary('fr').readyTitle, { exact: true })).toBeVisible();
    await openPaidCourseLesson(page, fixture.course, owner, 'm04', 'fr', false);
    const fr = getLearningDictionary('fr');
    const enrolled = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v1/me/enrollments');
    const enrollmentDetail = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname.endsWith(`/activities/${source.resourceId}`) && new URL(value.url()).pathname.startsWith('/api/v1/me/enrollments/') && new URL(value.url()).searchParams.get('activityVersionId') === source.versionId && new URL(value.url()).searchParams.get('locale') === 'fr');
    const enrollmentVisit = page.waitForResponse(value => value.request().method() === 'POST' && /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/visits$/.test(new URL(value.url()).pathname)).catch(() => null);
    await pressEnabled(page.getByRole('button', { name: fr.startCourse, exact: true })); const savedEnrollment = await enrolled; expect(savedEnrollment.status()).toBe(201); enrollment = await savedEnrollment.json() as EnrollmentView;
    await expect(page.getByText(fr.enrolled, { exact: true })).toBeVisible();
    // The message appears before enroll() finishes its GET. Do not destroy that
    // document and its pending response while starting the next observed visit.
    const detail = await enrollmentDetail; expect(detail.status()).toBe(200); expect(await detail.finished()).toBeNull();
    const detailBody: unknown = await detail.json(); expect(isLearningActivity(detailBody)).toBe(true);
    if (!isLearningActivity(detailBody)) throw new Error('The enrolled activity contract must be complete before navigation.');
    expect(detailBody.accessStatus).toBe('ACTIVE'); expect(detailBody.enrollmentId).toBe(enrollment.summary.id); expect(detailBody.activityVersionId).toBe(source.versionId); expect(detailBody.resource.document !== null).toBe(true);
    const visit = await enrollmentVisit; expect(visit !== null).toBe(true); if (!visit) throw new Error('The actual enrollment visit must finish before navigation.');
    expect(visit.status()).toBe(200); expect(await visit.finished()).toBeNull(); expect(isVisitView(await visit.json())).toBe(true);
    await openPaidCourseLesson(page, fixture.course, owner, 'm04', 'fr');
    const marker = `Note française P19 conservée sans traduction ${randomUUID()}`;
    await page.getByRole('textbox', { name: fr.notes, exact: true }).fill(marker);
    const noteResponse = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v1/me/activity-notes');
    await pressEnabled(page.getByRole('button', { name: fr.saveNote, exact: true })); const actualNote = await noteResponse; expect(actualNote.status()).toBe(201); note = await actualNote.json() as ActivityNoteView;
    await expect(page.locator('[data-learning-note-state]')).toHaveAttribute('data-learning-note-state', 'saved');
    for (const question of preparedActivity(fixture.course, 'm04', 'fr').document.quiz) await page.getByRole('radio', { name: question.options[question.correctOption], exact: true }).check();
    const quizResponse = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/quiz-attempts'));
    await pressEnabled(page.getByRole('button', { name: fr.submitQuiz, exact: true })); const quiz = await quizResponse; expect(quiz.status()).toBe(201); attempt = await quiz.json() as QuizAttemptView;
    expect(attempt.locale).toBe('fr'); expect(attempt.activityVersionId).toBe(source.versionId); expect(attempt.passed).toBe(true);
    await captureRelease(page, 'P19-02', 'fr-390-paid-original-note', page.locator('[data-learning-note-state]'));
    method = await createPersonalMethod(context.request, owner, methodFields('fr', `P19 méthode originale ${randomUUID()}`), courseRecord(fixture.course, 'method-client-proposal', 'fr'));
    const privateDownloads = [];
    for (const locale of ['fr', 'en'] as const) {
      if (locale === 'en') {
        await openPaidCourseLesson(page, fixture.course, owner, 'm04', 'en', true, async () => {
          await page.locator('[data-language-switch="en"]').focus(); await page.keyboard.press('Enter');
        });
      }
      const t = getLearningDictionary(locale); await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(marker);
      const lookup = await context.request.get(`/api/v1/me/activity-notes/${note.id}`); expect(lookup.status()).toBe(200); const original = await lookup.json() as ActivityNoteView; expect(original.locale).toBe('fr'); expect(original.text === marker).toBe(true);
      const state = await context.request.get(`/api/v1/me/enrollments/${enrollment.summary.id}/activities/${source.resourceId}?activityVersionId=${source.versionId}&locale=${locale}`); expect(state.status()).toBe(200);
      const current = await state.json() as { enrollmentId: string; quiz: { latestAttemptId: string; passed: boolean } }; expect(current.enrollmentId).toBe(enrollment.summary.id); expect(current.quiz.latestAttemptId).toBe(attempt.id); expect(current.quiz.passed).toBe(true);
      const file = preparedFile(fixture.course, 'proposal-template', locale), access = page.locator(`[data-asset-access="${file.assetId}"]`);
      const downloaded = page.waitForEvent('download'); await pressEnabled(access.getByRole('button', { name: getAssetsDictionary(locale).download, exact: true }));
      const download = await downloaded, bytes = await downloadBytes(download); expect(download.suggestedFilename()).toBe(basename(file.path)); expect(sha256(bytes)).toBe(file.sha256);
      privateDownloads.push({ locale, bytes: bytes.length, sha256: sha256(bytes), actualUiDownload: true, sourceAccess: 'PROTECTED' });
      if (locale === 'en') {
        await captureRelease(page, 'P19-02', 'en-390-paid-original-note', page.locator('[data-learning-note-state]'));
        const historical = page.locator('details').filter({ has: page.locator('[data-learning-quiz-result="attempt"]') });
        await expect(historical).toHaveCount(1); await historical.locator('summary').press('Enter');
        const result = historical.locator('[data-learning-quiz-result="attempt"]'); await expect(result).toHaveAttribute('lang', 'en'); await expect(result.getByRole('heading', { level: 4 }).first()).toHaveAttribute('lang', 'fr');
        await captureRelease(page, 'P19-02', 'en-390-paid-french-quiz-history', result);
      }
    }
    const dashboard = await (await context.request.get('/api/v1/me/learning?locale=en')).json() as LearningDashboard; expect(dashboard.enrollments).toHaveLength(1); expect(dashboard.enrollments[0].id).toBe(enrollment.summary.id);
    const originalMethod = await methodRecord(context.request, method.id); expect(originalMethod.value.locale).toBe('fr'); expect(originalMethod.value.text === method.text).toBe(true);
    expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(entry => !entry.includes(value)), marker)).toBe(true);
    evidenceJson('P19-02.json', { scenarioId: 'P19-02', provider: 'CONTROLLED_LOCAL_STRIPE_TRANSPORT_NOT_EXTERNAL', amountMinor: 100, currency: 'EUR', manualTestGrants: 0, orderLineGrants: 1, includedLocales: ['fr', 'en'], sameEnrollment: true, frenchNoteUnchanged: true, frenchQuizHistoryRetained: true, originalPersonalMethodPreserved: true, privateDownloads, videoPositions: 'Not repeated: distinct real local clip/media progress proof remains P16; no course video was invented.' });
  });

  test('P19-03 private project conflict and real outage retain input; archived source keeps the personal method', async ({ page, context }) => {
    await loginMethodAccount(context.request, payment.owner); const t = getProjectsDictionary('fr'), source = courseRecord(fixture.course, 'activity-m04', 'fr').value;
    const created = await context.request.post('/api/v1/me/projects', { headers: await commerceHeaders(context.request, payment.owner.id), data: { creationId: randomUUID(), activityId: source.resourceId, activityVersionId: source.versionId, revisionId: source.publishedRevisionId, sourceLocale: 'fr', enrollmentId: enrollment.summary.id, fields: projectFields('fr', `P19 projet ${randomUUID()}`), stage: 'DRAFT' } });
    expect(created.status()).toBe(201); project = await created.json() as ProjectView;
    await page.goto(projectsPath('fr', project.id)); await expect(page.getByRole('textbox', { name: t.objective, exact: true })).toBeEnabled();
    const second = await context.newPage();
    try {
      await second.goto(projectsPath('fr', project.id)); const local = `P19 deuxième saisie conservée ${randomUUID()}`;
      await second.getByRole('textbox', { name: t.objective, exact: true }).fill(local);
      await page.getByRole('textbox', { name: t.objective, exact: true }).fill('P19 première saisie confirmée'); await saveReleaseProject(page);
      const rejected = second.waitForResponse(value => value.request().method() === 'PATCH' && new URL(value.url()).pathname === `/api/v1/me/projects/${project.id}`);
      await pressEnabled(second.locator('[data-project-save-state] button[type="submit"]')); expect((await rejected).status()).toBe(412);
      const comparison = second.getByRole('heading', { name: t.conflictTitle, exact: true }).locator('..');
      await expect(comparison.getByRole('heading', { name: t.local, exact: true }).locator('..').locator('pre')).toContainText(local);
      await expect(comparison.getByRole('heading', { name: t.server, exact: true }).locator('..').locator('pre')).toContainText('P19 première saisie confirmée');
      await captureRelease(second, 'P19-03', 'fr-390-project-conflict', second.getByRole('heading', { name: t.conflictTitle, exact: true }));
      await pressEnabled(second.getByRole('button', { name: t.keepLocal, exact: true })); await confirmReleaseDialog(second, t.keepLocal, t.keepLocal, t.cancel);
      let stopped = false;
      try { await controlApi('stop-api'); stopped = true; await pressEnabled(second.locator('[data-project-save-state] button[type="submit"]')); await expect(second.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'error'); await expect(second.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue(local); }
      finally { if (stopped) await controlApi('start-api'); }
      project = await saveReleaseProject(second); expect(project.fields.objective === local).toBe(true);
      const marker = `P19 backup local ${randomUUID()}`; await second.getByRole('textbox', { name: t.nextStep, exact: true }).fill(marker);
      const downloadEvent = second.waitForEvent('download'); await pressEnabled(second.getByRole('button', { name: 'Exporter ma saisie en Markdown (.md)', exact: true })); const download = await downloadEvent, bytes = await downloadBytes(download);
      expect(download.suggestedFilename()).toBe('project-fr.md'); expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes(marker)).toBe(true);
      await expect(second.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'modified'); expect((await projectRecord(context.request, project.id)).fields.nextStep === marker).toBe(false); project = await saveReleaseProject(second);
      evidenceJson('P19-03-backup.json', { scenarioId: 'P19-03', actualUiDownload: true, sha256: sha256(bytes), bytes: bytes.length, includedCurrentUnsavedInput: true, exportDidNotImplicitlySave: true });
    } finally { await second.close(); }
    const origin = await currentContent(editor, courseRecord(fixture.course, 'method-client-proposal', 'fr').value.id); await contentAction(editor, origin, 'archive', { reason: 'P19 isolated withdrawal checks retained personal copy; no shared publication' });
    await page.goto(methodsPath('en', method.id)); const m = getMethodsDictionary('en'); await expect(page.getByRole('textbox', { name: m.output, exact: true })).toHaveValue(method.text);
    const sourceUpdate = await context.request.get(`/api/v1/me/methods/${method.id}/source-update`); expect(sourceUpdate.status()).toBe(200); expect((await sourceUpdate.json() as { status: string }).status).toBe('UNAVAILABLE');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']); await pressEnabled(page.getByRole('button', { name: m.copyLocal, exact: true })); await expect(page.getByText(m.localCopied, { exact: true })).toBeVisible();
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { text: string; notes: string; locale: string };
    expect(copied.text === method.text && copied.notes === method.notes && copied.locale === 'fr').toBe(true);
    const current = await methodRecord(context.request, method.id); expect(current.value.text === method.text && current.value.notes === method.notes).toBe(true); expect(current.value.origin).toEqual(method.origin);
    evidenceJson('P19-03.json', { scenarioId: 'P19-03', conflictStatus: 412, localAndServerCompared: true, explicitRebase: true, realApiStopAndRestart: true, recoveredSaveConfirmed: true, archivedMethodSource: true, originalTextNotesAndOriginRetained: true, actualClipboardCopy: true });
  });

  test('P19-04 account purchase, contextual help, declared provenance and owner/permission refusals', async ({ page, context, browser }) => {
    await loginMethodAccount(context.request, payment.owner); const fr = getProjectsDictionary('fr'), t = getAccountDictionary('en');
    await page.goto(projectsPath('fr', project.id));
    const form = page.locator('[data-project-save-state]'), ready = form.getByRole('button', { name: fr.ready, exact: true }); await expect(ready).toBeEnabled();
    const readyReply = page.waitForResponse(value => value.request().method() === 'PATCH' && new URL(value.url()).pathname === `/api/v1/me/projects/${project.id}`); await ready.press('Enter'); expect((await readyReply).status()).toBe(200); await expect(form).toHaveAttribute('data-project-save-state', 'saved'); project = await projectRecord(context.request, project.id);
    await page.getByRole('tab', { name: fr.check, exact: true }).press('Enter'); const assessment = page.locator('[data-project-assessment-state]');
    for (const criterion of project.rubric.criteria) await assessment.getByRole('checkbox', { name: criterion.label, exact: true }).check();
    const submitted = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/self-assessments'));
    await pressEnabled(assessment.getByRole('button', { name: fr.submitAssessment, exact: true })); const assessmentReply = await submitted; expect(assessmentReply.status()).toBe(201); const declared = await assessmentReply.json() as SelfAssessmentView;
    expect(declared.projectRevisionId).toBe(project.currentRevisionId); expect(declared.scorePoints).toBe(20);
    await nameProfile(context.request, payment.owner.id, 'P19 · identité déclarée de recette');
    await page.goto(accountPath('en')); await expect(page.getByRole('heading', { level: 1, name: t.title, exact: true })).toBeVisible();
    await page.goto(ordersPath('en', payment.order.value.id)); await expect(page.locator('[data-order-id]')).toHaveAttribute('data-order-id', payment.order.value.id);
    const order = await paymentOrder(context.request, payment.order.value.id); expect(order.paymentStatus).toBe('PAID'); expect(order.fulfillmentStatus).toBe('READY'); expect(order.snapshot).toEqual(payment.order.value.snapshot); expect(order.acceptedTermsVersion).toBe('p19-controlled-v1');
    await page.goto(attestationsHref('en', { enrollmentId: enrollment.summary.id })); await pressEnabled(page.getByRole('button', { name: t.checkEligibility, exact: true }));
    await expect(page.locator('[data-attestation-eligibility]')).toBeVisible(); await pressEnabled(page.getByRole('button', { name: t.issue, exact: true }));
    const issued = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith(`/enrollments/${enrollment.summary.id}/attestations`));
    await confirmReleaseDialog(page, t.issue, t.issue, t.cancel); const issuedReply = await issued; expect(issuedReply.status()).toBe(201); const attestation = await issuedReply.json() as AttestationView;
    expect(attestation.evidence.humanReview).toBe(false); expect(attestation.evidence.identityVerified).toBe(false); expect(attestation.evidence.enrolledLocale).toBe('fr');
    expect(attestation.evidence.quizzes.some(value => value.attemptId === attempt.id && value.locale === 'fr')).toBe(true);
    expect(attestation.evidence.selfAssessments.some(value => value.assessmentId === declared.id && value.projectRevisionId === project.currentRevisionId && value.declaredByUser)).toBe(true);
    await page.goto(attestationsPath('en', attestation.summary.id)); await expect(page.getByText(t.noHumanReview, { exact: true })).toBeVisible();
    await captureRelease(page, 'P19-04', 'en-390-participation-provenance', page.getByText(t.selfAssessmentEvidence, { exact: true }));
    const downloadEvent = page.waitForEvent('download'); await pressEnabled(page.getByRole('button', { name: t.downloadAttestation, exact: true })); const bytes = await downloadBytes(await downloadEvent); expect(sha256(bytes)).toBe(attestation.summary.document.sha256); expect(bytes.length).toBe(attestation.summary.document.sizeBytes);
    await page.goto(helpHref('en', { orderId: order.id, projectId: project.id, enrollmentId: enrollment.summary.id, contextLocale: 'fr' })); const support = page.locator('[data-support-create]');
    await expect(support.getByRole('checkbox', { name: t.includeContext, exact: true })).not.toBeChecked(); await support.getByRole('checkbox', { name: t.includeContext, exact: true }).check();
    await support.getByRole('textbox', { name: t.subject, exact: true }).fill('P19 controlled contextual request'); await support.getByRole('textbox', { name: t.message, exact: true }).fill('Synthetic request chosen explicitly; no personal notes attached.');
    const submittedTicket = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v1/me/support-tickets'); await pressEnabled(support.getByRole('button', { name: t.sendRequest, exact: true })); const response = await submittedTicket; expect(response.status()).toBe(201); const ticket = await response.json() as SupportTicketView;
    expect(ticket.context?.locale).toBe('fr'); expect(ticket.context?.orderId).toBe(order.id); expect(ticket.context?.projectId).toBe(project.id);
    await page.goto(helpPath('en', ticket.id)); await expect(page.locator(`[data-support-ticket="${ticket.id}"]`)).toBeVisible(); await captureRelease(page, 'P19-04', 'en-390-contextual-support');
    const other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const stranger = await methodLearner(other.request, 'en'); await loginMethodAccount(other.request, stranger);
      for (const path of [`/me/orders/${order.id}`, `/me/methods/${method.id}`, `/me/projects/${project.id}`, `/me/activity-notes/${note.id}`, `/me/attestations/${attestation.summary.id}`, `/me/support-tickets/${ticket.id}`]) expect((await other.request.get(`/api/v1${path}`)).status()).toBe(404);
      expect((await other.request.patch(`/api/v1/me/projects/${project.id}`, { headers: await accountHeaders(other.request, stranger.id, projectEtag(project)), data: { fields: project.fields, stage: project.stage } })).status()).toBe(404);
    } finally { await other.close(); }
    expect((await editor.get('/api/v1/admin/orders')).status()).toBe(403); expect((await editor.get(`/api/v1/admin/orders/${order.id}`)).status()).toBe(403);
    expect((await context.request.get(`/api/v1/me/projects/${project.id}`)).status()).toBe(200);
    evidenceJson('P19-04.json', { scenarioId: 'P19-04', orderSnapshotPreserved: true, participationDocumentActualDownload: { bytes: bytes.length, sha256: sha256(bytes) }, automaticQuizFrenchSnapshot: true, currentRevisionSelfAssessmentDeclaredOnly: true, humanReview: false, identityVerified: false, explicitContextFrenchUnderEnglishUi: true, otherOwnerRead404: 6, otherOwnerMutation404: true, editorFinance403: 2, ownerWorkStillAccessible: true, noCommercialReceiptOrHumanSupportClaim: true });
  });
});
