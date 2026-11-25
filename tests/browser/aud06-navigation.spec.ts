import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activityDiscoveryHref, catalogueHref, publicCatalogueHref, resourceHref } from '../../apps/web/src/lib/public/routes';
import { authPath } from '../../apps/web/src/lib/auth/routes';
import { getPublicDictionary } from '../../apps/web/src/lib/i18n/public';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { offersPath } from '../../apps/web/src/lib/commerce/routes';
import type { OfferView } from '../../apps/web/src/lib/api/generated/types.gen';
import { approveCourseShowcaseFixture, courseLessonHref, courseRecord, prepareCourseFixture, publishCourseFixture, type CourseFixture, type CourseLocale } from './course-content-fixture';
import { createContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publicFixtureMetadata, publishShowcaseContent, savePublicMetadata } from './public-content-fixture';
import { fillMethodLogin, methodLearner } from './methods-fixture';
import { checkedUuid, commerceHeaders, commerceSql, fixtureOfferFields } from './commerce-fixture';
import { approveShowcaseOffer } from './showcase-selection-fixture';

const captures: string[] = [], observations: Array<Record<string, unknown>> = [], outcomes: Array<Record<string, unknown>> = [];
const opposite = (locale: CourseLocale): CourseLocale => locale === 'fr' ? 'en' : 'fr';
function expectedCatalogue(url: URL, locale: CourseLocale, source: URL) {
  expect(url.pathname).toBe(publicCatalogueHref(locale));
  expect(url.searchParams.get('locale')).toBe(locale);
  for (const key of ['q', 'type', 'goal', 'level', 'access', 'sort', 'pageSize']) expect(url.searchParams.get(key)).toBe(source.searchParams.get(key));
  expect(url.searchParams.get('page') ?? '0').toBe('0');
}
async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const file = name + '.png'; await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, file), fullPage: true, animations: 'disabled' }); captures.push(file);
}

