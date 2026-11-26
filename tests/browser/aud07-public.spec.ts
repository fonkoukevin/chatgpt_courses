import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { arch, cpus, freemem, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import type { QuizCheckResult } from '../../apps/web/src/lib/api/generated/types.gen';
import { authPath } from '../../apps/web/src/lib/auth/routes';
import { publicCatalogueHref, resourceHref } from '../../apps/web/src/lib/public/routes';
import { getAssetsDictionary } from '../../apps/web/src/lib/i18n/assets';
import { getAuthDictionary } from '../../apps/web/src/lib/i18n/auth';
import { getCourseDictionary } from '../../apps/web/src/lib/i18n/course';
import { getExportsDictionary } from '../../apps/web/src/lib/i18n/exports';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getPracticeDraftDictionary } from '../../apps/web/src/lib/i18n/practice-draft';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { practiceMarkdown } from '../../apps/web/src/lib/files/markdown-export';
import { approveCourseShowcaseFixture, courseLessonHref, courseRecord, downloadBytes, prepareCourseFixture, preparedFile,
  publishCourseFixture, sha256, type CourseFixture, type CourseLocale } from './course-content-fixture';
import { commerceSql } from './commerce-fixture';
import { assertNoHorizontalOverflow, assertPageStructure, checkDialogKeyboard, enlargeText200, expectVisibleFocus,
  measuredPage, observeColdPage, settleRenderedPage } from './performance-fixture';

const viewports = [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 768, height: 1000 }, { width: 1440, height: 1000 }];
const captures: string[] = [], observations: Array<Record<string, unknown>> = [], outcomes: Array<Record<string, unknown>> = [];
const measurements: Array<Record<string, unknown>> = [], downloads: Array<Record<string, unknown>> = [];
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, '\n');

async function capture(page: Page, name: string, fullPage = false, preserveFocus = false) {
  if (!preserveFocus) { await page.getByRole('main').focus(); await page.evaluate(() => scrollTo(0, 0)); }
  await settleRenderedPage(page); await assertNoHorizontalOverflow(page);
  const file = name + '.png'; await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, file), fullPage, animations: 'disabled' }); captures.push(file);
}

async function metadata(page: Page, locale: CourseLocale, expectedTitle?: string) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  if (expectedTitle) await expect.poll(() => page.title()).toContain(expectedTitle);
  else await expect(page).toHaveTitle(/\S/);
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', /\S/);
  await assertPageStructure(page);
}

async function openSheet(page: Page, trigger: Locator, title: string, screenshotName?: string) {
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true }); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  if (screenshotName) await capture(page, screenshotName, false, true);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expectVisibleFocus(trigger);
}

async function requiredError(control: Locator) {
  await expect(control).toHaveAttribute('aria-invalid', 'true'); await expect(control).toBeFocused(); await expectVisibleFocus(control);
  expect(await control.evaluate(node => (node.getAttribute('aria-describedby') ?? '').split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim()))).toBe(true);
}

function forbiddenProspectCopy(text: string) {
  // Authored fictional case content is intentional; technical Pxx/AUD fixtures must not enter the showcase.
  expect(text).not.toMatch(/\b(?:P0[1-9]|P1[0-9]|P2[0-3]|AUD0[1-7]|AUD-0[1-7])\s*[·:—-]/i);
  expect(text).not.toMatch(/offre fictive de recette|fictional verification offer|synthetic fixture/i);
}

