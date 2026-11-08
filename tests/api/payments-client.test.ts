import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import type { CheckoutAccess, OrderPaymentStatus, ResourceDetail } from "../../apps/web/src/lib/api/generated/types.gen";
import { getMemberResource } from "../../apps/web/src/lib/api/member-content-client";
import { isMemberResourceDetail } from "../../apps/web/src/lib/api/member-content-validation";
import { createCheckout, getOrderPaymentStatus } from "../../apps/web/src/lib/api/payments-client";
import { isCheckoutAccess, isOrderPaymentStatus } from "../../apps/web/src/lib/api/payments-validation";
import { isResourceDetail } from "../../apps/web/src/lib/api/public-validation";
import { isStripeCheckoutUrl } from "../../apps/web/src/lib/commerce/checkout";
import { checkoutIntent, paymentOutcome } from "../../apps/web/src/lib/commerce/payment-state";
import { orderStatusPath, safeCommerceDestination, translateCommerceDestination } from "../../apps/web/src/lib/commerce/routes";
import { safeReturnTo } from "../../apps/web/src/lib/auth/routes";

// Controlled unit replies exercise browser-client boundaries, not Stripe or PG.
const originalFetch = globalThis.fetch, orderId = randomUUID(), actor = randomUUID(), operationId = randomUUID();
const csrf = { token: "unit-only-payment-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const open = (): CheckoutAccess => ({ orderId, operationId, state: "OPEN", url: "https://checkout.stripe.com/c/pay/synthetic-unit-only#test", expiresAt: "2026-11-08T20:00:00Z", retryAfterSeconds: null, unavailableReason: null });
const status = (): OrderPaymentStatus => ({ orderId, orderRevision: 1, orderStatus: "PREPARED", paymentStatus: "NOT_STARTED", fulfillmentStatus: "NOT_STARTED", checkoutState: "NONE", checkoutAvailable: false, checkoutUnavailableReason: "PAYMENT_NOT_CONFIGURED", sessionExpiresAt: null, canRetry: false, notificationStatus: "NONE" });
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("Checkout accepts only the exact HTTPS Stripe origin and an expiring scoped link", () => {
  assert.equal(isStripeCheckoutUrl(open().url), true);
  const checkoutPrefix = "https://checkout.stripe.com/c/pay/", boundedLink = checkoutPrefix + "a".repeat(4096 - checkoutPrefix.length);
  assert.equal(isStripeCheckoutUrl(boundedLink), true);
  assert.equal(isStripeCheckoutUrl(boundedLink + "a"), false);
  assert.equal(isCheckoutAccess({ ...open(), url: boundedLink }), true);
  assert.equal(isCheckoutAccess({ ...open(), url: boundedLink + "a" }), false);
  for (const value of ["http://checkout.stripe.com/test", "https://checkout.stripe.com.evil.invalid/test", "https://checkout.stripe.com@evil.invalid/test", "https://checkout.stripe.com:444/test", "https://checkout.stripe.com\\evil.invalid/test", "//checkout.stripe.com/test", "http://127.0.0.1:1234/pay", "https://checkout.stripe.com/test\n"]) assert.equal(isStripeCheckoutUrl(value), false);
  assert.equal(isCheckoutAccess(open()), true);
  assert.equal(isCheckoutAccess({ ...open(), retryAfterSeconds: 300 }), true);
  assert.equal(isCheckoutAccess({ ...open(), retryAfterSeconds: 301 }), false);
  for (const value of [{ ...open(), operationId: null }, { ...open(), expiresAt: null }, { ...open(), state: "UNKNOWN" }, { ...open(), url: "https://evil.invalid/pay" }]) assert.equal(isCheckoutAccess(value), false);
  // A concurrent provider completion can leave OPEN with no reusable URL.
  assert.equal(isCheckoutAccess({ ...open(), url: null, unavailableReason: "PAYMENT_PENDING" }), true);
});

test("return parameters never confirm payment or activation and email incidents do not remove ready access", () => {
  assert.equal(isOrderPaymentStatus(status()), true);
  assert.equal(paymentOutcome(status()), "awaiting");
  const paid: OrderPaymentStatus = { ...status(), orderStatus: "CONFIRMED", paymentStatus: "PAID", fulfillmentStatus: "PENDING", checkoutState: "COMPLETE" };
  assert.equal(paymentOutcome(paid), "activation");
  assert.equal(paymentOutcome({ ...paid, fulfillmentStatus: "READY", notificationStatus: "ISSUE" }), "ready");
  assert.equal(paymentOutcome({ ...paid, fulfillmentStatus: "NEEDS_REVIEW" }), "review");
  assert.equal(paymentOutcome({ ...status(), paymentStatus: "UNKNOWN", checkoutState: "UNKNOWN" }), "processing");
  assert.equal(paymentOutcome({ ...status(), paymentStatus: "FAILED" }), "failed");
  for (const value of [{ ...status(), checkoutState: null }, { ...status(), paymentStatus: ["PAID"] }, { ...status(), checkoutAvailable: "true" }, { ...status(), sessionUrl: open().url }]) assert.equal(isOrderPaymentStatus(value), false);
  const returned = orderStatusPath("fr", orderId, "success");
  assert.equal(safeReturnTo(returned, "fr"), returned); assert.equal(translateCommerceDestination(returned, "en"), orderStatusPath("en", orderId, "success"));
  for (const suffix of ["?checkout=success&paid=true", "?checkout=success&checkout=cancel", "?checkout=https://evil.invalid", "?session_id=synthetic", "#paid"]) assert.equal(safeCommerceDestination(orderStatusPath("fr", orderId) + suffix, "fr"), null);
});

test("an ambiguous Checkout POST never auto-retries and an explicit retry preserves body, account and idempotency key", async () => {
  const attempt = checkoutIntent(null, orderId, actor, "synthetic-terms-v1", randomUUID), writes: Array<{ path: string; body: string; key: string | null; context: string | null; tag: string | null }> = [];
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(csrf);
    const headers = new Headers(init?.headers); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    writes.push({ path: String(path), body: String(init?.body), key: headers.get("Idempotency-Key"), context: headers.get("X-Account-Context"), tag: headers.get("If-Match") });
    if (writes.length === 1) throw new TypeError("Synthetic ambiguous transport failure.");
    return Response.json(open());
  };
  assert.equal((await createCheckout(orderId, `"order-${orderId}-r1"`, { acceptedTermsVersion: attempt.terms }, attempt.key, attempt.accountId)).ok, false);
  assert.equal(writes.length, 1);
  const retry = checkoutIntent(attempt, orderId, actor, attempt.terms, () => { throw new Error("Explicit retry must preserve its key."); });
  assert.equal((await createCheckout(orderId, `"order-${orderId}-r2"`, { acceptedTermsVersion: retry.terms }, retry.key, retry.accountId)).ok, true);
  assert.equal(writes[0].key, writes[1].key); assert.equal(writes[0].body, writes[1].body); assert.equal(writes[1].tag, `"order-${orderId}-r2"`); assert.equal(writes[1].context, actor);
  assert.notEqual(checkoutIntent(attempt, orderId, randomUUID(), attempt.terms, randomUUID).key, attempt.key);
  await assert.rejects(createCheckout(orderId, `W/"order-${orderId}-r1"`, { acceptedTermsVersion: attempt.terms }, attempt.key, actor));
});

