import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import type { RefundContext, RefundLine, RefundOperationView, RefundPreview, RefundRequestView } from "../../apps/web/src/lib/api/generated/types.gen";
import { createRefundRequest, decideRefund, executeRefund, getRefundContext, getRefundOperation, previewRefund } from "../../apps/web/src/lib/api/refunds-client";
import { isEntitlementSummary, isRefundDecisionResult, isRefundOperationView, isRefundPreview, refundOperationEtag, refundRequestEtag } from "../../apps/web/src/lib/api/refunds-validation";
import { safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { allocationProposal, initialAllocationDraft } from "../../apps/web/src/lib/refunds/allocations";
import { parseRefundAmount } from "../../apps/web/src/lib/refunds/amount";
import { refundIntent } from "../../apps/web/src/lib/refunds/intent";
import { adminRefundOperationPath, adminRefundsHref, entitlementsPath, orderRefundsPath, safeRefundsDestination } from "../../apps/web/src/lib/refunds/routes";

const originalFetch = globalThis.fetch, actor = randomUUID(), orderId = randomUUID(), requestId = randomUUID(), operationId = randomUUID(), now = "2026-11-08T00:00:00Z";
const csrf = { token: "unit-only-refund-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const line: RefundLine = { orderResourceId: randomUUID(), resourceId: randomUUID(), versionId: randomUUID(), versionNumber: 2, title: "Synthetic unit resource", locales: ["fr", "en"], originRevoked: false };
const allocation = { orderResourceId: line.orderResourceId, amountMinor: 500, accessAction: "KEEP" as const };
function request(): RefundRequestView { return { id: requestId, revision: 0, orderId, state: "REQUESTED", reason: "Synthetic refund request", decision: null, createdAt: now, updatedAt: now }; }
function context(): RefundContext { return { orderId, orderRevision: 4, paymentStatus: "PAID", fulfillmentStatus: "READY", currency: "EUR", paidAmountMinor: 1299, confirmedRefundedMinor: 0, reservedMinor: 0, availableMinor: 1299, reconciliationState: "CURRENT", canRequest: true, requestUnavailableReason: null, lines: [line] }; }
function preview(): RefundPreview { return { requestId, requestRevision: 0, orderId, orderRevision: 4, currency: "EUR", amountMinor: 500, availableMinor: 1299, fullRefund: false, allocations: [allocation], lines: [line], fingerprint: "a".repeat(64) }; }
function operation(): RefundOperationView { return { id: operationId, revision: 1, orderId, requestId, origin: "LOCAL_DECISION", state: "PREPARED", amountMinor: 500, currency: "EUR", allocations: [allocation], accessState: "NOT_APPLIED", lastErrorCode: null, createdAt: now, updatedAt: now, confirmedAt: null, notificationStatus: "NONE", canExecute: true, canCancel: true, canReconcile: false, canDecideAccess: false }; }
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("a learner request contains only its reason and preserves its intention after an ambiguous POST", async () => {
  const body = { reason: request().reason, amountMinor: 999, ownerId: randomUUID(), paymentIntent: "not-allowed" }, attempt = refundIntent(null, `request:${orderId}`, actor, { reason: body.reason }, randomUUID), writes: Array<{ body: string; context: string | null; key: string | null }> = [];
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(csrf);
    const headers = new Headers(init?.headers); assert.equal(headers.get("X-CSRF-TOKEN"), csrf.token); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    writes.push({ body: String(init?.body), context: headers.get("X-Account-Context"), key: headers.get("Idempotency-Key") });
    if (writes.length === 1) throw new TypeError("Synthetic ambiguous transport failure.");
    return Response.json(request(), { status: 201, headers: { ETag: refundRequestEtag(request()) } });
  };
  assert.equal((await createRefundRequest(orderId, body, attempt.key, actor)).ok, false); assert.equal(writes.length, 1);
  const retry = refundIntent(attempt, attempt.target, actor, { reason: body.reason }, () => { throw new Error("A retry must preserve its key."); });
  assert.equal((await createRefundRequest(orderId, body, retry.key, actor)).ok, true); assert.deepEqual(writes[0], writes[1]); assert.deepEqual(JSON.parse(writes[0].body), { reason: body.reason }); assert.equal(writes[0].context, actor);
  assert.notEqual(refundIntent(attempt, attempt.target, randomUUID(), { reason: body.reason }, randomUUID).key, attempt.key);
  assert.notEqual(refundIntent(attempt, attempt.target, actor, { reason: "Changed reason" }, randomUUID).key, attempt.key);
});

test("preview responses must acknowledge the exact request revision and allocation, without retrying a conflict", async () => {
  const source = preview(), body = { amountMinor: source.amountMinor, allocations: source.allocations }, tag = refundRequestEtag(request());
  for (const changed of [{ ...source, requestRevision: 1 }, { ...source, allocations: [{ ...allocation, accessAction: "REVOKE" }] }]) {
    clearCsrfToken(); globalThis.fetch = async path => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json(changed);
    const value = await previewRefund(requestId, tag, body, actor); assert.equal(value.ok, false); if (!value.ok) assert.equal(value.error.kind, "invalid-response");
  }
  let writes = 0;
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(csrf);
    writes++; assert.equal(new Headers(init?.headers).get("If-Match"), tag);
    return Response.json({ type: "about:blank", title: "Review required", status: 412, detail: "Synthetic stale preview.", instance: `/api/v1/admin/refund-requests/${requestId}/preview`, code: "REVISION_CONFLICT", traceId: randomUUID() }, { status: 412, headers: { "Content-Type": "application/problem+json" } });
  };
  const value = await previewRefund(requestId, tag, body, actor); assert.equal(writes, 1); assert.equal(value.ok, false); if (!value.ok) { assert.equal(value.error.kind, "http"); assert.equal(value.error.status, 412); }
  assert.throws(() => previewRefund(requestId, `W/${tag}`, body, actor));
});

