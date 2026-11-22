import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { catalogueHref } from '../../apps/web/src/lib/public/routes';
import type { CatalogueFacets, CataloguePage } from '../../apps/web/src/lib/api/generated/types.gen';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { createPublicFixture, publishPublicContent, type PublicFixture, type PublicPair } from './public-content-fixture';
import { showcaseFixtureActor } from './showcase-selection-fixture';

type Locale = 'fr' | 'en';
const viewports = [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }];
const selectedCaptures = new Set(['empty-fr-390', 'empty-en-390', 'empty-en-320', 'editorial-fr-390', 'editorial-en-390', 'editorial-fr-1440']);
const observations: Array<{ state: string; locale: Locale; width: number; height: number; keyboard: boolean; menu: boolean; noOverflow: boolean; capture: string | null }> = [];

async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function navigation(page: Page, locale: Locale, populated: boolean, width: number) {
  const t = getPublicDictionary(locale), catalogue = locale === 'fr' ? '/fr/catalogue' : '/en/catalog';
  await expect(page.locator(`header a[href="/${locale}/${locale === 'fr' ? 'offres' : 'offers'}"]`)).toHaveCount(0);
  if (width < 1024) {
    const trigger = page.getByRole('button', { name: getShowcaseDictionary(locale).common.openMenu, exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', { name: t.navigation, exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: t.catalogue, exact: true })).toHaveAttribute('href', catalogue);
    await expect(menu.getByRole('link', { name: t.account, exact: true })).toBeVisible();
    for (const name of [t.methods, t.guides]) await expect(menu.getByRole('link', { name, exact: true })).toHaveCount(populated ? 1 : 0);
    await noOverflow(page); await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  } else {
    const menu = page.getByRole('navigation', { name: t.navigation, exact: true });
    for (const name of [t.methods, t.guides]) await expect(menu.getByRole('link', { name, exact: true })).toHaveCount(populated ? 1 : 0);
  }
}
async function observeHome(page: Page, locale: Locale, state: 'empty' | 'editorial') {
  const t = getPublicDictionary(locale);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport); await page.goto(`/${locale}`);
    await expect(page.getByRole('heading', { level: 1, name: state === 'empty' ? t.preparationTitle : t.headline, exact: true })).toBeVisible();
    if (state === 'empty') {
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.getByRole('link', { name: t.try, exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: t.goalsTitle, exact: true })).toHaveCount(0);
    }
    await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
    await navigation(page, locale, state === 'editorial', viewport.width); await noOverflow(page);
    const label = `${state}-${locale}-${viewport.width}`, capture = selectedCaptures.has(label) ? `aud01-${label}.png` : null;
    if (capture) {
      await page.getByRole('main').focus();
      await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, capture), fullPage: true, animations: 'disabled' });
    }
    observations.push({ state, locale, ...viewport, keyboard: true, menu: true, noOverflow: true, capture });
  }
}