test("Checkout and status responses must match the requested order and preserve distinct malformed/transport failures", async () => {
  globalThis.fetch = async (path) => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json({ ...open(), orderId: randomUUID() });
  const result = await createCheckout(orderId, `"order-${orderId}-r1"`, { acceptedTermsVersion: "synthetic-v1" }, randomUUID(), actor);
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "invalid-response");
  globalThis.fetch = async () => Response.json({ ...status(), orderId: randomUUID() }); assert.equal((await getOrderPaymentStatus(orderId)).ok, false);
  globalThis.fetch = async () => { throw new TypeError("Synthetic unavailable transport."); };
  const unavailable = await getOrderPaymentStatus(orderId); assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.error.kind, "unavailable");
});

test("offer, terms and revision conflicts remain explicit refusals without an automatic Checkout retry", async () => {
  for (const [httpStatus, code] of [[409, "OFFER_CHANGED"], [409, "TERMS_CHANGED"], [412, "REVISION_CONFLICT"]] as const) {
    clearCsrfToken(); let writes = 0;
    globalThis.fetch = async (path) => {
      if (path === "/api/v1/auth/csrf") return Response.json(csrf);
      writes++;
      return Response.json({ type: "about:blank", title: "Review required", status: httpStatus, detail: "Safe synthetic checkout refusal.", instance: `/api/v1/me/orders/${orderId}/checkout`, code, traceId: randomUUID() }, { status: httpStatus, headers: { "Content-Type": "application/problem+json" } });
    };
    const value = await createCheckout(orderId, `"order-${orderId}-r1"`, { acceptedTermsVersion: "synthetic-terms-v1" }, randomUUID(), actor);
    assert.equal(writes, 1); assert.equal(value.ok, false);
    if (!value.ok) { assert.equal(value.error.kind, "http"); assert.equal(value.error.status, httpStatus); assert.equal("problem" in value.error && value.error.problem?.code, code); }
  }
});

test("the member projection allows only an authorized expurgated body, while the public projection stays closed", async () => {
  const value: ResourceDetail = { resourceId: randomUUID(), kind: "ACTIVITY", versionId: randomUUID(), versionNumber: 1, locale: "en", slug: "synthetic-member-activity", availability: "PUBLISHED", revisionId: randomUUID(), title: "Synthetic unit content", summary: "Synthetic unit content only", access: "PROTECTED", document: { objective: "Synthetic objective", expectedResult: "Synthetic result", prerequisites: [], blocks: [], estimatedMinutes: null, exerciseInstructions: "Synthetic instructions", quiz: [{ key: "q1", prompt: "Synthetic question", options: ["A", "B"], points: 1 }], rubric: [], access: "PROTECTED", media: [], relatedResourceIds: [], methodDefinition: null, quizPolicy: null, projectPolicy: null }, metadata: { goalCodes: [], level: null, audience: [], tools: [], sources: [], faq: [], evaluationDescription: null }, reviewedAt: "2026-11-08T00:00:00Z", languages: [{ locale: "en", status: "PUBLISHED", slug: "synthetic-member-activity" }], curriculum: [], related: [], objective: "Synthetic objective", expectedResult: "Synthetic result", prerequisites: [], estimatedMinutes: null };
  assert.equal(isMemberResourceDetail(value), true); assert.equal(isResourceDetail(value), false);
  for (const body of [{ ...value.document, correction: "Not permitted" }, { ...value.document, quiz: [{ ...value.document!.quiz[0], correctOption: 0 }] }]) assert.equal(isMemberResourceDetail({ ...value, document: body }), false);
  assert.equal(isMemberResourceDetail({ ...value, availability: "WITHDRAWN" }), false);
  globalThis.fetch = async (_path, init) => { assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); return Response.json(value); };
  assert.equal((await getMemberResource(value.resourceId, value.versionId, "en")).ok, true);
  globalThis.fetch = async () => Response.json({ ...value, versionId: randomUUID() }); assert.equal((await getMemberResource(value.resourceId, value.versionId, "en")).ok, false);
});