test("an approved request is not financial success, and an unknown execution retains unapplied access", async () => {
  const op = operation(), decision = { id: randomUUID(), outcome: "APPROVE" as const, reason: "Synthetic operator decision", amountMinor: 500, allocations: [allocation], operationId, decidedAt: now }, approved = { ...request(), revision: 1, state: "APPROVED" as const, decision }, result = { request: approved, operation: op };
  assert.equal(isRefundDecisionResult(result), true); assert.equal(isRefundDecisionResult({ request: approved, operation: null }), false);
  globalThis.fetch = async path => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json(result);
  const ack = await decideRefund(requestId, refundRequestEtag(request()), { outcome: "APPROVE", reason: decision.reason, amountMinor: 500, allocations: [allocation], previewFingerprint: "a".repeat(64) }, randomUUID(), actor);
  assert.equal(ack.ok, true); if (ack.ok) { assert.equal(ack.data.operation?.state, "PREPARED"); assert.equal(ack.data.operation?.accessState, "NOT_APPLIED"); }
  const unknown: RefundOperationView = { ...op, revision: 2, state: "UNKNOWN", canExecute: false, canCancel: false, canReconcile: true };
  globalThis.fetch = async () => Response.json(unknown, { status: 202, headers: { ETag: refundOperationEtag(unknown) } });
  const executed = await executeRefund(operationId, refundOperationEtag(op), { reason: "Synthetic execution" }, randomUUID(), actor);
  assert.equal(executed.ok, true); if (executed.ok) { assert.equal(executed.data.state, "UNKNOWN"); assert.equal(executed.data.confirmedAt, null); assert.equal(executed.data.accessState, "NOT_APPLIED"); }
});

