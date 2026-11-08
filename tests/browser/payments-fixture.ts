import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import type { CheckoutAccess, OrderPaymentStatus, OrderView } from '../../apps/web/src/lib/api/generated/types.gen';
import { ordersPath } from '../../apps/web/src/lib/commerce/routes';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { commerceHeaders, commerceSql, checkedUuid, createFixtureOffer, prepareOrder, type CommerceSources } from './commerce-fixture';
import { methodLearner, loginMethodAccount } from './methods-fixture';
import { controlPayment } from './control';
import { learningActivityHref } from './learning-fixture';
import { isLearningActivity, isVisitView } from '../../apps/web/src/lib/api/learning-validation';
import { isMemberResourceDetail } from '../../apps/web/src/lib/api/member-content-validation';

export type PaymentLocale = 'fr' | 'en';
export async function preparePaymentFixture(request: APIRequestContext, editor: APIRequestContext, sources: CommerceSources, locale: PaymentLocale = 'fr') {
  const owner = await methodLearner(request, locale); await loginMethodAccount(request, owner);
  const offer = await createFixtureOffer(editor, sources.actor, [sources.learning.course.fr]);
  const order = await prepareOrder(request, owner.id, offer.value, locale);
  return { owner, offer, order, locale };
}
export type PaymentFixture = Awaited<ReturnType<typeof preparePaymentFixture>>;

export async function createPaymentCheckout(request: APIRequestContext, fixture: PaymentFixture, key = randomUUID()) {
  const current = await request.get(`/api/v1/me/orders/${fixture.order.value.id}`); expect(current.status()).toBe(200);
  const response = await request.post(`/api/v1/me/orders/${fixture.order.value.id}/checkout`, {
    headers: { ...await commerceHeaders(request, fixture.owner.id, current.headers().etag), 'Idempotency-Key': key },
    data: { acceptedTermsVersion: fixture.order.value.acceptedTermsVersion },
  });
  expect(response.status()).toBe(200); const value = await response.json() as CheckoutAccess;
  expect(value.state).toBe('OPEN'); expect(typeof value.url === 'string' && new URL(value.url).origin === 'https://checkout.stripe.com').toBe(true);
  return { value, key };
}

