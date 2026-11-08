import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import type { ContentView } from '../../apps/web/src/lib/api/generated/types.gen';
import { catalogueHref, courseActivityHref, resourceHref as publicResourceHref } from '../../apps/web/src/lib/public/routes';
import { controlApi } from './control';
import { contentAction, currentContent } from './editorial-api';
import { createPublicFixture, publishPublicContent, type PublicFixture } from './public-content-fixture';
import { registerPublicMetadataScenario } from './public-metadata.scenario';

async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
function resourceHref(content: ContentView) {
  if (content.kind === 'MODULE') throw new Error('Modules are reached through the pinned programme.');
  return publicResourceHref({ ...content, kind: content.kind });
}

// The isolated database is owned by the supervisor. Only this serial group shares
// its published fixture; the availability case mutates it after the reading cases.
test.describe('P06 public publications', () => {
  test.describe.configure({ mode: 'serial' });
  let editorRequest: APIRequestContext;
  let fixture: PublicFixture;
  test.beforeAll(async ({ playwright }) => {
    editorRequest = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    fixture = await createPublicFixture(editorRequest);
  });
  test.afterAll(async () => { await editorRequest?.dispose(); });

  for (const locale of ['fr', 'en'] as const) test(`${locale} : accueil utile, filtres combinés, retour et mobile`, async ({ page }) => {
    const t = getPublicDictionary(locale), errors: string[] = [];
    page.on('pageerror', () => errors.push('pageerror'));
    await page.goto(`/${locale}`);
    await expect(page.getByRole('heading', { level: 1, name: t.headline })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByRole('link', { name: t.try, exact: true })).toBeVisible();
    await capture(page, `${locale}-1440-home`);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page); await capture(page, `${locale}-390-home`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: t.try, exact: true }).click();
    await expect(page.getByText(t.activityNotice, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox').first()).toBeVisible();
    await page.goto(catalogueHref(locale));
    await expect(page.getByRole('heading', { level: 1, name: t.catalogue, exact: true })).toBeVisible();
    await capture(page, `${locale}-1440-catalogue`);
    await page.getByLabel(t.search, { exact: true }).fill('BR01');
    await page.getByRole('button', { name: t.searchAction, exact: true }).click();
    await expect(page).toHaveURL(/q=BR01/);
    await page.getByLabel(t.type, { exact: true }).selectOption('COURSE');
    await page.getByLabel(t.level, { exact: true }).selectOption('BEGINNER');
    await page.getByLabel(t.access, { exact: true }).selectOption('FREE');
    await page.getByRole('button', { name: t.apply, exact: true }).click();
    await expect(page).toHaveURL(/type=COURSE/);
    const course = fixture.resources.course[locale].value;
    await page.getByRole('link', { name: course.title, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: course.title })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('version')).toBe(course.versionId);
    await expect(page.getByText(t.offerUnavailable, { exact: true })).toBeVisible();
    await capture(page, `${locale}-1440-course`);
    const otherLocale = locale === 'fr' ? 'en' : 'fr';
    await page.getByRole('link', { name: otherLocale.toUpperCase(), exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: fixture.resources.course[otherLocale].value.title })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('version')).toBe(course.versionId);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: course.title })).toBeVisible();
    await page.getByRole('link', { name: t.try, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: fixture.resources.activity[locale].value.title })).toBeVisible();
    await page.getByRole('link', { name: `← ${t.backCourse}`, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: course.title })).toBeVisible();
    await page.getByRole('link', { name: `← ${t.backCatalogue}`, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === (locale === 'fr' ? '/fr/catalogue' : '/en/catalog')
      && url.searchParams.get('q') === 'BR01' && url.searchParams.get('type') === 'COURSE'
      && url.searchParams.get('level') === 'BEGINNER' && url.searchParams.get('access') === 'FREE'
      && url.searchParams.get('locale') === locale && url.searchParams.get('pageSize') === '20'
      && url.searchParams.get('sort') === 'TITLE' && (url.searchParams.get('page') ?? '0') === '0');
    const filtered = page.url();
    await page.goBack(); await expect(page.getByRole('heading', { level: 1, name: course.title })).toBeVisible();
    await page.goForward(); await expect(page).toHaveURL(filtered);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: new RegExp(`^${t.filters}`) }).click();
    const filters = page.getByRole('dialog', { name: t.filters, exact: true });
    await expect(filters).toBeVisible();
    await filters.getByLabel(t.type, { exact: true }).selectOption('GUIDE');
    await filters.getByLabel(t.goal, { exact: true }).selectOption('understand-brief');
    await filters.getByLabel(t.contentLanguage, { exact: true }).selectOption('en');
    await filters.getByRole('button', { name: t.apply, exact: true }).click();
    await expect(page.getByRole('link', { name: fixture.resources.guide.en.value.title, exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('locale')).toBe('en');
    await page.getByRole('button', { name: new RegExp(`^${t.filters}`) }).click();
    await expect(filters.getByLabel(t.contentLanguage, { exact: true })).toHaveValue('en');
    await expect(filters.getByLabel(t.level, { exact: true }).getByRole('option', { selected: true })).toContainText(t.BEGINNER);
    await page.keyboard.press('Escape');
    await expect(filters).toHaveCount(0);
    await noOverflow(page); await capture(page, `${locale}-390-catalogue-filtered`);
    await page.goto(resourceHref({ ...course, kind: 'COURSE' }));
    await expect(page.getByRole('heading', { name: t.programme, exact: true })).toBeVisible();
    await noOverflow(page); await capture(page, `${locale}-390-course`);
    await page.setViewportSize({ width: 320, height: 844 });
    await noOverflow(page); await capture(page, `${locale}-320-course`);
    await page.goto(catalogueHref(locale));
    await noOverflow(page); await capture(page, `${locale}-320-catalogue`);
    await page.goto(`/${locale}`);
    await expect(page.getByRole('heading', { level: 1, name: t.headline })).toBeVisible();
    await noOverflow(page); await capture(page, `${locale}-320-home`);
    expect(errors).toEqual([]);
  });

  test('guides, méthodes et activités publiés, copie réelle et premium absent du HTML/JSON', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const locale of ['fr', 'en'] as const) {
      const t = getPublicDictionary(locale), guide = fixture.resources.guide[locale].value, method = fixture.resources.method[locale].value;
      const missing = await page.goto(`/${locale}/guides/not-published-${randomUUID()}`);
      expect(missing?.status()).toBe(404);
      await page.goto(resourceHref(guide));
      await expect(page.getByRole('heading', { level: 1, name: guide.title })).toBeVisible();
      await page.getByRole('button', { name: t.copy, exact: true }).click();
      await expect(page.getByText(t.copied, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(guide.title);
      await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await capture(page, `${locale}-390-guide`);
      await page.goto(resourceHref(method));
      await expect(page.getByRole('heading', { level: 1, name: method.title })).toBeVisible();
      await page.getByRole('button', { name: t.report, exact: true }).click();
      const report = page.getByRole('dialog', { name: t.reportTitle, exact: true });
      await expect(report.getByText(t.reportDescription, { exact: true })).toBeVisible();
      const preservedContext = await report.getByLabel(t.reportContext, { exact: true }).inputValue();
      expect(preservedContext).toContain(method.resourceId); expect(preservedContext).toContain(method.versionId);
      await page.keyboard.press('Escape');
      await capture(page, `${locale}-390-method`);
      const course = fixture.resources.course[locale].value, activity = fixture.resources.activity[locale].value;
      await page.goto(courseActivityHref(locale, course.slug, activity.slug, activity.resourceId, activity.versionId, course.versionId));
      await expect(page.getByRole('heading', { level: 1, name: activity.title })).toBeVisible();
      await expect(page.getByText(t.activityNotice, { exact: true })).toBeVisible();
      await page.getByRole('checkbox').first().check();
      await expect(page.getByText(t.checklistNotice, { exact: true })).toBeVisible();
      await noOverflow(page); await capture(page, `${locale}-390-activity`);
    }
    const premium = fixture.resources.premium.value;
    const premiumHref = catalogueHref('fr') + `?activity=${premium.resourceId}&version=${premium.versionId}`;
    await page.goto(premiumHref);
    await expect(page.getByText(getPublicDictionary('fr').protectedBody, { exact: true })).toBeVisible();
    expect(!(await page.content()).includes(fixture.secret)).toBe(true);
    const response = await context.request.get(`/api/v1/catalog/resources/${premium.resourceId}?locale=fr`);
    expect(response.status()).toBe(200); const body = await response.json() as { document: unknown };
    expect(body.document).toBeNull(); expect(!(await response.text()).includes(fixture.secret)).toBe(true);
    const free = fixture.resources.activity.fr.value;
    const freeJson = await (await context.request.get(`/api/v1/catalog/resources/${free.resourceId}/versions/${free.versionId}?locale=fr`)).text();
    expect(!freeJson.includes('"correctOption"') && !freeJson.includes('"correction"') && !freeJson.includes('"explanation"')).toBe(true);
    await capture(page, 'fr-390-protected-activity');
  });

  test('publication fraîche, programme épinglé et langues manquantes/périmées/retrait explicites', async ({ page, context }) => {
    const fr = getPublicDictionary('fr'), en = getPublicDictionary('en');
    let guide = await currentContent(editorRequest, fixture.resources.guide.fr.value.id);
    const oldTitle = guide.value.title, freshTitle = `BR01 · corrected ${randomUUID()}`;
    guide = await contentAction(editorRequest, guide, 'revisions', { title: freshTitle, summary: guide.value.summary, document: guide.value.document, reason: 'P06 publication freshness verification' });
    await page.goto(resourceHref(fixture.resources.guide.fr.value));
    await expect(page.getByRole('heading', { level: 1, name: oldTitle })).toBeVisible();
    await page.goto(resourceHref(fixture.resources.guide.en.value));
    await expect(page.getByText(en.STALE, { exact: true }).first()).toBeVisible();
    await capture(page, 'en-1440-stale-guide');
    guide = await publishPublicContent(editorRequest, guide);
    await page.goto(resourceHref(guide.value));
    await expect(page.getByRole('heading', { level: 1, name: freshTitle })).toBeVisible();
    const newVersion = await contentAction(editorRequest, guide, 'versions', { objectives: 'New BR01 review objective', evaluationDefinition: 'New BR01 assessment requirements', title: 'BR01 · new learning version', summary: guide.value.summary, document: guide.value.document, childVersionIds: [], reason: 'P06 new version with missing translation' }, 201);
    const publishedVersion = await publishPublicContent(editorRequest, newVersion);
    await page.goto(`/en/guides/${fixture.resources.guide.en.value.slug}`);
    await expect(page.getByText(en.MISSING_TRANSLATION, { exact: true }).first()).toBeVisible();
    await capture(page, 'en-1440-missing-translation');
    const course = fixture.resources.course.fr.value, activity = fixture.resources.activity.fr.value;
    const activity2 = await contentAction(editorRequest, await currentContent(editorRequest, activity.id), 'versions', {
      objectives: 'Different activity objective', evaluationDefinition: 'Different assessment', title: 'BR01 · activity version two', summary: activity.summary, document: activity.document, childVersionIds: [], reason: 'Check published curriculum stays pinned' }, 201);
    await publishPublicContent(editorRequest, activity2);
    const pinned = courseActivityHref('fr', course.slug, activity.slug, activity.resourceId, activity.versionId, course.versionId);
    await page.goto(pinned); await expect(page.getByRole('heading', { level: 1, name: activity.title })).toBeVisible();
    await page.goto(catalogueHref('fr') + `?activity=${fixture.resources.activity.en.value.resourceId}&version=${activity.versionId}&locale=en`);
    await expect(page.getByRole('heading', { level: 1, name: fixture.resources.activity.en.value.title })).toBeVisible();
    expect(new URL(await page.locator('link[rel="canonical"]').getAttribute('href') ?? '').searchParams.get('locale')).toBe('en');
    const latestCourse = await currentContent(editorRequest, course.id);
    await contentAction(editorRequest, latestCourse, 'archive', { reason: 'P06 withdrawn parent remains an explicit notice' });
    await page.goto(pinned); await expect(page.getByText(fr.WITHDRAWN, { exact: true }).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, 'fr-390-withdrawn-parent-activity');
    await contentAction(editorRequest, publishedVersion, 'archive', { reason: 'P06 latest guide withdrawn without historical fallback' });
    const response = await context.request.get(`/api/v1/catalog/resources/${guide.value.resourceId}?locale=fr`);
    expect((await response.json() as { availability: string }).availability).toBe('WITHDRAWN');
  });

  test('zéro résultat distinct de panne réelle et reprise sans catalogue simulé', async ({ page }) => {
    const t = getPublicDictionary('fr');
    await page.setViewportSize({ width: 390, height: 844 });
    const empty = catalogueHref('fr') + `?q=no-match-${randomUUID()}&locale=fr`;
    await page.goto(empty); await expect(page.getByText(t.emptyTitle, { exact: true })).toBeVisible();
    await capture(page, 'fr-390-no-results');
    const query = catalogueHref('fr') + '?q=BR01&type=METHOD_TEMPLATE&locale=fr';
    let stopped = false;
    try {
      await controlApi('stop-api'); stopped = true;
      await page.goto(query);
      await expect(page.getByText(t.serviceUnavailable, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole('navigation', { name: t.activeFilters, exact: true })).toContainText(t.METHOD_TEMPLATE);
      await expect(page.getByRole('navigation', { name: t.activeFilters, exact: true })).not.toContainText('METHOD_TEMPLATE');
      await expect(page.getByText(t.emptyTitle, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: fixture.resources.method.fr.value.title, exact: true })).toHaveCount(0);
      await capture(page, 'fr-390-catalogue-outage');
      await controlApi('start-api'); stopped = false;
      await page.getByRole('button', { name: t.retry, exact: true }).filter({ visible: true }).first().click();
      await expect(page.getByRole('link', { name: fixture.resources.method.fr.value.title, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get('type')).toBe('METHOD_TEMPLATE');
      await capture(page, 'fr-390-catalogue-recovered');
    } finally { if (stopped) await controlApi('start-api'); }
  });
});

registerPublicMetadataScenario();
