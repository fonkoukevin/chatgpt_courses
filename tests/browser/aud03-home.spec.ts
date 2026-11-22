import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CataloguePage, ResourceDetail } from '../../apps/web/src/lib/api/generated/types.gen';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { resourceHref } from '../../apps/web/src/lib/public/routes';
import { approveCourseShowcaseFixture, courseRecord, prepareCourseFixture, publishCourseFixture, type CourseFixture, type CourseLocale } from './course-content-fixture';

const stage = process.env.COURSES_AUD03_STAGE ?? 'after';
if (!['before', 'after'].includes(stage)) throw new Error('AUD03 capture stage must be before or after.');
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const observations: Array<Record<string, unknown>> = [];
const captures: string[] = [];

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function screenshot(page: Page, name: string, fullPage = false) {
  const filename = `${stage}-${name}.png`;
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, filename), fullPage, animations: 'disabled' });
  captures.push(filename);
}
async function captureHome(page: Page, locale: CourseLocale, populated: boolean) {
  const state = populated ? 'single-course' : 'empty';
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    if (!populated) {
      await expect(page.getByRole('main').locator('a[href*="activity="]')).toHaveCount(0);
      await expect(page.getByRole('main').locator('input[type="search"]')).toHaveCount(0);
    }
    await noOverflow(page);
    await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await screenshot(page, `${state}-${locale}-${viewport.width}`);
    if (populated) await screenshot(page, `${state}-${locale}-${viewport.width}-full`, true);
    if (viewport.width < 1024) {
      const trigger = page.getByRole('button', { name: getShowcaseDictionary(locale).common.openMenu, exact: true });
      await trigger.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: getPublicDictionary(locale).navigation, exact: true });
      await expect(dialog).toBeVisible();
      expect(await dialog.getByRole('link').count()).toBeGreaterThan(0);
      await noOverflow(page);
      await screenshot(page, `${state}-${locale}-${viewport.width}-navigation`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    }
    observations.push({ stage, state, locale, ...viewport, keyboardSkipLink: true, noOverflow: true, mobileMenuKeyboard: viewport.width < 1024 });
  }
}

test.describe('AUD03 home and navigation before/after on the real isolated course', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture, browserVersion = '';
  const destinations: Array<Record<string, unknown>> = [];
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    browserVersion = browser.version();
  });
  test.afterAll(async () => {
    await editor?.dispose();
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud03-home-checks.json'), JSON.stringify({
      schemaVersion: 1, stage, browser: 'chromium', browserVersion, headless: true,
      beforeStageIsCaptureBaselineOnly: stage === 'before', finalCtaAssertionsApplied: stage === 'after',
      fixtures: 'Prepared P18 course, technically published and explicitly selected only in owned PostgreSQL/S3 tmpfs.',
      humanEditorialApproval: false, sharedContentChanged: false, financialOperationsExecuted: false, deployed: false,
      observations, destinations, captures,
    }, null, 2) + '\n', { flag: 'wx' });
  });

  test('empty FR/EN showcase remains honest and navigation is usable on desktop and mobile', async ({ page }) => {
    for (const locale of ['fr', 'en'] as const) {
      const catalogue = await page.request.get(`/api/v1/catalog?locale=${locale}`);
      expect(catalogue.status()).toBe(200); expect((await catalogue.json() as CataloguePage).total).toBe(0);
      await captureHome(page, locale, false);
    }
  });

  test('one real selected course supplies home, navigation and anonymous trial destinations', async ({ page }) => {
    fixture = await prepareCourseFixture(editor);
    await publishCourseFixture(editor, fixture);
    await approveCourseShowcaseFixture(editor, fixture);
    for (const locale of ['fr', 'en'] as const) {
      const course = courseRecord(fixture, 'course-client-proposal', locale).value;
      const free = courseRecord(fixture, 'activity-m01', locale).value;
      const catalogue = await page.request.get(`/api/v1/catalog?locale=${locale}&type=COURSE&pageSize=100`);
      expect(catalogue.status()).toBe(200);
      const courses = await catalogue.json() as CataloguePage;
      expect(courses.total).toBe(1); expect(courses.items[0].resourceId).toBe(course.resourceId);
      expect(courses.items[0].versionId).toBe(course.versionId);
      const courseResponse = await page.request.get(`/api/v1/catalog/resources/${course.resourceId}/versions/${course.versionId}?locale=${locale}`);
      expect(courseResponse.status()).toBe(200);
      const detail = await courseResponse.json() as ResourceDetail;
      const included = detail.curriculum.flatMap(module => module.children);
      expect(included.some(activity => activity.resourceId === free.resourceId && activity.versionId === free.versionId && activity.access === 'FREE' && activity.availability === 'PUBLISHED')).toBe(true);
      await captureHome(page, locale, true);
      if (stage === 'before') continue;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${locale}`);
      const main = page.getByRole('main');
      await expect(main.locator('[data-home-single-course]')).toBeVisible();
      await expect(main.locator('[data-home-demo]')).toBeVisible();
      await expect(main.locator('input[type="search"]')).toHaveCount(0);
      const trial = main.locator('a[data-home-primary]').first();
      await expect(trial).toBeVisible();
      const trialHref = await trial.getAttribute('href');
      expect(trialHref).toContain(free.resourceId); expect(trialHref).toContain(free.versionId);
      expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
      await trial.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: free.title, exact: true })).toBeVisible();
      expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
      const freeResponse = await page.request.get(`/api/v1/catalog/resources/${free.resourceId}/versions/${free.versionId}?locale=${locale}`);
      expect(freeResponse.status()).toBe(200); expect((await freeResponse.json() as ResourceDetail).document).not.toBeNull();
      await page.goto(`/${locale}`);
      const courseLink = page.getByRole('main').locator('a[data-home-course]').first();
      const expectedCourseHref = resourceHref({ locale, kind: 'COURSE', slug: course.slug, resourceId: course.resourceId, versionId: course.versionId });
      await expect(courseLink).toHaveAttribute('href', expectedCourseHref);
      await courseLink.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible();
      destinations.push({ locale, courseId: course.resourceId, courseVersionId: course.versionId, activityId: free.resourceId, activityVersionId: free.versionId,
        linkedInActualCurriculum: true, trialHref, courseHref: expectedCourseHref, keyboardActivated: true, anonymousTrial: true, actualFreeDocument: true });
    }
    expect(captures).toHaveLength(16);
    if (stage === 'after') expect(destinations).toHaveLength(2);
  });
});