test.describe('AUD06 real bilingual navigation and explicit unavailable translations', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture, missingGuide: RecordedContent, browserVersion = '';
  function filteredCatalogue(locale: CourseLocale) {
    const course = courseRecord(fixture, 'course-client-proposal', locale).value;
    return catalogueHref(locale, { locale, q: 'ChatGPT', type: 'COURSE', goal: course.metadata.goalCodes[0], level: course.metadata.level ?? undefined,
      access: course.document!.access, sort: 'TITLE', pageSize: 20, page: 0 });
  }
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); browserVersion = browser.version();
    fixture = await prepareCourseFixture(editor); await publishCourseFixture(editor, fixture); await approveCourseShowcaseFixture(editor, fixture);
    const command = editorialContent('fr'); command.kind = 'GUIDE'; command.slug = `aud06-missing-guide-${randomUUID()}`;
    command.title = 'AUD06 · guide fictif uniquement en français'; command.reason = 'AUD06 owned isolated missing translation fixture';
    let guide = await createContent(editor, command); guide = await savePublicMetadata(editor, guide, publicFixtureMetadata('fr'));
    missingGuide = await publishShowcaseContent(editor, guide);
  });
  test.afterEach(async ({}, info) => { outcomes.push({ name: info.title, status: info.status, expectedStatus: info.expectedStatus }); });
  test.afterAll(async () => {
    await editor?.dispose(); writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud06-navigation-checks.json'), JSON.stringify({
      schemaVersion: 1, audit: 'AUD-06', browser: 'chromium', browserVersion, headless: true,
      fixture: 'P18 authored course and explicit missing-guide / technical-offer fixtures in owned disposable PostgreSQL/S3 only.',
      sharedContentChanged: false, humanEditorialApproval: false, externalProviderRequests: false,
      checkoutRequested: false, orderCreated: false, deployed: false, outcomes, observations, captures,
    }, null, 2) + '\n', { flag: 'wx' });
  });

  for (const source of ['fr', 'en'] as const) test(`${source} to ${opposite(source)}: filtered catalogue, course, M01 and both returns`, async ({ page }) => {
    const target = opposite(source), sourceCourse = courseRecord(fixture, 'course-client-proposal', source).value;
    const targetCourse = courseRecord(fixture, 'course-client-proposal', target).value, activity = courseRecord(fixture, 'activity-m01', target).value;
    const sourceQuery = new URL(filteredCatalogue(source), process.env.COURSES_BROWSER_ORIGIN);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto(sourceQuery.pathname + sourceQuery.search);
      await page.getByRole('link', { name: sourceCourse.title, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: sourceCourse.title, exact: true })).toBeVisible();
      await page.locator('[data-course-trial]').click();
      await expect(page.getByRole('heading', { level: 1, name: courseRecord(fixture, 'activity-m01', source).value.title, exact: true })).toBeVisible();
      await page.locator(`[data-language-switch="${target}"]`).click();
      await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible();
      const activityUrl = new URL(page.url()); expect(activityUrl.pathname.startsWith(`/${target}/`)).toBe(true);
      expect(activityUrl.searchParams.get('resource')).toBe(activity.resourceId); expect(activityUrl.searchParams.get('version')).toBe(activity.versionId);
      expect(activityUrl.searchParams.get('courseVersion')).toBe(targetCourse.versionId);
      expectedCatalogue(new URL(activityUrl.searchParams.get('returnTo')!, page.url()), target, sourceQuery);
      await page.getByRole('link', { name: `← ${getPublicDictionary(target).backCourse}`, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: targetCourse.title, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get('version')).toBe(targetCourse.versionId);
      await page.getByRole('link', { name: `← ${getPublicDictionary(target).backCatalogue}`, exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === publicCatalogueHref(target)); expectedCatalogue(new URL(page.url()), target, sourceQuery);
      await expect(page.getByRole('link', { name: targetCourse.title, exact: true })).toBeVisible();
      await capture(page, `${source}-to-${target}-${width}-catalogue-return`);
      observations.push({ check: 'course-language-and-return', source, target, width, exactActivityAndCourseVersions: true, filtersPreserved: true, catalogueLanguageChanged: true });
    }
  });

  test('standalone activity changes content language and returns to the chosen catalogue', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const source of ['fr','en'] as const) {
      const target = opposite(source), activity = courseRecord(fixture, 'activity-m01', source).value, translated = courseRecord(fixture, 'activity-m01', target).value;
      const returnTo = catalogueHref(source, { locale: source, type: 'ACTIVITY', q: 'brief', access: 'FREE', sort: 'TITLE', pageSize: 20, page: 0 });
      await page.goto(activityDiscoveryHref(source, activity.resourceId, activity.versionId, returnTo));
      await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible();
      await page.locator(`[data-language-switch="${target}"]`).click();
      await expect(page.getByRole('heading', { level: 1, name: translated.title, exact: true })).toBeVisible();
      const current = new URL(page.url()); expect(current.searchParams.get('activity')).toBe(activity.resourceId); expect(current.searchParams.get('version')).toBe(activity.versionId);
      await page.getByRole('link', { name: `← ${getPublicDictionary(target).backCatalogue}`, exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === publicCatalogueHref(target) && !url.searchParams.has('activity') && url.searchParams.get('locale') === target);
      expectedCatalogue(new URL(page.url()), target, new URL(returnTo, page.url()));
      await capture(page, `${target}-390-standalone-return`);
    }
  });

  test('missing editorial translation offers an explicit catalogue alternative without a false equivalent', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(resourceHref({ ...missingGuide.value, kind: 'GUIDE' }));
    await expect(page.getByRole('heading', { level: 1, name: missingGuide.value.title, exact: true })).toBeVisible();
    const english = page.locator('[data-language-switch="en"]'); await expect(english).toHaveAttribute('data-language-available', 'false');
    await expect(page.getByText(getPublicDictionary('fr').MISSING_TRANSLATION, { exact: true }).first()).toBeVisible();
    const alternative = new URL((await english.getAttribute('href'))!, page.url()); expect(alternative.pathname).toBe(publicCatalogueHref('en')); expect(alternative.searchParams.get('type')).toBe('GUIDE');
    await capture(page, 'fr-390-missing-english-explicit'); await english.click();
    await expect(page).toHaveURL(url => url.pathname === publicCatalogueHref('en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('activity')).toBe(false); await capture(page, 'en-390-missing-guide-alternative');
    observations.push({ check: 'missing-guide', unavailableEnglishVariantNotInvented: true, voluntaryCatalogueAlternative: true });
  });

  for (const contentLocale of ['fr','en'] as const) test(`login interface switch preserves the pinned ${contentLocale} activity and its original return`, async ({ page, context }) => {
    const interfaceLocale = opposite(contentLocale), account = await methodLearner(context.request, contentLocale), activity = courseRecord(fixture, 'activity-m01', contentLocale).value;
    await page.setViewportSize({ width: 390, height: 844 });
    const destination = courseLessonHref(fixture, 'm01', contentLocale) + '&' + new URLSearchParams({ returnTo: filteredCatalogue(contentLocale) });
    await page.goto(destination); await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: getLearningDictionary(contentLocale).signIn, exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === authPath(contentLocale, 'sign-in'));
    await page.locator(`[data-language-switch="${interfaceLocale}"]`).click();
    await expect(page).toHaveURL(url => url.pathname === authPath(interfaceLocale, 'sign-in'));
    const retained = new URL(new URL(page.url()).searchParams.get('returnTo')!, page.url());
    expect(retained.pathname).toBe(new URL(destination, page.url()).pathname); expect(retained.searchParams.get('resource')).toBe(activity.resourceId); expect(retained.searchParams.get('version')).toBe(activity.versionId);
    expect(retained.searchParams.get('returnTo')).toBe(filteredCatalogue(contentLocale));
    await capture(page, `${interfaceLocale}-390-login-retains-${contentLocale}-activity`);
    await fillMethodLogin(page, interfaceLocale, account);
    await expect(page.getByRole('heading', { level: 1, name: activity.title, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', contentLocale);
    expect(new URL(page.url()).searchParams.get('resource')).toBe(activity.resourceId);
    observations.push({ check: 'login-ui-does-not-translate-content-destination', interfaceLocale, contentLocale, realLogin: true, pinnedActivityPreserved: true });
  });

  test('external and malformed destinations cannot become a public or authentication redirect', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const outside = 'https://outside-aud06.invalid/escape', attempts = [outside, '//outside-aud06.invalid/escape', '/\\outside-aud06.invalid/escape', '/fr/catalogue?q=%0Aevil', '/fr/catalogue?locale=fr&locale=en', '/fr/catalogue?q=%zz'];
    const course = courseRecord(fixture, 'course-client-proposal', 'fr').value;
    for (const value of attempts) {
      await page.goto(resourceHref({ ...course, kind: 'COURSE' }, value)); await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible();
      const back = new URL((await page.getByRole('link', { name: `← ${getPublicDictionary('fr').backCatalogue}`, exact: true }).getAttribute('href'))!, page.url());
      expect(back.origin).toBe(new URL(page.url()).origin); expect(back.pathname).toBe('/fr/catalogue'); expect(back.search).toBe('');
    }
    const account = await methodLearner(context.request);
    await page.goto(authPath('fr', 'sign-in') + '?' + new URLSearchParams({ returnTo: outside }));
    for (const href of await page.locator('main a[href],header a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')!))) expect(new URL(href, page.url()).origin).toBe(new URL(page.url()).origin);
    await fillMethodLogin(page, 'fr', account); await expect(page).toHaveURL(url => url.pathname === authPath('fr', 'account'));
    await capture(page, 'fr-390-invalid-auth-return-account'); observations.push({ check: 'unsafe-destinations', malformedPublicDestinations: attempts.length, realLoginFallsBackToOwnAccount: true });
  });

  test('a bilingual technical offer presentation does not invent English access in a French-only inclusion', async ({ page }) => {
    const actor = checkedUuid(fixture.editor.id), course = courseRecord(fixture, 'course-client-proposal', 'fr');
    expect(commerceSql(`INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code='COMMERCE_MANAGER'; SELECT count(*) FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE u.user_id='${actor}' AND r.code='COMMERCE_MANAGER';`)).toBe('1');
    const fields = fixtureOfferFields([course], 1299); fields.locales = ['fr'];
    const created = await editor.post('/api/v1/admin/offers', { headers: await commerceHeaders(editor, actor), data: { code: `aud06-fr-access-${randomUUID()}`, kind: 'COURSE', fields, reason: 'AUD06 explicit disposable two-presentation offer with French-only access' } });
    expect(created.status()).toBe(201); const initial = await created.json() as OfferView;
    const ready = await editor.get(`/api/v1/admin/offers/${initial.id}/readiness`); expect(ready.status()).toBe(200); expect((await ready.json() as { summaryReady: boolean }).summaryReady).toBe(true);
    const active = await editor.post(`/api/v1/admin/offers/${initial.id}/activate`, { headers: await commerceHeaders(editor, actor, created.headers().etag), data: { reason: 'AUD06 test-only offer activation; no order or checkout' } });
    expect(active.status()).toBe(200); const offer = await approveShowcaseOffer(editor, { value: await active.json() as OfferView, etag: active.headers().etag });
    expect(offer.value.fields.locales).toEqual(['fr']); await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(offersPath('fr', offer.value.id)); await expect(page.locator('[data-offer-id]')).toHaveAttribute('data-offer-id', offer.value.id);
    for (const locale of ['fr','en'] as const) await expect(page.locator(`[data-offer-language="${locale}"]`)).toHaveAttribute('data-offer-language-state', 'AVAILABLE');
    const fr = getCommerceDictionary('fr'); await expect(page.getByText(fr.pinned, { exact: true })).toBeVisible(); await expect(page.getByText(fr.noUpdates, { exact: true })).toBeVisible();
    await expect(page.getByText(fr.noSupport, { exact: true })).toBeVisible(); await capture(page, 'fr-390-technical-offer-presentations');
    await page.locator('[data-language-switch="en"]').click(); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-offer-id]')).toHaveAttribute('data-offer-id', offer.value.id);
    const en = getCommerceDictionary('en'); await expect(page.getByRole('heading', { level: 1, name: fields.copies.find(copy => copy.locale === 'en')!.title!, exact: true })).toBeVisible();
    await expect(page.getByText(en.pinned, { exact: true })).toBeVisible(); await expect(page.getByText(en.languageNotIncluded, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: en.languages, exact: true }).locator('..').locator('p')).toHaveText('FR');
    await capture(page, 'en-390-technical-offer-presentation'); observations.push({ check: 'technical-offer', sameOfferId: true, twoVerifiedPresentations: true, includedAccessLocales: ['fr'], englishAccessNotInvented: true, orderCreated: false, checkoutRequested: false });
  });
});
