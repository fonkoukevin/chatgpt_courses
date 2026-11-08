import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ActivityNoteView, LearningActivity, LearningDashboard, ResourceDetail } from '../../apps/web/src/lib/api/generated/types.gen';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { learningEnrollmentPath, learningPath } from '../../apps/web/src/lib/learning/routes';
import { activityDiscoveryHref } from '../../apps/web/src/lib/public/routes';
import { contentAction, currentContent } from './editorial-api';
import { createLearningFixture, enrollLearning, learningActivityHref, learningHeaders, submitLearningQuiz } from './learning-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';

async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}

export function registerLearningHistoryScenario() {
  test('module puis parcours retirés : notes et tentatives retrouvables, historique privé refusé à un autre compte', async ({ page, context, playwright, browser }) => {
    const t = getLearningDictionary('fr');
    const editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const fixture = await createLearningFixture(editor);
      const account = await methodLearner(context.request);
      await loginMethodAccount(context.request, account);
      const enrollment = await enrollLearning(context.request, fixture, account.id);
      const source = fixture.activity.fr.value, enrollmentId = enrollment.summary.id;
      const noteText = `P08 historique personnel conservé ${randomUUID()}`;
      const createdNote = await context.request.post('/api/v1/me/activity-notes', {
        headers: await learningHeaders(context.request, account.id),
        data: { activityId: source.resourceId, activityVersionId: source.versionId, locale: 'fr', text: noteText },
      });
      expect(createdNote.status()).toBe(201);
      const note = await createdNote.json() as ActivityNoteView;
      const attempt = await submitLearningQuiz(context.request, fixture, enrollmentId, account.id);
      expect(attempt.passed).toBe(true);
      const oldActivityHref = learningActivityHref(fixture, 'fr');
      await page.goto(oldActivityHref);
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(noteText);

      // These are real editorial commands against this test's isolated programme.
      // Only the parent chain is withdrawn; the FREE standalone activity remains public.
      for (const kind of ['module', 'course'] as const) {
        const current = await currentContent(editor, fixture[kind].fr.value.id);
        await contentAction(editor, current, 'archive', { reason: `P08 withdraw ${kind}, preserve the learner's historical work` });
        const response = await page.goto(oldActivityHref);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(noteText);
        const history = page.locator('section').filter({ has: page.getByRole('heading', { name: t.attemptHistory, exact: true }) });
        await expect(history.locator('details')).toHaveCount(1);
        await history.locator('summary').click();
        await expect(history.locator('[data-learning-quiz-result="attempt"]')).toContainText(t.result);
        await expect(history.getByText('3 / 3', { exact: true })).toBeVisible();

        const detail = await context.request.get(`/api/v1/me/enrollments/${enrollmentId}/activities/${source.resourceId}?activityVersionId=${source.versionId}&locale=fr`);
        expect(detail.status()).toBe(200);
        const contextual = await detail.json() as LearningActivity;
        expect(contextual.availability).toBe('WITHDRAWN');
        expect(contextual.accessStatus).toBe('UNAVAILABLE');
        expect(contextual.resource.document).toBeNull();
        const unchanged = await context.request.get(`/api/v1/me/activity-notes/${note.id}`);
        expect(unchanged.status()).toBe(200);
        expect((await unchanged.json() as ActivityNoteView).text === noteText).toBe(true);
        if (kind === 'module') {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await capture(page, 'fr-1440-retained-note-after-module-withdrawal');
        }
      }

      const dashboardResponse = await context.request.get('/api/v1/me/learning?locale=fr');
      expect(dashboardResponse.status()).toBe(200);
      const dashboard = await dashboardResponse.json() as LearningDashboard;
      expect(dashboard.resume).toBeNull();
      expect(dashboard.enrollments[0].progress).toEqual({ totalActivities: 3, readActivities: 0, completedActivities: 0, quizPassedActivities: 1, projectAvailability: 'NOT_AVAILABLE' });
      await page.goto(learningPath('fr'));
      await expect(page.getByText(t.noResume, { exact: true })).toBeVisible();
      const retainedHref = learningEnrollmentPath('fr', enrollmentId);
      await expect(page.getByRole('link', { name: t.retainedWork, exact: true })).toHaveAttribute('href', retainedHref);
      await page.getByRole('link', { name: t.retainedWork, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(retainedHref + '$'));
      await expect(page.getByRole('heading', { level: 1, name: t.retainedWork, exact: true })).toBeVisible();
      const retainedLinks = page.getByRole('main').getByRole('link', { name: t.retainedLink, exact: true });
      const expected = [fixture.activity, fixture.next, fixture.premium].map((item) => activityDiscoveryHref('fr', item.fr.value.resourceId, item.fr.value.versionId));
      await expect(retainedLinks).toHaveCount(3);
      expect(await retainedLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(expected);
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, 'fr-390-retained-programme-after-course-withdrawal');

      // E02 is an explicit exact-version route. It does not restore the withdrawn course.
      await retainedLinks.nth(0).click();
      await expect(page).toHaveURL(new RegExp('/fr/catalogue\\?'));
      expect(new URL(page.url()).searchParams.get('activity')).toBe(source.resourceId);
      expect(new URL(page.url()).searchParams.get('version')).toBe(source.versionId);
      await expect(page.getByRole('textbox', { name: t.notes, exact: true })).toHaveValue(noteText);
      await expect(page.getByRole('heading', { name: t.attemptHistory, exact: true })).toBeVisible();
      const standalone = await context.request.get(`/api/v1/catalog/resources/${source.resourceId}/versions/${source.versionId}?locale=fr`);
      expect(standalone.status()).toBe(200);
      const publicActivity = await standalone.json() as ResourceDetail;
      expect(publicActivity.availability).toBe('PUBLISHED');
      expect(publicActivity.document).not.toBeNull();
      expect((await page.content()).includes(fixture.secret)).toBe(false);
      await capture(page, 'fr-390-standalone-retained-notes-and-history');

      const other = await browser.newContext();
      try {
        const b = await methodLearner(other.request);
        await loginMethodAccount(other.request, b);
        const bPage = await other.newPage();
        const denied = await bPage.goto(`${process.env.COURSES_BROWSER_ORIGIN}${retainedHref}`);
        expect(denied?.status()).toBe(404);
        expect((await bPage.content()).includes(noteText)).toBe(false);
        expect((await other.request.get(`/api/v1/me/enrollments/${enrollmentId}?locale=fr`)).status()).toBe(404);
        expect((await other.request.get(`/api/v1/me/activity-notes/${note.id}`)).status()).toBe(404);
        expect((await other.request.get(`/api/v1/me/quiz-attempts/${attempt.id}`)).status()).toBe(404);
      } finally { await other.close(); }
    } finally { await editor.dispose(); }
  });
}