test.describe('AUD01 — discovery selection and preserved direct recipe routes', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext;
  let free: PublicPair, protectedPair: PublicPair;
  let fixture: PublicFixture;
  const marker = `aud01-${randomUUID()}`, secret = `PRIVATE-AUD01-${randomUUID()}`;
  let browserVersion = '';
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    browserVersion = browser.version();
  });
  test.afterAll(async () => {
    await editor?.dispose();
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud01-viewport-checks.json'), JSON.stringify({ schemaVersion: 1, browser: 'chromium', browserVersion, headless: true,
      mode: 'actual browser viewport, not zoom emulation', fixtures: 'disposable synthetic resources only', editorialSelectionIsSimulation: true, observations,
      screenshots: observations.flatMap(item => item.capture ? [item.capture] : []), financialOperationsExecuted: false, deployed: false }, null, 2) + '\n', { flag: 'wx' });
  });

  test('empty FR/EN showcase is honest, without empty categories, and keyboard/mobile remain usable', async ({ page }) => {
    for (const locale of ['fr', 'en'] as const) {
      const response = await page.request.get(`/api/v1/catalog?locale=${locale}`);
      expect(response.status()).toBe(200); expect((await response.json() as CataloguePage).total).toBe(0);
      await observeHome(page, locale, 'empty');
      await page.goto(catalogueHref(locale));
      await expect(page.getByText(getPublicDictionary(locale).preparationDescription, { exact: true }).first()).toBeVisible();
      await expect(page.locator('select')).toHaveCount(0); await expect(page.locator('form')).toHaveCount(0);
    }
  });

  test('RECIPE and unreviewed publications stay out of discovery while free/protected direct routes keep their rules', async ({ page }) => {
    await loginEditor(editor);
    async function pair(access: 'FREE' | 'PROTECTED'): Promise<PublicPair> {
      const command = editorialContent('fr', access);
      command.slug = `${marker}-${access.toLowerCase()}-fr`; command.title = `AUD01 ${access} synthetic case`;
      if (access === 'PROTECTED') command.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
      const fr = await publishPublicContent(editor, await createContent(editor, command));
      const translated = editorialContent('en', access);
      if (access === 'PROTECTED') translated.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
      const en = await publishPublicContent(editor, await contentAction(editor, fr, 'translations', { locale: 'en', slug: `${marker}-${access.toLowerCase()}-en`, title: `AUD01 ${access} synthetic case`,
        summary: translated.summary, document: translated.document, reason: 'AUD01 disposable equivalent direct recipe, never a commercial publication.' }, 201));
      return { fr: await currentContent(editor, fr.value.id), en: await currentContent(editor, en.value.id) };
    }
    free = await pair('FREE'); protectedPair = await pair('PROTECTED');
    const actor = await showcaseFixtureActor(editor);
    for (const locale of ['fr', 'en'] as const) {
      const path = `/api/v1/admin/contents/${free[locale].value.id}/public-selection`, current = await editor.get(path);
      expect(current.status()).toBe(200);
      const marked = await editor.put(path, { headers: { ...await csrfHeaders(editor), 'X-Account-Context': actor, 'If-Match': current.headers().etag },
        data: { revisionId: free[locale].value.publishedRevisionId, provenance: 'RECIPE', approved: false, reason: 'Explicit AUD01 technical recipe in owned disposable database.' } });
      expect(marked.status()).toBe(200); expect((await marked.json() as { provenance: string }).provenance).toBe('RECIPE');
      const unreviewed = await editor.get(`/api/v1/admin/contents/${protectedPair[locale].value.id}/public-selection`);
      expect(unreviewed.status()).toBe(200); expect(await unreviewed.json()).toMatchObject({ provenance: 'UNREVIEWED', approved: false });
      const list = await page.request.get(`/api/v1/catalog?locale=${locale}`);
      expect(list.status()).toBe(200); expect((await list.json() as CataloguePage).total).toBe(0);
      const facets = await page.request.get(`/api/v1/catalog/facets?locale=${locale}`);
      expect(facets.status()).toBe(200); expect((await facets.json() as CatalogueFacets).types).toEqual([]);
      await page.goto(`/${locale}`); await expect(page.getByRole('heading', { level: 1, name: getPublicDictionary(locale).preparationTitle, exact: true })).toBeVisible();
      for (const [resource, premium] of [[free[locale], false], [protectedPair[locale], true]] as const) {
        const direct = `${catalogueHref(locale)}?activity=${resource.value.resourceId}&version=${resource.value.versionId}`;
        const response = await page.goto(direct); expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: resource.value.title, exact: true })).toBeVisible();
        const api = await page.request.get(`/api/v1/catalog/resources/${resource.value.resourceId}/versions/${resource.value.versionId}?locale=${locale}`);
        expect(api.status()).toBe(200);
        const body = await api.json() as { document: unknown };
        if (premium) { expect(body.document).toBeNull(); await expect(page.getByText(getPublicDictionary(locale).protectedBody, { exact: true })).toBeVisible(); expect((await page.content()).includes(secret)).toBe(false); }
        else { expect(body.document).not.toBeNull(); await expect(page.getByRole('checkbox').first()).toBeVisible(); }
      }
    }
    expect((await page.request.get('/api/v1/me/learning?locale=fr')).status()).toBe(401);
  });

  test('explicit editorial simulation restores useful categories and filters without admitting the recipes', async ({ page }) => {
    expect(free).toBeDefined(); expect(protectedPair).toBeDefined();
    fixture = await createPublicFixture(editor);
    const recipeIds = new Set([free.fr.value.resourceId, protectedPair.fr.value.resourceId]);
    for (const locale of ['fr', 'en'] as const) {
      for (const access of ['FREE', 'PROTECTED'] as const) {
        const response = await page.request.get(`/api/v1/catalog?locale=${locale}&access=${access}&pageSize=100`);
        expect(response.status()).toBe(200);
        const catalogue = await response.json() as CataloguePage;
        expect(catalogue.items.every(item => item.access === access && item.locale === locale && !recipeIds.has(item.resourceId))).toBe(true);
        if (access === 'FREE' || locale === 'fr') expect(catalogue.total).toBeGreaterThan(0);
        await page.goto(catalogueHref(locale, { locale, access }));
        await expect(page.getByLabel(getPublicDictionary(locale).access, { exact: true }).first()).toHaveValue(access);
        await noOverflow(page);
      }
      const filtered = await page.request.get(`/api/v1/catalog?locale=${locale}&q=${marker}`);
      expect(filtered.status()).toBe(200); expect((await filtered.json() as CataloguePage).total).toBe(0);
      const retained = await page.request.get(`/api/v1/catalog/resources/${free[locale].value.resourceId}/versions/${free[locale].value.versionId}?locale=${locale}`);
      expect(retained.status()).toBe(200); expect((await retained.json() as { document: unknown }).document).not.toBeNull();
      const recipe = await editor.get(`/api/v1/admin/contents/${free[locale].value.id}/public-selection`);
      expect(recipe.status()).toBe(200); expect(await recipe.json()).toMatchObject({ provenance: 'RECIPE', approved: false });
      await observeHome(page, locale, 'editorial');
    }
    expect(observations.filter(item => item.capture)).toHaveLength(6);
  });

  test('English catalogue can select the sole available French content language on desktop and mobile', async ({ page }) => {
    const actor = await showcaseFixtureActor(editor);
    for (const resource of [fixture.resources.course, fixture.resources.module, fixture.resources.activity, fixture.resources.guide, fixture.resources.method]) {
      const path = `/api/v1/admin/contents/${resource.en.value.id}/public-selection`;
      const current = await editor.get(path);
      expect(current.status()).toBe(200);
      const withdrawn = await editor.put(path, {
        headers: { ...await csrfHeaders(editor), 'X-Account-Context': actor, 'If-Match': current.headers().etag },
        data: { revisionId: resource.en.value.publishedRevisionId, provenance: 'EDITORIAL', approved: false, reason: 'AUD01 isolated single content-language browser scenario.' },
      });
      expect(withdrawn.status()).toBe(200);
    }
    const facets = await page.request.get('/api/v1/catalog/facets?locale=en');
    expect(facets.status()).toBe(200);
    const availableLanguages = (await facets.json() as CatalogueFacets).locales;
    expect(availableLanguages.map(language => language.code)).toEqual(['fr']);
    expect(availableLanguages[0].count).toBeGreaterThan(0);
    const t = getPublicDictionary('en');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/en/catalog');
      const filters = width < 1024 ? page.getByRole('dialog', { name: t.filters, exact: true }) : page.locator('aside');
      if (width < 1024) await page.getByRole('button', { name: t.filters, exact: true }).click();
      const language = filters.getByLabel(t.contentLanguage, { exact: true });
      await expect(language).toBeVisible();
      await expect(language).toHaveValue('en');
      await language.selectOption('fr');
      await noOverflow(page);
      if (width === 390) await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud01-single-language-en-390.png'), fullPage: true, animations: 'disabled' });
      await filters.getByRole('button', { name: t.apply, exact: true }).click();
      await expect(page).toHaveURL(/\/en\/catalog\?.*locale=fr/);
      await expect(page.getByRole('heading', { level: 1, name: t.catalogue, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: fixture.resources.guide.fr.value.title, exact: true })).toBeVisible();
      await noOverflow(page);
    }
  });
});
