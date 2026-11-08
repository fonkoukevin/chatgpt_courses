import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { createOrder, getOffer, getOrder, listOffers } from "../../apps/web/src/lib/api/commerce-client";
import type { OrderSummary, OrderView, PublicOffer, PurchaseContext } from "../../apps/web/src/lib/api/generated/types.gen";
import { isPublicOffer } from "../../apps/web/src/lib/api/offers-validation";
import { isOrderView, isPurchaseContext, orderEtag } from "../../apps/web/src/lib/api/orders-validation";
import { commerceMoney } from "../../apps/web/src/lib/commerce/format";
import { orderAcknowledgesOffer, orderIntent } from "../../apps/web/src/lib/commerce/preparation";
import { offersPath, ordersPath, safeCommerceDestination, translateCommerceDestination } from "../../apps/web/src/lib/commerce/routes";

const originalFetch = globalThis.fetch, account = randomUUID(), offerId = randomUUID(), resourceId = randomUUID(), versionId = randomUUID();
const csrf = { token: "unit-only-commerce-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const texts = (text: string) => [{ locale: "fr" as const, text }, { locale: "en" as const, text }];
function offer(): PublicOffer { return { id: offerId, productId: randomUUID(), revision: 3, code: "synthetic-unit-offer", kind: "COURSE", state: "ACTIVE", locale: "fr", translationAvailable: true, title: "Synthetic unit offer", summary: "Synthetic transport verification only", resources: [{ resourceId, versionId, versionNumber: 2, locale: "fr", title: "Synthetic unit course", slug: "synthetic-unit-course", availability: "PUBLISHED", access: "PROTECTED" }], locales: ["fr", "en"], price: { amountMinor: 1299, currency: "EUR" }, tax: { mode: "EXEMPT", notices: texts("Synthetic tax notice; no actual tax claim") }, conditions: { access: { mode: "FIXED", days: 30 }, updates: { mode: "NONE", days: null }, versionPolicy: "PINNED", support: { mode: "NONE", descriptions: [] }, humanReviewIncluded: false, termsVersion: "synthetic-v1", terms: texts("Synthetic unit terms; not commercial terms") }, readiness: { offerId, checkedRevision: 3, summaryReady: true, checkoutAvailable: false, blockingIssues: [], warnings: [], checkoutUnavailableReason: "PAYMENT_NOT_CONFIGURED" } }; }
function order(source = offer()): OrderView { return { id: randomUUID(), revision: 0, orderStatus: "PREPARED", paymentStatus: "NOT_STARTED", fulfillmentStatus: "NOT_STARTED", snapshot: { offerId: source.id, offerRevision: source.revision, offerRevisionId: randomUUID(), code: source.code, kind: source.kind, locale: source.locale, title: source.title!, resources: source.resources.map((item) => ({ id: randomUUID(), resourceId: item.resourceId, versionId: item.versionId, versionNumber: item.versionNumber, title: item.title!, slug: item.slug!, locales: [...source.locales] })), locales: [...source.locales], total: source.price!, tax: source.tax!, conditions: source.conditions! }, acceptedTermsVersion: source.conditions!.termsVersion!, acceptedAt: "2026-11-08T00:00:00Z", createdAt: "2026-11-08T00:00:00Z", expiresAt: "2026-11-08T00:30:00Z" }; }
function summary(value: OrderView): OrderSummary { return { id: value.id, revision: value.revision, offerId: value.snapshot.offerId, offerRevision: value.snapshot.offerRevision, locale: value.snapshot.locale, title: value.snapshot.title, total: value.snapshot.total, orderStatus: value.orderStatus, paymentStatus: value.paymentStatus, fulfillmentStatus: value.fulfillmentStatus, createdAt: value.createdAt, expiresAt: value.expiresAt }; }
function purchase(source = offer()): PurchaseContext { return { offer: source, activeOrder: null, coverage: { status: "NONE", alreadyAccessibleCount: 0, newResourceCount: source.resources.length, resources: source.resources.map((item) => ({ resourceId: item.resourceId, versionId: item.versionId, coveredLocales: [], missingLocales: [...source.locales], alreadyAccessible: false })) } }; }
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("les paramètres absents restent présentables sans accepter une réponse contradictoire ou privée", () => {
  const draft = offer(); draft.state = "INACTIVE"; draft.price = null; draft.tax = { mode: null, notices: [] }; draft.conditions = { access: { mode: null, days: null }, updates: null, versionPolicy: null, support: { mode: null, descriptions: [] }, humanReviewIncluded: false, termsVersion: "", terms: [] }; draft.readiness.summaryReady = false; draft.readiness.blockingIssues = [{ code: "PRICE_REQUIRED", field: "price", resourceId: null, locale: null }]; draft.readiness.checkoutUnavailableReason = "OFFER_INACTIVE";
  assert.equal(isPublicOffer(draft), true);
  for (const value of [{ ...draft, ownerId: account }, { ...draft, readiness: { ...draft.readiness, summaryReady: true } }, { ...offer(), price: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "EUR" } }, { ...offer(), tax: { mode: ["EXEMPT"], notices: [] } }]) assert.equal(isPublicOffer(value), false);
  const saved = order(); assert.equal(isOrderView(saved), true); assert.equal(isOrderView({ ...saved, paymentStatus: "UNKNOWN_PAYMENT" }), false); assert.equal(isOrderView({ ...saved, acceptedTermsVersion: "different-terms" }), false);
});

