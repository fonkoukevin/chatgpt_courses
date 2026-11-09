import { performance } from 'node:perf_hooks';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { publicCatalogueHref } from '../../apps/web/src/lib/public/routes';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { loginMethodAccount } from './methods-fixture';
import { qualityLearner, qualitySources } from './quality-fixture';
import { assertNoHorizontalOverflow, assertPageStructure, assertPerformanceBudgets, captureQuality, checkDialogKeyboard, enlargeText200, evaluatePerformanceBudgets,
  expectVisibleFocus, measuredPage, observeColdPage, qualityWidths, settleRenderedPage, writePerformanceEvidence,
  type QualityLocale, type QualityPageKind } from './performance-fixture';

async function pageReady(page: Page, kind: QualityPageKind, locale: QualityLocale) {
  const publicText = getPublicDictionary(locale), projectText = getProjectsDictionary(locale);
  await expect(page.getByRole('heading', { level: 1, name: kind === 'catalogue' ? publicText.catalogue : projectText.editorTitle, exact: true })).toBeVisible();
  if (kind === 'catalogue') await expect(page.getByRole('main').getByRole('status')).toContainText(locale === 'fr' ? 'ressource' : 'resource');
  else await expect(page.getByRole('textbox', { name: projectText.objective, exact: true })).toBeEnabled();
  await settleRenderedPage(page);
}

async function coldMeasurements(browser: Browser, href: string, kind: QualityPageKind, locale: QualityLocale,
  account?: { email: string; password: string }) {
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    try {
      if (account) await loginMethodAccount(context.request, account);
      const page = await context.newPage(), observation = await observeColdPage(page);
      try {
        const start = performance.now();
        const response = await page.goto(href); expect(response?.status()).toBe(200);
        await pageReady(page, kind, locale);
        samples.push({ sample: index + 1, ...await measuredPage(page, observation, performance.now() - start) });
      } finally { await observation.session.detach(); }
    } finally { await context.close(); }
  }
  return samples;
}

async function responsiveViews(page: Page, kind: QualityPageKind, locale: QualityLocale) {
  const layouts = [];
  for (const width of qualityWidths) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    await settleRenderedPage(page); await assertPageStructure(page);
    layouts.push({ width, ...await assertNoHorizontalOverflow(page) });
    await captureQuality(page, `${locale}-${width}-${kind}`);
  }
  return layouts;
}

function filtersButton(page: Page, locale: QualityLocale) {
  return page.getByRole('button', { name: new RegExp('^' + getPublicDictionary(locale).filters + '(?: \\(\\d+\\))?$') });
}

async function publicKeyboard(page: Page, locale: QualityLocale) {
  const t = getPublicDictionary(locale), common = getShowcaseDictionary(locale).common;
  const input = page.getByRole('searchbox', { name: t.search, exact: true });
  await input.focus(); await page.keyboard.type('BR01'); await expectVisibleFocus(input);
  const start = performance.now();
  await page.keyboard.press('Enter'); await pageReady(page, 'catalogue', locale);
  expect(new URL(page.url()).searchParams.get('q')).toBe('BR01');
  const searchToReadyMs = performance.now() - start;
  await page.setViewportSize({ width: 390, height: 844 });
  await checkDialogKeyboard(page, filtersButton(page, locale), t.filters);
  await checkDialogKeyboard(page, page.getByRole('button', { name: common.openMenu, exact: true }), t.navigation);
  return { searchToReadyMs, keyboardSearch: true, filtersEscapeAndFocusReturn: true, mobileMenuEscapeAndFocusReturn: true };
}

