import type { AuthResult } from "./auth-client";
import type { CreateRefundRequest, DecideRefund, PreviewRefund, RefundAction, RefundOperationView, RefundRequestView, ResolveExternalRefund } from "./generated/types.gen";
import type { Locale } from "../i18n/locales";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";
import { isEntitlementPage, isRefundContext, isRefundDecisionResult, isRefundOperationPage, isRefundOperationView, isRefundPreview, isRefundRequestPage, isRefundRequestView, refundOperationEtag, refundOperationStates, refundRequestEtag, refundRequestStates } from "./refunds-validation";
import { validMethodText } from "../methods/validation";

export type RefundQuery = { orderId?: string; page?: number; pageSize?: number };
export type RefundRequestQuery = RefundQuery & { state?: RefundRequestView["state"] };
export type RefundOperationQuery = RefundQuery & { state?: RefundOperationView["state"] };
const prefix = (admin: boolean) => admin ? "/admin" : "/me";
export const refundRequestPath = (requestId: string, admin = false) => `${prefix(admin)}/refund-requests/${id(requestId)}`;
export const refundOperationPath = (operationId: string, admin = false) => `${prefix(admin)}/refunds/${id(operationId)}`;
export const refundContextPath = (orderId: string, admin = false) => `${prefix(admin)}/orders/${id(orderId)}/refund-context`;
export function refundQueryString(query: RefundRequestQuery | RefundOperationQuery = {}, admin = false, operations = false) {
  const params = new URLSearchParams(resourcePagination(query.page ?? 0, query.pageSize ?? 20));
  if (query.orderId !== undefined) params.set("orderId", id(query.orderId));
  if (query.state !== undefined) {
    if (!admin || !(operations ? refundOperationStates : refundRequestStates).some(state => state === query.state)) throw new Error("Invalid refund state filter.");
    params.set("state", query.state);
  }
  return params.toString();
}
export const refundRequestListPath = (query: RefundRequestQuery = {}, admin = false) => `${prefix(admin)}/refund-requests?${refundQueryString(query, admin)}`;
export const refundOperationListPath = (query: RefundOperationQuery = {}, admin = false) => `${prefix(admin)}/refunds?${refundQueryString(query, admin, true)}`;
export const entitlementListPath = (locale: Locale, page = 0, pageSize = 20) => {
  if (locale !== "fr" && locale !== "en") throw new Error("Invalid entitlement locale.");
  return `/me/entitlements?locale=${locale}&${resourcePagination(page, pageSize)}`;
};
export const requestPageGuard = (query: RefundRequestQuery = {}) => matching(isRefundRequestPage, value => value.page === (query.page ?? 0) && value.pageSize === (query.pageSize ?? 20)
  && value.items.every(item => (!query.orderId || item.orderId === query.orderId) && (!query.state || item.state === query.state)));
export const operationPageGuard = (query: RefundOperationQuery = {}) => matching(isRefundOperationPage, value => value.page === (query.page ?? 0) && value.pageSize === (query.pageSize ?? 20)
  && value.items.every(item => (!query.orderId || item.orderId === query.orderId) && (!query.state || item.state === query.state)));
export async function checkedRefundRequest(value: Promise<AuthResult<RefundRequestView>>) { const result = await value; return result.ok && result.etag !== refundRequestEtag(result.data) ? { ok: false as const, error: { kind: "invalid-response" as const, status: result.status } } : result; }
export async function checkedRefundOperation(value: Promise<AuthResult<RefundOperationView>>) { const result = await value; return result.ok && result.etag !== refundOperationEtag(result.data) ? { ok: false as const, error: { kind: "invalid-response" as const, status: result.status } } : result; }
function preconditions(value: string, tag: string, operation: boolean) { if (!new RegExp(`^"refund-${operation ? "operation" : "request"}-${id(value)}-r(?:0|[1-9][0-9]*)${operation ? "-n(?:NONE|PENDING|SENT|ISSUE)-a[01]{4}" : ""}"$`).test(tag)) throw new Error("A matching strong refund revision is required."); }
function action(body: RefundAction): RefundAction { if (!validMethodText(body.reason, 2000, 1) || !body.reason.trim()) throw new Error("A refund action reason is required."); return { reason: body.reason }; }
const cleanAllocations = (values: PreviewRefund["allocations"]) => values.map(item => ({ orderResourceId: id(item.orderResourceId), amountMinor: item.amountMinor, accessAction: item.accessAction }));
const sameAllocations = (left: PreviewRefund["allocations"], right: PreviewRefund["allocations"]) => left.length === right.length && left.every(item => right.some(other => other.orderResourceId === item.orderResourceId && other.amountMinor === item.amountMinor && other.accessAction === item.accessAction));

