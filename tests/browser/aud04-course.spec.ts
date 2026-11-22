import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EnrollmentView, OfferView, OrderView, ResourceDetail } from '../../apps/web/src/lib/api/generated/types.gen';
import { commerceMoney } from '../../apps/web/src/lib/commerce/format';
import { offersPath, orderStatusPath } from '../../apps/web/src/lib/commerce/routes';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { getMemberAccessDictionary } from '../../apps/web/src/lib/i18n/member-access';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { resourceHref } from '../../apps/web/src/lib/public/routes';
import { approveCourseShowcaseFixture, courseLessonHref, courseRecord, prepareCourseFixture, publishCourseFixture, type CourseFixture, type CourseLocale } from './course-content-fixture';
import { checkedUuid, commerceHeaders, commerceSql, createShowcaseOffer } from './commerce-fixture';
import { csrfHeaders } from './editorial-fixture';
import { contentAction, currentContent } from './editorial-api';
import { publishShowcaseContent } from './public-content-fixture';
import { approveShowcaseOffer } from './showcase-selection-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';

const stage = process.env.COURSES_AUD04_STAGE ?? 'after';
if (!['before', 'after'].includes(stage)) throw new Error('AUD04 capture stage must be before or after.');
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const observations: Array<Record<string, unknown>> = [], captures: string[] = [];
const testOutcomes: Array<{ name: string; status: string; expectedStatus: string }> = [];
const preparedOrders: Array<{ id: string; offerId: string; offerRevision: number; acceptedTermsVersion: string }> = [];
function courseHref(fixture: CourseFixture, locale: CourseLocale) {
  const value = courseRecord(fixture, 'course-client-proposal', locale).value;
  return resourceHref({ locale, kind: 'COURSE', slug: value.slug, resourceId: value.resourceId, versionId: value.versionId });
}
async function capture(page: Page, name: string, fullPage = false) {
  await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  if (stage === 'after') expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const filename = `${stage}-${name}.png`;
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, filename), fullPage, animations: 'disabled' });
  captures.push(filename);
}