test("une langue non vendue et une ancienne préparation restent des projections valides, sans fausse couverture", () => {
  const fr = offer(); fr.locales = ["fr"]; const en = { ...fr, locale: "en" as const, translationAvailable: false, title: null, summary: null, resources: fr.resources.map((item) => ({ ...item, locale: "en" as const, title: null, slug: null, availability: "TRANSLATION_MISSING" as const, access: null })) };
  assert.equal(isPublicOffer(en), true);
  const context = purchase(); const old = order(context.offer); old.snapshot.offerRevision--; old.snapshot.locale = "en"; context.activeOrder = summary(old); assert.equal(isPurchaseContext(context), true);
  const bundle = offer(); bundle.kind = "PACK"; bundle.resources.push({ ...bundle.resources[0], resourceId: randomUUID(), versionId: randomUUID() }); const both = purchase(bundle); assert.equal(isPurchaseContext(both), true);
  const repeatedA = { ...both, coverage: { ...both.coverage, resources: [both.coverage.resources[0], both.coverage.resources[0]] } }; assert.equal(isPurchaseContext(repeatedA), false);
  assert.equal(isPurchaseContext({ ...both, activeOrder: { ...summary(order()), offerId: randomUUID() } }), false);
  const unconfigured = offer(); unconfigured.state = "INACTIVE"; unconfigured.locales = []; unconfigured.readiness.summaryReady = false; unconfigured.readiness.blockingIssues = [{ code: "LOCALES_REQUIRED", field: "locales", locale: null, resourceId: null }]; assert.equal(isPurchaseContext(purchase(unconfigured)), true);
});

test("une commande confirmée conserve son intention sans invalider la couverture acquise", () => {
  const context = purchase(), paid = order(context.offer);
  paid.orderStatus = "CONFIRMED"; paid.paymentStatus = "PAID"; paid.fulfillmentStatus = "READY";
  context.activeOrder = summary(paid);
  context.coverage = { status: "ALL", alreadyAccessibleCount: context.offer.resources.length, newResourceCount: 0, resources: context.offer.resources.map((item) => ({ resourceId: item.resourceId, versionId: item.versionId, coveredLocales: [...context.offer.locales], missingLocales: [], alreadyAccessible: true })) };
  assert.equal(isPurchaseContext(context), true);
  assert.equal(isPurchaseContext({ ...context, activeOrder: { ...context.activeOrder, offerId: randomUUID() } }), false);
  for (const orderStatus of ["EXPIRED", "CANCELLED"] as const) assert.equal(isPurchaseContext({ ...context, activeOrder: { ...context.activeOrder, orderStatus } }), false);
});