export const getRefundContext = (orderId: string, admin = false) => readResourceJson(refundContextPath(orderId, admin), matching(isRefundContext, value => value.orderId === orderId));
export const listRefundRequests = (query: RefundRequestQuery = {}, admin = false) => readResourceJson(refundRequestListPath(query, admin), requestPageGuard(query));
export const getRefundRequest = (requestId: string, admin = false) => checkedRefundRequest(readResourceJson(refundRequestPath(requestId, admin), matching(isRefundRequestView, value => value.id === requestId)));
export const listRefundOperations = (query: RefundOperationQuery = {}, admin = false) => readResourceJson(refundOperationListPath(query, admin), operationPageGuard(query));
export const getRefundOperation = (operationId: string, admin = false) => checkedRefundOperation(readResourceJson(refundOperationPath(operationId, admin), matching(isRefundOperationView, value => value.id === operationId)));
export const listEntitlements = (locale: Locale, page = 0, pageSize = 20) => readResourceJson(entitlementListPath(locale, page, pageSize), matching(isEntitlementPage, value => value.page === page && value.pageSize === pageSize));
export const createRefundRequest = (orderId: string, body: CreateRefundRequest, key: string, accountContext: string) => checkedRefundRequest(mutateResourceJson(`/me/orders/${id(orderId)}/refund-requests`, action(body), accountContext, matching(isRefundRequestView, value => value.orderId === orderId && value.reason === body.reason), [200, 201], { idempotencyKey: key }));
export function previewRefund(requestId: string, tag: string, body: PreviewRefund, accountContext: string) {
  preconditions(requestId, tag, false);
  return mutateResourceJson(`${refundRequestPath(requestId, true)}/preview`, { amountMinor: body.amountMinor, allocations: cleanAllocations(body.allocations) }, accountContext,
    matching(isRefundPreview, value => value.requestId === requestId && `"refund-request-${value.requestId}-r${value.requestRevision}"` === tag && value.amountMinor === body.amountMinor && sameAllocations(value.allocations, body.allocations)), [200], { etag: tag });
}
export function decideRefund(requestId: string, tag: string, body: DecideRefund, key: string, accountContext: string) {
  preconditions(requestId, tag, false); action(body);
  const command = { outcome: body.outcome, reason: body.reason, previewFingerprint: body.previewFingerprint, amountMinor: body.amountMinor, allocations: cleanAllocations(body.allocations) };
  return mutateResourceJson(`${refundRequestPath(requestId, true)}/decision`, command, accountContext, matching(isRefundDecisionResult, value => value.request.id === requestId && value.request.decision?.outcome === body.outcome && value.request.decision.reason === body.reason && value.request.decision.amountMinor === body.amountMinor && sameAllocations(value.request.decision.allocations, body.allocations)), [200], { etag: tag, idempotencyKey: key });
}
function operationAction(operationId: string, tag: string, suffix: "execute" | "cancel" | "reconciliation-requests", body: RefundAction, key: string, accountContext: string) {
  preconditions(operationId, tag, true);
  return checkedRefundOperation(mutateResourceJson(`${refundOperationPath(operationId, true)}/${suffix}`, action(body), accountContext, matching(isRefundOperationView, value => value.id === operationId), suffix === "execute" ? [200, 202] : suffix === "reconciliation-requests" ? [202] : [200], { etag: tag, idempotencyKey: key }));
}
export const executeRefund = (operationId: string, tag: string, body: RefundAction, key: string, accountContext: string) => operationAction(operationId, tag, "execute", body, key, accountContext);
export const cancelRefund = (operationId: string, tag: string, body: RefundAction, key: string, accountContext: string) => operationAction(operationId, tag, "cancel", body, key, accountContext);
export const reconcileRefund = (operationId: string, tag: string, body: RefundAction, key: string, accountContext: string) => operationAction(operationId, tag, "reconciliation-requests", body, key, accountContext);
export function decideExternalRefundAccess(operationId: string, tag: string, body: ResolveExternalRefund, key: string, accountContext: string) {
  preconditions(operationId, tag, true); action(body);
  return checkedRefundOperation(mutateResourceJson(`${refundOperationPath(operationId, true)}/access-decision`, { reason: body.reason, allocations: cleanAllocations(body.allocations) }, accountContext, matching(isRefundOperationView, value => value.id === operationId), [200], { etag: tag, idempotencyKey: key }));
}