test.describe('AUD07 real public course, responsive keyboard recipe and local laboratory measurements', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture, browserVersion = '', initialFinancial = '', initialQuizAttempts = '';
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); browserVersion = browser.version();
    fixture = await prepareCourseFixture(editor); await publishCourseFixture(editor, fixture); await approveCourseShowcaseFixture(editor, fixture);
    initialFinancial = commerceSql('SELECT (SELECT count(*) FROM orders)||\'|\'||(SELECT count(*) FROM checkout_operations)||\'|\'||(SELECT count(*) FROM access_grants);');
    initialQuizAttempts = commerceSql('SELECT count(*) FROM learning_quiz_attempts;');
  });
  test.afterEach(async ({}, info) => { outcomes.push({ name: info.title, status: info.status, expectedStatus: info.expectedStatus, retry: info.retry }); });
  test.afterAll(async () => {
    const financialUnchanged = initialFinancial !== '' && commerceSql('SELECT (SELECT count(*) FROM orders)||\'|\'||(SELECT count(*) FROM checkout_operations)||\'|\'||(SELECT count(*) FROM access_grants);') === initialFinancial;
    const durableQuizAttemptsUnchanged = initialQuizAttempts !== '' && commerceSql('SELECT count(*) FROM learning_quiz_attempts;') === initialQuizAttempts;
    await editor?.dispose();
    const processor = cpus();
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud07-public-checks.json'), JSON.stringify({
      schemaVersion: 1, audit: 'AUD-07', browser: 'chromium', browserVersion, headless: true,
      environment: { platform: platform(), release: release(), architecture: arch(), cpuModel: processor[0]?.model, logicalProcessors: processor.length,
        totalMemoryBytes: totalmem(), freeMemoryBytesAtReport: freemem(), nodeVersion: process.version },
      protocol: { viewports, network: 'unthrottled HTTP loopback', cpuRate: 1, browserCacheDisabled: true, browserCacheClearedBeforeMeasuredDocuments: true,
        serviceWorkersBypassed: true, samplesPerDocumentAndViewport: 1,
        serverCache: 'Running API/Next production servers; fixture preparation and earlier test cases warm the backend. Not a cold-server benchmark.',
        performanceScope: 'Local laboratory readiness snapshots; LCP and layout shifts measured at readiness, not field Core Web Vitals or INP. No score or measured improvement is claimed.',
        transportScope: 'CDP transport counters accumulate within each viewport test; navigation/resource/paint fields belong to each measured document.',
        accessibilityScope: 'Targeted keyboard/focus/reflow checks and separate root-font scaling; no native browser zoom or accessibility certification.',
        privacy: 'No form text, identities, cookies, headers or private response bodies are written into laboratory measurements.' },
      fixture: 'Authored P18 FR/EN course, technically published/selected only in supervisor-owned disposable PostgreSQL/S3.',
      humanEditorialApproval: false, sharedContentChanged: false, externalProviderRequests: false, orderOrCheckoutRequested: false, deployed: false,
      financialUnchanged, durableQuizAttemptsUnchanged, outcomes, observations, measurements, downloads, captures,
    }, null, 2) + '\n', { flag: 'wx' });
    expect(financialUnchanged).toBe(true); expect(durableQuizAttemptsUnchanged).toBe(true);
  });

  for (const locale of ['fr', 'en'] as const) for (const viewport of viewports) {
    test(`${locale} ${viewport.width}x${viewport.height}: public course, keyboard navigation, filters and anonymous trial`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const observation = await observeColdPage(page), errors: string[] = [];
      page.on('pageerror', () => errors.push('UNCAUGHT_PAGE_ERROR'));
      const t = getPublicDictionary(locale), common = getShowcaseDictionary(locale).common;
      const course = courseRecord(fixture, 'course-client-proposal', locale).value, activity = courseRecord(fixture, 'activity-m01', locale).value;
      const courseHref = resourceHref({ locale, kind: 'COURSE', slug: course.slug, resourceId: course.resourceId, versionId: course.versionId });
      async function measure(kind: string, href: string, ready: () => Promise<void>) {
        await observation.session.send('Network.clearBrowserCache');
        const start = performance.now(), response = await page.goto(href); expect(response?.status()).toBe(200); await ready(); await metadata(page, locale, kind === 'course' ? course.title : kind === 'trial' ? activity.title : undefined);
        const sample = await measuredPage(page, observation, performance.now() - start);
        expect(sample.largestContentfulPaintAtReadinessMs).not.toBeNull(); expect(sample.layoutShiftAtReadiness).not.toBeNull(); expect(sample.externalResourceCount).toBe(0);
        measurements.push({ locale, viewport, page: kind, ...sample });
      }
      try {
        await measure('home', `/${locale}`, async () => { await expect(page.locator('[data-home-single-course]')).toBeVisible(); });
        await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
        await expect(page.locator('[data-home-primary]').first()).toBeVisible();
        expect((await page.locator('[data-home-primary]').first().getAttribute('href'))!).toContain(activity.versionId);
        forbiddenProspectCopy(await page.getByRole('main').innerText()); await capture(page, `${locale}-${viewport.width}-home`, viewport.width === 320);
        if (viewport.width < 1024) await openSheet(page, page.getByRole('button', { name: common.openMenu, exact: true }), t.navigation,
          viewport.width === 390 ? `${locale}-390-mobile-menu-open` : undefined);
        else { const nav = page.getByRole('navigation', { name: t.navigation, exact: true }); await expect(nav).toBeVisible(); await nav.getByRole('link').first().focus(); await expectVisibleFocus(nav.getByRole('link').first()); }
        if (viewport.width === 390) {
          const other = locale === 'fr' ? 'en' : 'fr';
          await page.locator(`[data-language-switch="${other}"]`).first().press('Enter'); await expect(page.locator('html')).toHaveAttribute('lang', other);
          await page.locator(`[data-language-switch="${locale}"]`).first().press('Enter'); await expect(page.locator('html')).toHaveAttribute('lang', locale);
          await expect(page.locator('[data-home-single-course]')).toBeVisible();
        }

        await measure('catalogue', publicCatalogueHref(locale), async () => { await expect(page.getByRole('heading', { level: 1, name: t.catalogue, exact: true })).toBeVisible(); });
        const search = page.getByRole('searchbox', { name: t.search, exact: true }); await search.focus(); await expectVisibleFocus(search); await search.fill('ChatGPT'); await page.keyboard.press('Enter');
        await expect(page).toHaveURL(url => url.pathname === publicCatalogueHref(locale) && url.searchParams.get('q') === 'ChatGPT');
        await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible();
        const filters = page.getByRole('button', { name: new RegExp('^' + t.filters + '(?: \\(\\d+\\))?$') });
        let form: Locator;
        if (viewport.width < 1024) {
          await openSheet(page, filters, t.filters, viewport.width === 390 ? `${locale}-390-catalogue-filters-open` : undefined);
          await filters.press('Enter'); form = page.getByRole('dialog', { name: t.filters, exact: true }); await expect(form).toBeVisible();
        } else form = page.getByRole('main').locator('aside');
        await form.getByRole('combobox', { name: t.type, exact: true }).selectOption('COURSE'); await form.getByRole('button', { name: t.apply, exact: true }).press('Enter');
        await expect(page).toHaveURL(url => url.searchParams.get('q') === 'ChatGPT' && url.searchParams.get('type') === 'COURSE');
        await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible(); await assertNoHorizontalOverflow(page);
        await page.getByRole('link', { name: course.title, exact: true }).press('Enter');
        await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(new URL(courseHref, process.env.COURSES_BROWSER_ORIGIN).pathname);
        await measure('course', page.url(), async () => { await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible(); });
        forbiddenProspectCopy(await page.getByRole('main').innerText());
        const faq = course.metadata.faq[0]; expect(faq).toBeDefined(); const question = page.getByRole('button', { name: faq.question, exact: true });
        await question.focus(); await expectVisibleFocus(question); await page.keyboard.press('Enter'); await expect(question).toHaveAttribute('aria-expanded', 'true'); await expect(page.getByText(faq.answer, { exact: true })).toBeVisible();
        await page.keyboard.press('Enter'); await expect(question).toHaveAttribute('aria-expanded', 'false');
        const details = page.locator('summary').filter({ hasText: getCourseDictionary(locale).versionDetails });
        await details.focus(); await page.keyboard.press('Enter'); await expect(details.locator('..')).toHaveAttribute('open', ''); await page.keyboard.press('Enter'); await expect(details.locator('..')).not.toHaveAttribute('open', '');
        await capture(page, `${locale}-${viewport.width}-course`, viewport.width === 320);
        const trial = page.locator('[data-course-trial]'); await trial.focus(); await expectVisibleFocus(trial); await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible();
        const entered = new URL(page.url()); expect(entered.searchParams.get('resource')).toBe(activity.resourceId); expect(entered.searchParams.get('version')).toBe(activity.versionId);
        await measure('trial', courseLessonHref(fixture, 'm01', locale), async () => { await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible(); });
        await expect(page.locator('[data-workshop-moment]')).toHaveCount(4);
        for (const moment of ['understand', 'produce', 'verify', 'reuse']) {
          const anchor = page.locator(`[data-workshop-navigation] a[href="#activity-${moment}"]`); await anchor.focus(); await expectVisibleFocus(anchor); await page.keyboard.press('Enter');
          await expect(page.locator(`#activity-${moment}`)).toBeInViewport();
        }
        const draft = page.locator('[data-activity-practice-draft]'); await expect(draft.getByRole('textbox', { name: getPracticeDraftDictionary(locale).response, exact: true })).toBeEditable();
        await expect(draft.getByRole('textbox', { name: getPracticeDraftDictionary(locale).response, exact: true })).toHaveValue('');
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
        await capture(page, `${locale}-${viewport.width}-trial`, viewport.width === 320);
        expect(errors).toEqual([]);
        observations.push({ check: 'public-viewport-journey', locale, viewport, htmlLanguage: true, metadataPresent: true, skipLinkKeyboard: true,
          navigationKeyboard: true, filterSearchAndTypeApplied: true, faqAndVersionDetailsKeyboard: true, trialPinnedIds: true, fourWorkshopStagesKeyboard: true,
          languageSwitchKeyboard: viewport.width === 390, anonymousTrial: true, noTechnicalFixtureCopyInHomeOrCourse: true, uncaughtPageErrors: errors.length });
      } finally { await observation.session.detach(); }
    });
  }

  for (const locale of ['fr', 'en'] as const) test(`${locale}: anonymous trial downloads exact authored sources, copies, exports and checks understanding`, async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(courseLessonHref(fixture, 'm01', locale)); const source = courseRecord(fixture, 'activity-m01', locale).value;
    await expect(page.getByRole('heading', { level: 1, name: source.title, exact: true })).toBeVisible();
    for (const key of ['br01-tr01', 'scoping-table']) {
      const prepared = preparedFile(fixture, key, locale), button = page.locator(`[data-asset-access="${prepared.assetId}"]`).getByRole('button', { name: getAssetsDictionary(locale).download, exact: true });
      await expect(button).toBeEnabled(); const pending = page.waitForEvent('download'); await button.press('Enter'); const downloaded = await pending, bytes = await downloadBytes(downloaded);
      expect(downloaded.suggestedFilename()).toBe(basename(prepared.path)); expect(bytes.equals(prepared.bytes)).toBe(true); expect(sha256(bytes)).toBe(prepared.sha256);
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      downloads.push({ kind: 'authored-resource', key, locale, filename: downloaded.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes), exactAuthoredBytes: true, actualUiDownload: true });
    }
    const t = getPracticeDraftDictionary(locale), draft = page.locator('[data-activity-practice-draft]'), text = draft.getByRole('textbox', { name: t.response, exact: true });
    const marker = locale === 'fr' ? 'Essai fictif AUD07 : faits fournis.\nQuestions à confirmer, sans engagement inventé.' : 'Fictional AUD07 practice: supplied facts.\nQuestions to confirm, without invented commitments.';
    await expect(text).toHaveValue(''); await text.fill(marker); await draft.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(draft).toContainText(source.document!.exercise!.instructions);
    await draft.getByRole('button', { name: t.copy, exact: true }).press('Enter'); await expect(draft.getByText(t.copied, { exact: true })).toBeVisible();
    expect(normalizeNewlines(await page.evaluate(() => navigator.clipboard.readText()))).toBe(normalizeNewlines(marker));
    const pending = page.waitForEvent('download'); await draft.getByRole('button', { name: getExportsDictionary(locale).action, exact: true }).press('Enter');
    const exported = await pending, bytes = await downloadBytes(exported); expect(exported.suggestedFilename()).toBe(`practice-${locale}.md`);
    const exportText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    expect(normalizeNewlines(exportText)).toBe(normalizeNewlines(practiceMarkdown({ title: source.title, versionNumber: source.versionNumber, locale, text: marker })));
    downloads.push({ kind: 'local-practice-export', locale, filename: exported.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes), actualUiDownload: true, includesExactCurrentInputAndSource: true });
    for (const moment of ['understand', 'produce', 'verify', 'reuse']) { await page.locator(`[data-workshop-navigation] a[href="#activity-${moment}"]`).press('Enter'); await expect(text).toHaveValue(marker); }
    expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(stored => !String(stored).includes(value)), marker)).toBe(true);
    const learning = getLearningDictionary(locale); await page.getByRole('button', { name: learning.checkQuiz, exact: true }).press('Enter');
    await expect(page.getByText(learning.answerRequired, { exact: true })).toBeVisible(); await expect(page.getByRole('radio').first()).toBeFocused();
    for (const question of source.document!.quiz) await page.getByRole('radio', { name: question.options[question.correctOption], exact: true }).click();
    const checked = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/quiz-checks'));
    await page.getByRole('button', { name: learning.checkQuiz, exact: true }).press('Enter'); const response = await checked; expect(response.status()).toBe(200);
    const result = await response.json() as QuizCheckResult; expect(result.passed).toBe(true); expect('id' in result).toBe(false);
    const feedback = page.locator('[data-learning-quiz-result="formative"]'); await expect(feedback).toBeVisible();
    for (const question of source.document!.quiz) await expect(feedback).toContainText(question.explanation);
    await expect(text).toHaveValue(marker); expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    observations.push({ check: 'complete-anonymous-first-trial', locale, exactSourceDownloads: 2, realClipboardContentCompared: true, windowsNewlinesNormalizedOnly: true,
      exactMarkdownExport: true, allFourStagesKeepWriting: true, noBrowserPersistenceOfInput: true, quizRequiredErrorAndFocus: true, formativeQuizServerResponse: true, noDurableAttemptCreated: true });
    await text.fill('');
  });

  for (const locale of ['fr', 'en'] as const) test(`${locale}: public form errors and separate 200-percent root-font reflow`, async ({ page }) => {
    const t = getAuthDictionary(locale); await page.setViewportSize({ width: 320, height: 844 });
    let authMutations = 0; page.on('request', request => { if (request.method() === 'POST' && /\/api\/v1\/auth\/(?:register|login|password-reset)/.test(new URL(request.url()).pathname)) authMutations++; });
    await page.goto(authPath(locale, 'sign-up')); await expect(page.getByRole('heading', { level: 1, name: t.signUp, exact: true })).toBeVisible();
    await page.getByRole('button', { name: t.signUp, exact: true }).press('Enter'); const email = page.getByRole('textbox', { name: t.email, exact: true }); await requiredError(email);
    await email.fill('invalid-address'); await page.getByRole('button', { name: t.signUp, exact: true }).press('Enter'); await requiredError(email); await expect(page.getByText(t.emailInvalid, { exact: true })).toBeVisible();
    const password = page.locator('input[name="password"]'); await expect(password).toHaveAccessibleName(t.newPassword);
    await email.fill('aud07-form@example.invalid'); await password.fill('short'); await page.getByRole('button', { name: t.signUp, exact: true }).press('Enter');
    await requiredError(password); await expect(page.getByText(t.passwordInvalid, { exact: true })).toBeVisible();
    await capture(page, `${locale}-320-registration-errors`, true);
    await password.fill(''); await email.fill('');
    await page.goto(authPath(locale, 'sign-in')); await expect(page.getByRole('heading', { level: 1, name: t.signIn, exact: true })).toBeVisible();
    await page.getByRole('button', { name: t.signIn, exact: true }).press('Enter'); await requiredError(page.getByRole('textbox', { name: t.email, exact: true }));
    await assertPageStructure(page); await assertNoHorizontalOverflow(page); expect(authMutations).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(publicCatalogueHref(locale));
    const search = page.getByRole('searchbox', { name: getPublicDictionary(locale).search, exact: true }); await expect(search).toBeVisible();
    const scaled = await enlargeText200(page, search); await assertPageStructure(page); await assertNoHorizontalOverflow(page);
    await checkDialogKeyboard(page, page.getByRole('button', { name: new RegExp('^' + getPublicDictionary(locale).filters + '(?: \\(\\d+\\))?$') }), getPublicDictionary(locale).filters);
    await capture(page, `${locale}-390-catalogue-root-font-200-percent`, true);
    observations.push({ check: 'forms-and-root-font-reflow', locale, formsViewport: { width: 320, height: 844 }, clientValidationPreventsRequests: true,
      invalidEmailAndPasswordDescribedAndFocused: true, signInEmptyEmailFocused: true, rootFontViewport: { width: 390, height: 844 }, textScaling: scaled, nativeBrowserZoomTested: false });
  });
});
