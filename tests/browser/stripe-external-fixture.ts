import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateOffer, OfferFields, OfferReadiness, OfferView, OrderView } from '../../apps/web/src/lib/api/generated/types.gen';
import { offersPath, ordersPath, orderStatusPath } from '../../apps/web/src/lib/commerce/routes';
import { courseActivityHref, resourceHref } from '../../apps/web/src/lib/public/routes';
import { checkedUuid, commerceHeaders, commerceSql } from './commerce-fixture';
import { createContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { loginEditor } from './editorial-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';
import { publishPublicContent } from './public-content-fixture';

export type StripeExternalFixtureInput = {
  locale: 'fr' | 'en';
  amountMinor: number;
  currency: 'EUR' | 'USD' | 'GBP';
  accessDays: number;
  termsVersion: string;
};

/** No env file, provider request, Checkout creation or process startup occurs here. */
export async function assertStripeExternalFixtureIsolation(requests: APIRequestContext[]): Promise<void> {
  const rawOrigin = process.env.COURSES_BROWSER_ORIGIN;
  if (!rawOrigin || process.env.APP_ENV !== 'test') throw new Error('An explicitly isolated TEST runner is required.');
  const origin = new URL(rawOrigin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== rawOrigin || !origin.port
    || [3000, 8080].includes(Number(origin.port)) || Number(origin.port) < 1024) throw new Error('A dedicated loopback test origin is required.');
  // commerceSql checks the exact container ID and the supervisor ownership label.
  if (commerceSql("SELECT current_database()='courses_browser';") !== 't') throw new Error('The disposable fixture database was not confirmed.');
  const mounted = spawnSync('docker', ['inspect', '--format', '{{ json .Mounts }}', process.env.COURSES_BROWSER_DB_ID!], { windowsHide: true, encoding: 'utf8', timeout: 10_000 });
  let mounts: unknown; try { mounts = JSON.parse(mounted.stdout); } catch { throw new Error('The test data mount could not be verified.'); }
  if (mounted.status !== 0 || !Array.isArray(mounts)
    || !mounts.some(value => value?.Type === 'tmpfs' && value?.Destination === '/var/lib/postgresql')
    || mounts.some(value => typeof value?.Destination === 'string' && value.Destination.startsWith('/var/lib/postgresql') && value.Type !== 'tmpfs')) throw new Error('PostgreSQL fixtures require a tmpfs data mount.');
  for (const request of requests) {
    // Verify the actual immutable request-context base URL before any registration.
    const response = await request.get('/api/v1/system/health');
    const url = new URL(response.url());
    if (url.origin !== origin.origin || url.pathname !== '/api/v1/system/health' || response.status() !== 200) throw new Error('A fixture request context does not target the isolated application.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'UP') throw new Error('The isolated application did not confirm database health.');
  }
}

function validateInput(input: StripeExternalFixtureInput) {
  if (!['fr', 'en'].includes(input.locale) || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1
    || !['EUR', 'USD', 'GBP'].includes(input.currency) || !Number.isInteger(input.accessDays) || input.accessDays < 1 || input.accessDays > 36500
    || !input.termsVersion.trim() || input.termsVersion.length > 100 || input.termsVersion.includes('\0')) throw new Error('Explicit TEST amount, currency, period and terms are required.');
}

/** Creates only disposable local API/DB fixtures. The caller alone opens hosted Stripe TEST. */
export async function createStripeExternalFixture(editorRequest: APIRequestContext, learnerRequest: APIRequestContext, input: StripeExternalFixtureInput) {
  validateInput(input);
  if (editorRequest === learnerRequest) throw new Error('Separate editor and learner request contexts are required.');
  await assertStripeExternalFixtureIsolation([editorRequest, learnerRequest]);
  const editor = await loginEditor(editorRequest), actor = checkedUuid(editor.id), marker = `p12-stripe-test-${randomUUID()}`;
  const role = randomUUID();
  expect(commerceSql(`BEGIN; INSERT INTO roles(id,code) VALUES('${role}','P12_STRIPE_TEST_${role.replaceAll('-', '').toUpperCase()}'); INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('commerce.offers.read','commerce.offers.write','commerce.offers.activate'); INSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}'); COMMIT; SELECT count(*) FROM role_permissions WHERE role_id='${role}';`)).toBe('3');
  const secret = `P12-STRIPE-TEST-PRIVATE-${randomUUID()}`, fr = input.locale === 'fr';
  async function publish(kind: 'ACTIVITY' | 'MODULE' | 'COURSE', children: RecordedContent[] = []) {
    const command = editorialContent(input.locale, 'PROTECTED');
    command.kind = kind; command.slug = `${marker}-${kind.toLowerCase()}`;
    command.title = `STRIPE TEST · ${fr ? 'ressource fictive' : 'fictional resource'} · ${kind}`;
    command.summary = fr ? 'Ressource temporaire de recette Stripe TEST, pas un contenu commercial.' : 'Disposable Stripe TEST verification resource, not commercial learning content.';
    command.childVersionIds = children.map(child => child.value.versionId);
    command.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
    command.reason = 'Explicit disposable Stripe TEST fixture in the supervisor-owned tmpfs database';
    return publishPublicContent(editorRequest, await createContent(editorRequest, command));
  }
  const activity = await publish('ACTIVITY'), module = await publish('MODULE', [activity]), course = await publish('COURSE', [module]);
  const fields: OfferFields = {
    copies: [{ locale: input.locale, title: 'STRIPE TEST · disposable verification offer', summary: fr ? 'Montant fictif de recette TEST uniquement. Aucun tarif commercial.' : 'Fictional TEST verification amount only. No commercial price.' }],
    resources: [{ resourceId: course.value.resourceId, versionId: course.value.versionId }], locales: [input.locale],
    price: { amountMinor: input.amountMinor, currency: input.currency },
    tax: { mode: 'EXEMPT', notices: [{ locale: input.locale, text: fr ? 'Configuration fiscale fictive pour cette recette TEST uniquement.' : 'Fictional tax configuration for this TEST verification only.' }] },
    conditions: { access: { mode: 'FIXED', days: input.accessDays }, updates: { mode: 'NONE', days: null }, versionPolicy: 'PINNED', support: { mode: 'NONE', descriptions: [] }, humanReviewIncluded: false,
      termsVersion: input.termsVersion, terms: [{ locale: input.locale, text: fr ? 'Conditions fictives de recette Stripe TEST, sans vente ni conditions commerciales.' : 'Fictional Stripe TEST verification terms, not a sale or commercial terms.' }] },
  };
  const command: CreateOffer = { code: marker, kind: 'COURSE', fields, reason: 'Explicit disposable Stripe TEST offer; amount supplied by the test operator' };
  const created = await editorRequest.post('/api/v1/admin/offers', { headers: await commerceHeaders(editorRequest, actor), data: command });
  expect(created.status()).toBe(201);
  const draft = await created.json() as OfferView;
  const active = await editorRequest.post(`/api/v1/admin/offers/${checkedUuid(draft.id)}/activate`, { headers: await commerceHeaders(editorRequest, actor, created.headers().etag), data: { reason: 'Explicit activation for hosted Stripe TEST verification only' } });
  expect(active.status()).toBe(200);
  const offer = { value: await active.json() as OfferView, etag: active.headers().etag };
  const ready = await editorRequest.get(`/api/v1/admin/offers/${checkedUuid(offer.value.id)}/readiness`);
  expect(ready.status()).toBe(200);
  const readiness = await ready.json() as OfferReadiness;
  expect(readiness.summaryReady).toBe(true); expect(readiness.checkoutAvailable).toBe(true);

  const owner = await methodLearner(learnerRequest, input.locale); await loginMethodAccount(learnerRequest, owner);
  const key = randomUUID(), prepared = await learnerRequest.post('/api/v1/me/orders', { headers: { ...await commerceHeaders(learnerRequest, owner.id), 'Idempotency-Key': key },
    data: { offerId: offer.value.id, offerRevision: offer.value.revision, locale: input.locale, acceptedTermsVersion: input.termsVersion } });
  expect(prepared.status()).toBe(201);
  const value = await prepared.json() as OrderView, order = { value, etag: prepared.headers().etag, key };
  expect(value.orderStatus).toBe('PREPARED'); expect(value.paymentStatus).toBe('NOT_STARTED'); expect(value.fulfillmentStatus).toBe('NOT_STARTED');
  expect(value.snapshot.total).toEqual(fields.price); expect(value.acceptedTermsVersion).toBe(input.termsVersion);
  expect(order.etag === `"order-${checkedUuid(value.id)}-r${value.revision}"`).toBe(true);
  expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${checkedUuid(owner.id)}';`)).toBe('0');
  // Credentials and the protected marker remain only in the caller's memory.
  // Evidence writers must select safe identifiers/statuses, never serialize this object.
  return { marker, locale: input.locale, actor, owner, secret, activity, module, course, offer, order,
    offerHref: offersPath(input.locale, offer.value.id), summaryHref: ordersPath(input.locale, value.id), statusHref: orderStatusPath(input.locale, value.id),
    courseHref: resourceHref({ ...course.value, locale: input.locale, kind: 'COURSE' }),
    activityHref: courseActivityHref(input.locale, course.value.slug, activity.value.slug, activity.value.resourceId, activity.value.versionId, course.value.versionId),
    memberActivityPath: `/api/v1/me/resources/${activity.value.resourceId}/versions/${activity.value.versionId}?locale=${input.locale}` };
}

export type StripeExternalFixture = Awaited<ReturnType<typeof createStripeExternalFixture>>;