async function workshopKeyboard(page: Page, locale: QualityLocale) {
  const t = getProjectsDictionary(locale), form = page.locator('[data-project-save-state]');
  await checkDialogKeyboard(page, page.getByRole('button', { name: t.importText, exact: true }), t.importText);
  const title = page.getByRole('textbox', { name: t.title, exact: true }), originalTitle = await title.inputValue();
  await title.fill('');
  const save = form.locator('button[type="submit"]'); await expect(save).toBeEnabled(); await save.press('Enter');
  await expect(title).toHaveAttribute('aria-invalid', 'true'); await expect(title).toBeFocused();
  const describedBy = await title.getAttribute('aria-describedby'); expect(Boolean(describedBy)).toBe(true);
  expect(await title.evaluate((node) => (node.getAttribute('aria-describedby') ?? '').split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim()))).toBe(true);
  await title.fill(originalTitle);
  const objective = page.getByRole('textbox', { name: t.objective, exact: true }), original = await objective.inputValue();
  const inputStart = performance.now();
  await objective.fill(`${original}\nP17 disposable keyboard and save check.`); await settleRenderedPage(page);
  const inputToNextFramesMs = performance.now() - inputStart;
  const acknowledged = page.waitForResponse((response) => response.request().method() === 'PATCH' && /\/api\/v1\/me\/projects\/[^/?]+$/.test(new URL(response.url()).pathname));
  const saveStart = performance.now();
  await expect(save).toBeEnabled(); await save.press('Enter'); expect((await acknowledged).status()).toBe(200);
  await expect(form).toHaveAttribute('data-project-save-state', 'saved');
  return { inputToNextFramesMs, saveToAcknowledgedUiMs: performance.now() - saveStart,
    importEscapeAndFocusReturn: true, invalidTitleFocusedAndDescribed: true, realPatchAcknowledged: true };
}

test.describe('P17 mesures locales et reflow du catalogue et de l’atelier', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try { await qualitySources(request); } finally { await request.dispose(); }
  });

  for (const locale of ['fr', 'en'] as const) {
    test(`${locale} · catalogue : trois chargements froids, cinq largeurs et texte 200 %`, async ({ page, browser }) => {
      const href = publicCatalogueHref(locale);
      const samples = await coldMeasurements(browser, href, 'catalogue', locale);
      const budgets = await evaluatePerformanceBudgets(samples);
      await writePerformanceEvidence(browser, locale, 'catalogue', { samples, budgets, matrixCompleted: false });
      assertPerformanceBudgets(budgets);
      await page.goto(href); await pageReady(page, 'catalogue', locale);
      const interactions = await publicKeyboard(page, locale);
      await page.goto(href); await pageReady(page, 'catalogue', locale);
      const layouts = await responsiveViews(page, 'catalogue', locale);
      await page.setViewportSize({ width: 390, height: 844 });
      const input = page.getByRole('searchbox', { name: getPublicDictionary(locale).search, exact: true });
      const resizedText = await enlargeText200(page, input);
      await checkDialogKeyboard(page, filtersButton(page, locale), getPublicDictionary(locale).filters);
      const footer = page.getByRole('contentinfo'); await footer.scrollIntoViewIfNeeded(); await expect(footer).toBeVisible();
      await input.focus(); await input.scrollIntoViewIfNeeded(); await page.keyboard.press('Tab');
      await assertPageStructure(page); await assertNoHorizontalOverflow(page);
      await captureQuality(page, `${locale}-390-catalogue-text-200-percent-viewport`, false);
      await writePerformanceEvidence(browser, locale, 'catalogue', { samples, budgets, interactions, layouts, resizedText, matrixCompleted: true });
    });

    test(`${locale} · atelier : trois chargements froids, cinq largeurs et texte 200 %`, async ({ page, browser, context }) => {
      const prepared = await qualityLearner(context.request, locale), href = projectsPath(locale, prepared.project.id);
      const samples = await coldMeasurements(browser, href, 'workshop', locale, prepared.account);
      const budgets = await evaluatePerformanceBudgets(samples);
      await writePerformanceEvidence(browser, locale, 'workshop', { samples, budgets, matrixCompleted: false });
      assertPerformanceBudgets(budgets);
      await page.goto(href); await pageReady(page, 'workshop', locale);
      const interactions = await workshopKeyboard(page, locale);
      const layouts = await responsiveViews(page, 'workshop', locale);
      await page.setViewportSize({ width: 390, height: 844 });
      const t = getProjectsDictionary(locale), objective = page.getByRole('textbox', { name: t.objective, exact: true });
      const resizedText = await enlargeText200(page, objective);
      await checkDialogKeyboard(page, page.getByRole('button', { name: t.openBrief, exact: true }), t.brief);
      const title = page.getByRole('textbox', { name: t.title, exact: true }); await title.focus(); await expect(title).toBeEnabled();
      const external = page.getByRole('textbox', { name: t.externalText, exact: true }); await external.focus(); await external.scrollIntoViewIfNeeded(); await expect(external).toBeEnabled();
      await page.keyboard.press('Tab'); await assertPageStructure(page); await assertNoHorizontalOverflow(page);
      await captureQuality(page, `${locale}-390-workshop-text-200-percent-viewport`, false);
      await writePerformanceEvidence(browser, locale, 'workshop', { samples, budgets, interactions, layouts, resizedText, matrixCompleted: true });
    });
  }
});