test.describe('AUD04 course decision and exact commercial destination', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, fixture: CourseFixture, browserVersion = '';
  test.beforeAll(async ({ playwright, browser }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); browserVersion = browser.version();
    fixture = await prepareCourseFixture(editor); await publishCourseFixture(editor, fixture); await approveCourseShowcaseFixture(editor, fixture);
  });
  test.afterEach(async ({}, info) => { testOutcomes.push({ name: info.title, status: info.status ?? 'unknown', expectedStatus: info.expectedStatus }); });
  test.afterAll(async () => {
    await editor?.dispose();
    writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'aud04-course-checks.json'), JSON.stringify({
      schemaVersion: 1, stage, browser: 'chromium', browserVersion, headless: true,
      beforeStageIsCaptureBaselineOnly: stage === 'before', finalAssertionsApplied: stage === 'after',
      fixture: 'P18 authored FR/EN course, published and explicitly selected only in owned PostgreSQL/S3 tmpfs.',
      humanEditorialApproval: false, sharedContentChanged: false, providerRequestsExecuted: false, deployed: false,
      localPreparedOrdersOnly: preparedOrders, testOutcomes, observations, captures,
    }, null, 2) + '\n', { flag: 'wx' });
  });
  test('FR/EN course viewport and full-page baseline and final comparison', async ({ page }) => {
    for (const locale of ['fr', 'en'] as const) for (const viewport of viewports) {
      await page.setViewportSize(viewport); const response = await page.goto(courseHref(fixture, locale)); expect(response?.status()).toBe(200);
      const course = courseRecord(fixture, 'course-client-proposal', locale).value;
      await expect(page.getByRole('heading', { level: 1, name: course.title, exact: true })).toBeVisible();
      await page.getByRole('main').focus();
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      let trialBottom: number | null = null;
      if (stage === 'after') {
        expect(noOverflow).toBe(true);
        const section = page.locator('[data-course-offers]'); await expect(section).toBeVisible(); await expect(section.locator('[data-course-offer]')).toHaveCount(0);
        await expect(section).toContainText(locale === 'fr' ? 'Aucune offre publiée' : 'No published offer');
        const trial = page.locator('[data-course-trial]'); await expect(trial).toBeVisible();
        const trialBox = await trial.boundingBox(); expect(trialBox).not.toBeNull(); trialBottom = trialBox!.y + trialBox!.height; expect(trialBottom).toBeLessThanOrEqual(viewport.height);
        const expectedTrial = new URL(courseLessonHref(fixture, 'm01', locale), process.env.COURSES_BROWSER_ORIGIN), actualTrial = new URL((await trial.getAttribute('href'))!, process.env.COURSES_BROWSER_ORIGIN);
        expect(actualTrial.pathname).toBe(expectedTrial.pathname);
        for (const key of ['resource', 'version', 'courseVersion']) expect(actualTrial.searchParams.get(key)).toBe(expectedTrial.searchParams.get(key));
        expect(actualTrial.searchParams.get('returnTo')).toBe(`/${locale}/${locale === 'fr' ? 'catalogue' : 'catalog'}`);
        await expect(page.locator('[data-course-member-access]').getByRole('link', { name: getMemberAccessDictionary(locale).signIn, exact: true })).toBeVisible();
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
        const protectedLesson = courseRecord(fixture, 'activity-m02', locale).value;
        const protectedResponse = await page.request.get(`/api/v1/catalog/resources/${protectedLesson.resourceId}/versions/${protectedLesson.versionId}?locale=${locale}`);
        expect(protectedResponse.status()).toBe(200); expect((await protectedResponse.json() as ResourceDetail).document).toBeNull();
        const programme = page.locator('[data-course-programme]');
        for (let module = 1; module <= 6; module++) {
          const activity = courseRecord(fixture, `activity-m0${module}`, locale).value;
          await expect(programme.getByText(activity.title, { exact: true })).toHaveCount(1);
          await expect(programme.getByText(activity.summary, { exact: true })).toHaveCount(1);
        }
      }
      await capture(page, `course-${locale}-${viewport.width}`); await capture(page, `course-${locale}-${viewport.width}-full`, true);
      observations.push({ check: 'course-comparison', locale, ...viewport, noOverflow, trialBottom, courseId: course.resourceId, versionId: course.versionId, courseHref: courseHref(fixture, locale), activityTitlesAndSummariesPresentedOnce: stage === 'after' });
      if (stage === 'after' && locale === 'fr' && viewport.width === 1440) {
        await page.locator('[data-course-trial]').focus(); await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { level: 1, name: courseRecord(fixture, 'activity-m01', locale).value.title, exact: true })).toBeVisible();
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
        observations.push({ check: 'keyboard-trial', locale, keyboardActivated: true, anonymousTrialReadable: true });
      }
    }
    expect(captures).toHaveLength(8);
  });

  if (stage === 'after') {
    let single: Awaited<ReturnType<typeof createShowcaseOffer>>;
    test('one exact offer leads to explicit FR/EN consent and a local pending order without rights', async ({ page, context }) => {
      const actor = checkedUuid(fixture.editor.id), course = courseRecord(fixture, 'course-client-proposal', 'fr');
      expect(commerceSql(`INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code='COMMERCE_MANAGER'; SELECT count(*) FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE u.user_id='${actor}' AND r.code='COMMERCE_MANAGER';`)).toBe('1');
      single = await createShowcaseOffer(editor, actor, [course], 1299);
      for (const locale of ['fr', 'en'] as const) {
        const t = getCommerceDictionary(locale), payment = getPaymentDictionary(locale);
        const account = await methodLearner(context.request, locale); await loginMethodAccount(context.request, account);
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(courseHref(fixture, locale));
        const access = page.locator('[data-course-member-access]'), member = getMemberAccessDictionary(locale);
        await expect(access.getByText(member.unavailable, { exact: true })).toBeVisible();
        await expect(access.getByRole('link', { name: member.resume, exact: true })).toHaveCount(0);
        await expect(access.getByRole('button', { name: member.start, exact: true })).toHaveCount(0);
        const card = page.locator(`[data-course-offer="${single.value.id}"]`); await expect(card).toBeVisible();
        await expect(page.locator('[data-course-offer]')).toHaveCount(1); await expect(card).toHaveAttribute('data-offer-revision', String(single.value.revision));
        await expect(card.locator('[data-course-offer-price]')).toHaveText(commerceMoney(single.value.fields.price, locale)!);
        await card.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(card).toContainText(single.value.fields.conditions!.termsVersion!);
        await capture(page, `single-offer-${locale}-390`, true);
        await expect(card.locator('[data-course-offer-link]')).toHaveAttribute('href', offersPath(locale, single.value.id));
        await card.locator('[data-course-offer-link]').focus(); await page.keyboard.press('Enter');
        await expect(page.locator('[data-offer-id]')).toHaveAttribute('data-offer-id', single.value.id);
        await expect(page.getByRole('checkbox', { name: t.acceptTerms, exact: true })).not.toBeChecked();
        await page.getByRole('button', { name: t.prepare, exact: true }).click(); await expect(page.getByText(t.acceptRequired, { exact: true })).toBeVisible();
        expect(commerceSql(`SELECT count(*) FROM orders WHERE owner_id='${checkedUuid(account.id)}';`)).toBe('0');
        await page.getByRole('checkbox', { name: t.acceptTerms, exact: true }).check();
        const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me/orders' && response.request().method() === 'POST');
        await page.getByRole('button', { name: t.prepare, exact: true }).click(); const creation = await responsePromise; expect(creation.status()).toBe(201);
        const created = await creation.json() as OrderView, key = creation.request().headers()['idempotency-key'];
        await expect(page.locator('[data-order-id]')).toHaveAttribute('data-order-id', created.id);
        expect(created.snapshot.offerId).toBe(single.value.id); expect(created.snapshot.offerRevision).toBe(single.value.revision);
        expect(created.snapshot.total).toEqual(single.value.fields.price); expect(created.snapshot.conditions).toEqual(single.value.fields.conditions);
        expect(created.snapshot.locale).toBe(locale); expect(created.acceptedTermsVersion).toBe(single.value.fields.conditions!.termsVersion);
        expect(created.snapshot.resources.map(resource => [resource.resourceId, resource.versionId])).toEqual([[course.value.resourceId, course.value.versionId]]);
        expect([created.orderStatus, created.paymentStatus, created.fulfillmentStatus]).toEqual(['PREPARED', 'NOT_STARTED', 'NOT_STARTED']);
        const replay = await context.request.post('/api/v1/me/orders', { headers: { ...await commerceHeaders(context.request, account.id), 'Idempotency-Key': key }, data: creation.request().postDataJSON() });
        expect(replay.status()).toBe(200); expect((await replay.json() as OrderView).id).toBe(created.id);
        await expect(page.locator('[data-checkout-state]').getByText(payment.unavailable, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: payment.openCheckout, exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: payment.resumeCheckout, exact: true })).toHaveCount(0);
        await capture(page, `local-order-${locale}-390`, true);
        await page.goto(orderStatusPath(locale, created.id, 'success')); await expect(page.getByText(payment.returnSuccess, { exact: true })).toBeVisible();
        await expect(page.getByText(payment.awaitingTitle, { exact: true })).toBeVisible();
        expect((await context.request.get(`/api/v1/me/resources/${course.value.resourceId}/versions/${course.value.versionId}?locale=${locale}`)).status()).toBe(403);
        expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${checkedUuid(account.id)}';`)).toBe('0');
        await capture(page, `unpaid-return-${locale}-390`, true);
        preparedOrders.push({ id: created.id, offerId: single.value.id, offerRevision: single.value.revision, acceptedTermsVersion: created.acceptedTermsVersion });
        observations.push({ check: 'exact-offer-and-local-order', locale, offerId: single.value.id, offerRevision: single.value.revision, orderId: created.id, exactCourseVersion: true, explicitConsent: true, keyboardTermsAndOffer: true, idempotentReplay: true, noPayment: true, noRights: true, returnParameterDoesNotGrant: true });
        expect((await context.request.post('/api/v1/auth/logout', { headers: await commerceHeaders(context.request, account.id) })).status()).toBe(204);
      }
      expect(commerceSql('SELECT count(*) FROM checkout_operations;')).toBe('0');
    });

    test('several exact choices retain filtering and pagination while inactive and changed offers remain honest', async ({ page }) => {
      const actor = fixture.editor.id, course = courseRecord(fixture, 'course-client-proposal', 'fr');
      const viewer = await methodLearner(page.request); await loginMethodAccount(page.request, viewer);
      const current = await currentContent(editor, course.value.id);
      let foreignFr = await publishShowcaseContent(editor, await contentAction(editor, current, 'duplicate', { slug: `aud04-other-${randomUUID()}`, title: 'AUD04 unrelated test course', reason: 'Owned unrelated course exclusion fixture' }, 201));
      const english = courseRecord(fixture, 'course-client-proposal', 'en').value;
      await publishShowcaseContent(editor, await contentAction(editor, foreignFr, 'translations', { locale: 'en', slug: `aud04-other-en-${randomUUID()}`, title: 'AUD04 unrelated English test course', summary: 'Explicit unrelated disposable course', document: english.document, reason: 'Owned unrelated English fixture' }, 201));
      foreignFr = await currentContent(editor, foreignFr.value.id);
      const foreign = await createShowcaseOffer(editor, actor, [foreignFr], 9999);
      const other = await createShowcaseOffer(editor, actor, [course], 1799);
      const pack = await createShowcaseOffer(editor, actor, [course, foreignFr], 2599);
      const fourth = await createShowcaseOffer(editor, actor, [course], 3299);
      for (const locale of ['fr', 'en'] as const) {
        await page.setViewportSize({ width: 390, height: 844 }); await page.goto(courseHref(fixture, locale));
        await expect(page.locator('[data-course-offer]')).toHaveCount(3); await expect(page.locator('[data-course-offers]')).toContainText(locale === 'fr' ? 'Plusieurs offres' : 'Several offers');
        await expect(page.locator(`[data-course-offer="${foreign.value.id}"]`)).toHaveCount(0);
        const more = page.locator('[data-course-offers-more]'); await expect(more).toBeVisible();
        await capture(page, `multiple-choice-${locale}-390`, true);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await capture(page, `multiple-choice-${locale}-1440`); await capture(page, `multiple-choice-${locale}-1440-full`, true);
        await page.setViewportSize({ width: 390, height: 844 });
        const href = (await more.getAttribute('href'))!; const parsed = new URL(href, process.env.COURSES_BROWSER_ORIGIN);
        expect(parsed.searchParams.get('resourceId')).toBe(course.value.resourceId); expect(parsed.searchParams.get('versionId')).toBe(course.value.versionId);
        await more.click(); await expect(page.locator('[data-offer-id]')).toHaveCount(4); await expect(page.locator(`[data-offer-id="${foreign.value.id}"]`)).toHaveCount(0);
        await page.goto(href + '&pageSize=2'); await expect(page.locator('[data-offer-id]')).toHaveCount(2);
        const next = page.getByRole('link', { name: getCommerceDictionary(locale).next, exact: true }); await expect(next).toBeVisible();
        const nextUrl = new URL((await next.getAttribute('href'))!, process.env.COURSES_BROWSER_ORIGIN); expect(nextUrl.searchParams.get('resourceId')).toBe(course.value.resourceId); expect(nextUrl.searchParams.get('versionId')).toBe(course.value.versionId); expect(nextUrl.searchParams.get('page')).toBe('1');
        await next.click(); await expect(page.locator('[data-offer-id]')).toHaveCount(2); await capture(page, `filtered-pagination-${locale}-390`, true);
        observations.push({ check: 'explicit-commercial-choice', locale, exactMatchingOffers: 4, inlineMaximum: 3, unrelatedExcluded: true, filteredListAndPaginationPreserved: true });
      }
      await page.goto(courseHref(fixture, 'fr')); const inlineIds = await page.locator('[data-course-offer]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-course-offer')));
      const inactiveOffer = [other, pack, fourth].find(offer => inlineIds.includes(offer.value.id))!; expect(inactiveOffer).toBeDefined();
      const inactiveResponse = await editor.post(`/api/v1/admin/offers/${inactiveOffer.value.id}/deactivate`, { headers: await commerceHeaders(editor, actor, inactiveOffer.etag), data: { reason: 'Owned offer made unavailable for AUD04' } }); expect(inactiveResponse.status()).toBe(200);
      await page.goto(courseHref(fixture, 'fr')); const inactive = page.locator(`[data-course-offer="${inactiveOffer.value.id}"]`);
      await expect(inactive).toContainText('indisponible à l’achat');
      await page.goto(offersPath('fr', inactiveOffer.value.id)); await expect(page.getByRole('button', { name: getCommerceDictionary('fr').prepare, exact: true })).toBeDisabled();
      await capture(page, 'inactive-offer-fr-390', true);
      const changed = await editor.patch(`/api/v1/admin/offers/${single.value.id}`, { headers: await commerceHeaders(editor, actor, single.etag), data: { fields: { ...single.value.fields, price: { amountMinor: 4599, currency: 'EUR' } }, reason: 'AUD04 explicit changed offer, no inherited approval' } }); expect(changed.status()).toBe(200);
      await page.goto(courseHref(fixture, 'fr')); await expect(page.locator(`[data-course-offer="${single.value.id}"]`)).toHaveCount(0);
      for (const prepared of preparedOrders) { const stored = commerceSql(`SELECT snapshot_json->'total'->>'amountMinor' FROM orders WHERE id='${checkedUuid(prepared.id)}';`); expect(stored).toBe('1299'); }
      const fresh = await editor.get(`/api/v1/admin/offers/${single.value.id}`); const value = await fresh.json() as OfferView;
      const reactivated = await editor.post(`/api/v1/admin/offers/${single.value.id}/activate`, { headers: await commerceHeaders(editor, actor, fresh.headers().etag), data: { reason: 'Explicit isolated reactivation still needs current editorial selection' } }); expect(reactivated.status()).toBe(200);
      await page.goto(courseHref(fixture, 'fr')); await expect(page.locator(`[data-course-offer="${single.value.id}"]`)).toHaveCount(0);
      await approveShowcaseOffer(editor, { value: await reactivated.json() as OfferView, etag: reactivated.headers().etag });
      const detail = await editor.get(`/api/v1/offers/${single.value.id}?locale=fr`); expect(detail.status()).toBe(200); expect((await detail.json()).price.amountMinor).toBe(4599);
      await page.goto(`${offersPath('fr')}?resourceId=${course.value.resourceId}&versionId=${course.value.versionId}`);
      await expect(page.locator(`[data-offer-id="${single.value.id}"]`)).toContainText(commerceMoney({ amountMinor: 4599, currency: 'EUR' }, 'fr')!);
      for (const prepared of preparedOrders) expect(commerceSql(`SELECT snapshot_json->'total'->>'amountMinor' FROM orders WHERE id='${checkedUuid(prepared.id)}';`)).toBe('1299');
      await capture(page, 'reapproved-new-price-original-snapshots-fr-390', true);
      observations.push({ check: 'inactive-and-revised-offers', inactiveOfferId: inactiveOffer.value.id, changedOfferId: single.value.id, oldRevision: single.value.revision, newRevision: value.revision + 1, newPriceMinor: 4599, changedDisappearsUntilCurrentApproval: true, oldOrderSnapshotsPreserved: true, otherIds: [pack.value.id, fourth.value.id] });
    });

    test('a free first lesson never proves course access; a real temporary test origin resumes then expires', async ({ page, context }) => {
      const locale = 'fr', t = getMemberAccessDictionary(locale), course = courseRecord(fixture, 'course-client-proposal', locale).value;
      const account = await methodLearner(context.request, locale); await loginMethodAccount(context.request, account);
      const headers = { ...await csrfHeaders(context.request), 'X-Account-Context': account.id };
      const enrolled = await context.request.post('/api/v1/me/enrollments', { headers, data: { courseResourceId: course.resourceId, courseVersionId: course.versionId, locale } }); expect([200, 201]).toContain(enrolled.status());
      const enrollment = await enrolled.json() as EnrollmentView;
      const free = courseRecord(fixture, 'activity-m01', locale).value;
      expect((await context.request.get(`/api/v1/me/resources/${free.resourceId}/versions/${free.versionId}?locale=${locale}`)).status()).toBe(200);
      expect((await context.request.get(`/api/v1/me/resources/${course.resourceId}/versions/${course.versionId}?locale=${locale}`)).status()).toBe(403);
      await page.goto(courseHref(fixture, locale)); const access = page.locator('[data-course-member-access]');
      await expect(access.getByText(t.unavailable, { exact: true })).toBeVisible(); await expect(access.getByRole('link', { name: t.resume, exact: true })).toHaveCount(0); await expect(access.getByRole('button', { name: t.start, exact: true })).toHaveCount(0);
      await capture(page, 'connected-free-preview-no-course-right-fr-1440', true);
      const grantId = randomUUID(); expect(commerceSql(`INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at) VALUES('${grantId}','${checkedUuid(account.id)}','${checkedUuid(course.resourceId)}','${checkedUuid(course.versionId)}','MANUAL_TEST',gen_random_uuid(),'["fr","en"]'::jsonb,'PINNED',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '20 seconds'); SELECT count(*) FROM access_grants WHERE id='${grantId}';`)).toBe('1');
      await page.reload(); await expect(access.getByRole('link', { name: t.resume, exact: true })).toBeVisible();
      const resumeHref = (await access.getByRole('link', { name: t.resume, exact: true }).getAttribute('href'))!;
      await access.getByRole('link', { name: t.resume, exact: true }).click(); expect(new URL(page.url()).pathname).toContain('/fr/');
      const premium = courseRecord(fixture, 'activity-m02', locale).value; const allowed = await context.request.get(`/api/v1/me/resources/${premium.resourceId}/versions/${premium.versionId}?locale=fr`); expect(allowed.status()).toBe(200); expect((await allowed.json() as ResourceDetail).document).not.toBeNull();
      await expect.poll(async () => (await context.request.get(`/api/v1/me/resources/${course.resourceId}/versions/${course.versionId}?locale=fr`)).status(), { timeout: 35000, intervals: [1000, 2000] }).toBe(403);
      await page.goto(courseHref(fixture, locale)); await expect(access.getByText(t.unavailable, { exact: true })).toBeVisible(); await expect(access.getByRole('link', { name: t.resume, exact: true })).toHaveCount(0);
      expect((await context.request.get(`/api/v1/me/resources/${premium.resourceId}/versions/${premium.versionId}?locale=fr`)).status()).toBe(403);
      expect(commerceSql(`SELECT count(*) FROM access_grants WHERE id='${grantId}' AND expires_at<=clock_timestamp() AND revoked_at IS NULL;`)).toBe('1'); await capture(page, 'expired-test-origin-fr-1440', true);
      observations.push({ check: 'access-authority', locale, enrollmentId: enrollment.summary.id, initialFreeActivityReadable: true, freeActivityNeverProvesCourseRight: true, origin: 'MANUAL_TEST', grantId, realProtectedDocumentWithActiveGrant: true, resumeHref, naturalExpiryObserved: true, protectedReadRefusedAfterExpiry: true });
    });
  }
});