/** Intercept the synthetic hosted URL: no browser request or card is sent to Stripe. */
export async function openPaymentCheckoutUi(page: Page, fixture: PaymentFixture, validateConsent = false) {
  const t = getPaymentDictionary(fixture.locale);
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><body><main data-testid="controlled-hosted-payment">Controlled local transport — no external payment or card form.</main></body></html>' }));
  await page.goto(ordersPath(fixture.locale, fixture.order.value.id));
  const open = page.getByRole('button', { name: t.openCheckout, exact: true }); await expect(open).toBeEnabled();
  if (validateConsent) { await open.click(); await expect(page.getByText(t.termsRequired, { exact: true })).toBeVisible(); expect(paymentCount(fixture.order.value.id, 'operations')).toBe(0); }
  await page.getByRole('checkbox', { name: t.terms, exact: true }).check();
  const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/me/orders/${fixture.order.value.id}/checkout`);
  await open.click(); const response = await reply; expect(response.status()).toBe(200);
  await expect(page.getByTestId('controlled-hosted-payment')).toBeVisible();
  // Chromium can discard the POST body after the app navigates. Query the real
  // owner status instead of racing navigation or intercepting the product reply.
  expect(page.url().startsWith('https://checkout.stripe.com/c/pay/')).toBe(true);
  const result = await paymentStatus(page.context().request, fixture.order.value.id);
  expect(result.checkoutState).toBe('OPEN'); expect(result.paymentStatus).toBe('REQUIRES_PAYMENT');
  await page.unroute('https://checkout.stripe.com/**');
  return result;
}
export async function paymentStatus(request: APIRequestContext, orderId: string): Promise<OrderPaymentStatus> {
  const response = await request.get(`/api/v1/me/orders/${checkedUuid(orderId)}/payment-status`); expect(response.status()).toBe(200); return await response.json() as OrderPaymentStatus;
}
export async function paymentOrder(request: APIRequestContext, orderId: string): Promise<OrderView> {
  const response = await request.get(`/api/v1/me/orders/${checkedUuid(orderId)}`); expect(response.status()).toBe(200); return await response.json() as OrderView;
}
export async function waitForPayment(request: APIRequestContext, id: string, payment: OrderPaymentStatus['paymentStatus'], fulfillment?: OrderPaymentStatus['fulfillmentStatus']) {
  await expect.poll(async () => { const current = await paymentStatus(request, id); return `${current.paymentStatus}/${fulfillment === undefined ? '' : current.fulfillmentStatus}`; }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(`${payment}/${fulfillment ?? ''}`);
  return await paymentStatus(request, id);
}
export async function advancePayment(order: string, state: 'OPEN' | 'PROCESSING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED', type: string, replay?: string) {
  const result = await controlPayment(checkedUuid(order), state, type, replay); expect(result.status).toBe(200); expect(result.received).toBe(true);
  if (typeof result.eventId !== 'string' || !/^evt_[A-Za-z0-9_]+$/.test(result.eventId)) throw new Error('A safe controlled event reference is required.');
  return result.eventId;
}
export function paymentCount(order: string, kind: 'operations' | 'grants' | 'notifications' | 'events' | 'keys') {
  const id = checkedUuid(order);
  const query = kind === 'operations' ? `SELECT count(*) FROM checkout_operations WHERE order_id='${id}';`
    : kind === 'grants' ? `SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id='${id}';`
      : kind === 'notifications' ? `SELECT count(*) FROM notification_outbox WHERE business_key='access:activated:${id}';`
        : kind === 'keys' ? `SELECT count(*) FROM checkout_idempotency_keys WHERE order_id='${id}';`
          : `SELECT count(*) FROM stripe_event_inbox WHERE object_id=(SELECT session_id FROM checkout_operations WHERE order_id='${id}');`;
  const value = Number(commerceSql(query)); if (!Number.isSafeInteger(value) || value < 0) throw new Error('Payment fixture count was not confirmed.'); return value;
}
export function privatePaymentResource(sources: CommerceSources, locale: PaymentLocale) {
  const value = sources.learning.premium[locale].value;
  return `/api/v1/me/resources/${value.resourceId}/versions/${value.versionId}?locale=${locale}`;
}

function paidLearningDatabase(sources: CommerceSources, locale: PaymentLocale, ownerId: string): unknown {
  try {
    const owner = checkedUuid(ownerId), target = checkedUuid(sources.learning.premium[locale].value.versionId);
    return { available: true, value: JSON.parse(commerceSql(`WITH RECURSIVE paths(grant_id,version_id,depth) AS (
      SELECT g.id,g.version_id,0 FROM access_grants g WHERE g.owner_id='${owner}'
      UNION ALL SELECT p.grant_id,c.child_version_id,p.depth+1 FROM paths p JOIN version_compositions c ON c.parent_version_id=p.version_id WHERE p.depth<2
    ) SELECT jsonb_build_object('accountActive',(SELECT status='ACTIVE' FROM user_accounts WHERE id='${owner}'),'grantCount',(SELECT count(*) FROM access_grants WHERE owner_id='${owner}'),'paths',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'depth',p.depth,'target',p.version_id='${target}','localeIncluded',g.locales @> '["${locale}"]'::jsonb,'started',g.starts_at<=clock_timestamp(),'unexpired',g.expires_at IS NULL OR g.expires_at>clock_timestamp(),'unrevoked',g.revoked_at IS NULL,'originOrder',g.origin_type='ORDER_LINE','resourceActive',r.archived_at IS NULL,'published',t.published_revision_id IS NOT NULL,
      'editorialState',CASE WHEN t.editorial_state IN('DRAFT','TO_REVIEW','READY','PUBLISHED','STALE','ARCHIVED') THEN t.editorial_state ELSE 'UNVERIFIED' END,'sourceCurrent',t.source_translation_id IS NULL OR t.published_source_revision_id=s.current_revision_id,
      'structuredDocument',e.document_json IS NOT NULL,'sourceActive',t.source_translation_id IS NULL OR s.editorial_state NOT IN('ARCHIVED','STALE'),
      'rootCourse',p.depth<>0 OR r.kind='COURSE','rootResourceMatches',p.depth<>0 OR g.resource_id=v.resource_id,
      'rootVersionCovered',p.depth<>0 OR g.version_id=v.id OR(g.version_policy='UPDATES_DURING_PERIOD' AND v.frozen_at>=g.starts_at AND v.frozen_at<=g.updates_until)))
      FROM paths p JOIN access_grants g ON g.id=p.grant_id JOIN pedagogical_versions v ON v.id=p.version_id JOIN learning_resources r ON r.id=v.resource_id LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale='${locale}' LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations s ON s.id=t.source_translation_id),'[]'::jsonb));`)) };
  } catch { return { available: false }; }
}

/** Observe the actual UI requests once; a denial is retained even if a later UI request succeeds. */
export async function openPaidLearningActivity(page: Page, sources: CommerceSources, locale: PaymentLocale, ownerId: string): Promise<void> {
  checkedUuid(ownerId);
  const target = sources.learning.premium[locale].value, expectedMember = new URL(privatePaymentResource(sources, locale), 'https://fixture.invalid').pathname;
  const observations: Array<{ kind: 'member' | 'learning' | 'visit'; status: number; code: string; validContract: boolean; bodyPresent: boolean; secretPresent: boolean; identityMatches: boolean; localeMatches: boolean; active: boolean; published: boolean }> = [];
  const pending = new Set<Promise<void>>();
  let failedResponse = false, snapshotAtFailure: unknown = null, navigationCompleted = false;
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  async function observe(response: Response, kind: 'member' | 'learning' | 'visit') {
    // Snapshot synchronously at the failing headers, before awaiting a body or a later refresh.
    if (response.status() !== 200) { failedResponse = true; snapshotAtFailure ??= paidLearningDatabase(sources, locale, ownerId); }
    const payload: unknown = await response.json().catch(() => null), resource = record(payload) && kind === 'learning' ? payload.resource : payload;
    const body = record(resource) && record(resource.document) ? resource.document : null;
    const code = record(payload) && typeof payload.code === 'string' && /^[A-Z_]{1,64}$/.test(payload.code) ? payload.code : 'NONE';
    const sent: unknown = kind === 'visit' ? response.request().postDataJSON() : null;
    const observation = { kind, status: response.status(), code, validContract: kind === 'visit' ? isVisitView(payload) : kind === 'member' ? isMemberResourceDetail(payload) : isLearningActivity(payload), bodyPresent: body !== null,
      secretPresent: Boolean(body && Array.isArray(body.blocks) && body.blocks.some(block => record(block) && block.text === sources.learning.secret)),
      identityMatches: kind === 'visit' ? record(payload) && payload.activityId === target.resourceId && payload.activityVersionId === target.versionId : record(resource) && resource.resourceId === target.resourceId && resource.versionId === target.versionId,
      localeMatches: kind === 'visit' ? record(sent) && sent.locale === locale : record(resource) && resource.locale === locale, active: kind === 'learning' ? record(payload) && payload.accessStatus === 'ACTIVE' : kind === 'visit' ? response.status() === 200 : response.status() === 200 && body !== null,
      published: record(resource) && resource.availability === 'PUBLISHED' };
    if (!observation.validContract || !observation.identityMatches || !observation.localeMatches || !observation.active || kind !== 'visit' && (!observation.published || !observation.secretPresent)) {
      failedResponse = true; snapshotAtFailure ??= paidLearningDatabase(sources, locale, ownerId);
    }
    if (observations.length < 12) observations.push(observation); else failedResponse = true;
  }
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (response.request().method() === 'POST' && /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/visits$/.test(url.pathname)) {
      const task = observe(response, 'visit').catch(() => { failedResponse = true; snapshotAtFailure ??= paidLearningDatabase(sources, locale, ownerId); });
      pending.add(task); void task.finally(() => pending.delete(task)); return;
    }
    if (response.request().method() !== 'GET' || url.searchParams.get('locale') !== locale) return;
    const kind = url.pathname === expectedMember ? 'member' : /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/activities\/[a-f0-9-]{36}$/.test(url.pathname)
      && url.pathname.endsWith(`/activities/${target.resourceId}`) && url.searchParams.get('activityVersionId') === target.versionId ? 'learning' : null;
    if (!kind) return;
    const task = observe(response, kind).catch(() => { failedResponse = true; snapshotAtFailure ??= paidLearningDatabase(sources, locale, ownerId); });
    pending.add(task); void task.finally(() => pending.delete(task));
  };
  page.on('response', listener);
  try {
    await page.goto(learningActivityHref(sources.learning, locale, sources.learning.premium)); navigationCompleted = true;
    // DOM polling only: no repeat HTTP request, navigation, mock or softened 403 assertion.
    await expect.poll(async () => {
      await Promise.all([...pending]);
      return !failedResponse && observations.some(value => value.kind === 'member') && observations.some(value => value.kind === 'learning') && observations.some(value => value.kind === 'visit')
        && (await page.getByRole('main').innerText()).includes(sources.learning.secret);
    }).toBe(true);
  } catch {
    await Promise.all([...pending]);
    snapshotAtFailure ??= paidLearningDatabase(sources, locale, ownerId);
    let principal: unknown = { available: false };
    try {
      const me = await page.context().request.get('/api/v1/auth/me'), payload: unknown = await me.json().catch(() => null);
      principal = { status: me.status(), expectedOwner: record(payload) && payload.id === ownerId, learningRead: record(payload) && Array.isArray(payload.permissions) && payload.permissions.includes('learning.read') };
    } catch { /* A diagnostic transport failure must not expose its URL or replace the observation. */ }
    throw new Error(`Paid learning observation failed: ${JSON.stringify({ navigationCompleted, failedResponse, observations, principal, database: snapshotAtFailure })}`);
  } finally { page.off('response', listener); await Promise.all([...pending]); }
}
export async function verifyPaymentContent(request: APIRequestContext, sources: CommerceSources, locale: PaymentLocale, allowed: boolean) {
  const member = await request.get(privatePaymentResource(sources, locale));
  if (member.status() !== (allowed ? 200 : 403)) {
    // Never print the member body, session, identity or provider payload. Preserve
    // the failing observation before the supervisor stops its disposable DB.
    const problem: unknown = await member.json().catch(() => null);
    const code = problem && typeof problem === 'object' && 'code' in problem && typeof problem.code === 'string' && /^[A-Z_]{1,64}$/.test(problem.code) ? problem.code : 'UNVERIFIED';
    const me = await request.get('/api/v1/auth/me');
    const principal: unknown = await me.json().catch(() => null);
    let access: unknown = null;
    if (me.status() === 200 && principal && typeof principal === 'object' && 'id' in principal && typeof principal.id === 'string') {
      const actor = checkedUuid(principal.id), target = checkedUuid(sources.learning.premium[locale].value.versionId);
      const permissions = 'permissions' in principal && Array.isArray(principal.permissions) ? principal.permissions : [];
      access = { learningRead: permissions.includes('learning.read'), database: JSON.parse(commerceSql(`WITH RECURSIVE paths(grant_id,version_id,depth) AS (
        SELECT g.id,g.version_id,0 FROM access_grants g WHERE g.owner_id='${actor}'
        UNION ALL SELECT p.grant_id,c.child_version_id,p.depth+1 FROM paths p JOIN version_compositions c ON c.parent_version_id=p.version_id WHERE p.depth<2
      ) SELECT jsonb_build_object('accountActive',(SELECT status='ACTIVE' FROM user_accounts WHERE id='${actor}'),'grantCount',(SELECT count(*) FROM access_grants WHERE owner_id='${actor}'),'paths',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'depth',p.depth,'target',p.version_id='${target}','localeIncluded',g.locales @> '["${locale}"]'::jsonb,'started',g.starts_at<=clock_timestamp(),'unexpired',g.expires_at IS NULL OR g.expires_at>clock_timestamp(),'unrevoked',g.revoked_at IS NULL,'originOrder',g.origin_type='ORDER_LINE','resourceActive',r.archived_at IS NULL,'published',t.published_revision_id IS NOT NULL,'editorialState',t.editorial_state,'sourceCurrent',t.source_translation_id IS NULL OR t.published_source_revision_id=s.current_revision_id))
        FROM paths p JOIN access_grants g ON g.id=p.grant_id JOIN pedagogical_versions v ON v.id=p.version_id JOIN learning_resources r ON r.id=v.resource_id LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale='${locale}' LEFT JOIN content_translations s ON s.id=t.source_translation_id),'[]'::jsonb));`)) };
    }
    throw new Error(`Member access mismatch: ${JSON.stringify({ expected: allowed ? 200 : 403, actual: member.status(), code, meStatus: me.status(), access })}`);
  }
  if (allowed) {
    const body = await member.json() as { document: { blocks: { text: string }[] } | null };
    expect(Boolean(body.document?.blocks.some(block => block.text === sources.learning.secret))).toBe(true);
    expect(JSON.stringify(body).includes('"correctOption"')).toBe(false); expect(JSON.stringify(body).includes('"correction"')).toBe(false);
  }
  const publicRead = await request.get(`/api/v1/contents/${sources.learning.premium[locale].value.resourceId}?locale=${locale}`); expect(publicRead.status()).toBe(200);
  expect((await publicRead.json() as { document: unknown }).document === null).toBe(true);
}
/** Independent concurrent reads must all succeed; a successful later read never replaces a refusal. */
export async function verifyConcurrentPaymentContent(request: APIRequestContext, sources: CommerceSources, locale: PaymentLocale) {
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => verifyPaymentContent(request, sources, locale, true)));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

/** Exercise one persisted session through both transports at once; retain every failed observation. */
export async function verifyPaidLearningOverlap(page: Page, sources: CommerceSources, locale: PaymentLocale, ownerId: string) {
  const results = await Promise.allSettled([
    verifyConcurrentPaymentContent(page.context().request, sources, locale),
    openPaidLearningActivity(page, sources, locale, ownerId),
  ]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

export async function capturePayment(page: Page, name: string, width = 390) {
  await page.setViewportSize({ width, height: 1000 }); await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const skip = page.locator('a[href="#main-content"]'); if (await skip.count()) expect(await skip.first().evaluate(node => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