test("le montant mineur proche de MAX_SAFE_INTEGER garde exactement ses centimes et sa devise connue", () => {
  assert.equal(commerceMoney({ amountMinor: Number.MAX_SAFE_INTEGER, currency: "EUR" }, "en"), "€90,071,992,547,409.91");
  assert.equal(commerceMoney({ amountMinor: 1299, currency: "USD" }, "en"), "US$12.99");
  assert.equal(commerceMoney({ amountMinor: 0, currency: "EUR" }, "en"), "€0.00");
  assert.equal(commerceMoney({ amountMinor: 1299, currency: "JPY" }, "en"), null); assert.equal(commerceMoney(null, "fr"), null);
});

test("une réponse ambiguë garde clé et corps de l'intention explicite ; révision ou compte différent exige une autre clé", async () => {
  const source = offer(), value = order(source), command = { offerId, offerRevision: source.revision, locale: "fr" as const, acceptedTermsVersion: "synthetic-v1" };
  const attempt = orderIntent(null, command, account, randomUUID); let sent = 0; const writes: Array<{ key: string | null; body: string; account: string | null }> = [];
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(csrf);
    sent++; const headers = new Headers(init?.headers); writes.push({ key: headers.get("Idempotency-Key"), body: String(init?.body), account: headers.get("X-Account-Context") });
    if (sent === 1) throw new TypeError("Synthetic ambiguous transport failure.");
    return Response.json(value, { headers: { ETag: orderEtag(value) } });
  };
  assert.equal((await createOrder(attempt.body, attempt.key, account)).ok, false); assert.equal(sent, 1);
  const explicitRetry = orderIntent(attempt, command, account, () => { throw new Error("The same intention must reuse its existing key."); });
  assert.equal((await createOrder(explicitRetry.body, explicitRetry.key, account)).ok, true); assert.deepEqual(writes[0], writes[1]);
  assert.notEqual(orderIntent(attempt, { ...command, offerRevision: 4 }, account, randomUUID).key, attempt.key); assert.notEqual(orderIntent(attempt, command, randomUUID(), randomUUID).key, attempt.key);
  assert.equal(orderAcknowledgesOffer(value, source), true); assert.equal(orderAcknowledgesOffer({ ...value, snapshot: { ...value.snapshot, total: { amountMinor: 999, currency: "EUR" } } }, source), false);
});

test("les lectures publiques omettent la session et les commandes exigent leur identité et leur ETag exacts", async () => {
  const source = offer(); globalThis.fetch = async (_path, init) => { assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store"); return Response.json(source); };
  assert.equal((await getOffer(offerId, "fr")).ok, true);
  globalThis.fetch = async () => Response.json({ ...source, id: randomUUID() }); assert.equal((await getOffer(offerId, "fr")).ok, false);
  globalThis.fetch = async () => Response.json({ items: [{ ...source, state: "DRAFT" }], page: 0, pageSize: 20, total: 1 }); assert.equal((await listOffers("fr")).ok, false);
  const value = order(); for (const tag of [undefined, `W/${orderEtag(value)}`, `"order-${randomUUID()}-r0"`]) { globalThis.fetch = async () => Response.json(value, { headers: tag ? { ETag: tag } : {} }); assert.equal((await getOrder(value.id)).ok, false); }
  globalThis.fetch = async () => Response.json(value, { headers: { ETag: orderEtag(value) } }); assert.equal((await getOrder(value.id)).ok, true);
});

test("le retour d'identification conserve l'offre ou le récapitulatif exact sans URL libre", () => {
  for (const language of ["fr", "en"] as const) { assert.equal(safeCommerceDestination(offersPath(language, offerId), language), offersPath(language, offerId)); assert.equal(safeCommerceDestination(ordersPath(language, account), language), ordersPath(language, account)); }
  assert.equal(translateCommerceDestination(ordersPath("fr", account), "en"), ordersPath("en", account));
  for (const path of ["https://example.invalid/fr/offres", "//example.invalid/fr/offres", "/fr/offres/%2e%2e", `/fr/offres/${offerId}?amount=1`, "/fr/commandes?page=1&page=2", "/fr/commandes?pageSize=101", `/fr/commandes/${account}/recapitulatif#fragment`]) assert.equal(safeCommerceDestination(path, "fr"), null);
});