test("operation ETags cover dynamic permissions and email state; malformed or foreign responses remain distinct from a transport failure", async () => {
  const value = operation(), changed = { ...value, notificationStatus: "ISSUE" as const, canExecute: false };
  assert.notEqual(refundOperationEtag(value), refundOperationEtag(changed));
  globalThis.fetch = async () => Response.json(changed, { headers: { ETag: refundOperationEtag(value) } });
  const stale = await getRefundOperation(operationId, true); assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.kind, "invalid-response");
  globalThis.fetch = async () => Response.json({ ...context(), orderId: randomUUID() }); assert.equal((await getRefundContext(orderId)).ok, false);
  globalThis.fetch = async () => { throw new TypeError("Synthetic transport failure."); }; const unavailable = await getRefundOperation(operationId); assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.error.kind, "unavailable");
  assert.equal(isRefundOperationView({ ...value, state: "SUCCEEDED" }), false); assert.equal(isRefundOperationView({ ...value, state: "FAILED", confirmedAt: now }), true);
  assert.equal(isRefundOperationView({ ...value, lastErrorCode: ["UNKNOWN"] }), false); assert.equal(isRefundOperationView({ ...value, ownerId: actor }), false);
});

test("allocation amounts remain explicit, exact and unpriced, including zero-valued full-refund lines", () => {
  const second = { ...line, orderResourceId: randomUUID(), resourceId: randomUUID() }, draft = initialAllocationDraft([line, second], [], "EUR");
  assert.equal(allocationProposal([line, second], draft, "12.99", "EUR"), null);
  draft[line.orderResourceId] = { selected: true, amount: "12,99", accessAction: "REVOKE" }; draft[second.orderResourceId] = { selected: true, amount: "0", accessAction: "REVOKE" };
  const proposal = allocationProposal([line, second], draft, "12.99", "EUR"); assert.equal(proposal?.amountMinor, 1299); assert.equal(proposal?.allocations[1].amountMinor, 0);
  const full = { ...preview(), amountMinor: 1299, fullRefund: true, lines: [line, second], allocations: proposal!.allocations }; assert.equal(isRefundPreview(full), true);
  assert.equal(isRefundPreview({ ...full, allocations: [full.allocations[0]] }), false); assert.equal(isRefundPreview({ ...full, allocations: [full.allocations[0], { ...full.allocations[1], accessAction: "KEEP" }] }), false); assert.equal(isRefundPreview({ ...full, allocations: [full.allocations[0], full.allocations[0]] }), false);
  assert.equal(parseRefundAmount("90071992547409.91", "EUR"), Number.MAX_SAFE_INTEGER); for (const invalid of ["1e2", "-1", "1 000", "0.001"]) assert.equal(parseRefundAmount(invalid, "EUR"), null);
});

test("refund navigation preserves only allowlisted private routes across language changes", () => {
  const route = adminRefundsHref("fr", { view: "operations", state: "UNKNOWN", orderId, page: 2 });
  assert.equal(safeReturnTo(route, "fr"), route); assert.equal(translateReturnTo(orderRefundsPath("fr", orderId), "en"), orderRefundsPath("en", orderId)); assert.equal(translateReturnTo(entitlementsPath("fr"), "en"), entitlementsPath("en"));
  assert.equal(safeReturnTo(adminRefundOperationPath("fr", operationId), "fr"), adminRefundOperationPath("fr", operationId));
  for (const invalid of [route + "&state=UNKNOWN", "/fr/admin/operations/refunds?view=requests&state=UNKNOWN", "//evil.invalid/fr/compte/acces", "/fr/compte/acces%3fpage=1", orderRefundsPath("fr", orderId) + "?paymentIntent=secret"]) assert.equal(safeRefundsDestination(invalid, "fr"), null);
});

test("access histories can retain another active origin beside a refunded order origin", () => {
  const origin = { id: randomUUID(), originType: "ORDER_LINE", orderId, orderResourceId: line.orderResourceId, resourceId: line.resourceId, versionId: line.versionId, versionNumber: 2, title: line.title, locales: ["fr", "en"], versionPolicy: "PINNED", state: "REVOKED", revokedReason: "REFUND", startsAt: now, expiresAt: null, revokedAt: now };
  assert.equal(isEntitlementSummary(origin), true); assert.equal(isEntitlementSummary({ ...origin, id: randomUUID(), orderId: randomUUID(), orderResourceId: randomUUID(), state: "ACTIVE", revokedReason: null, revokedAt: null }), true);
  assert.equal(isEntitlementSummary({ ...origin, paymentIntent: "not-allowed" }), false);
});
