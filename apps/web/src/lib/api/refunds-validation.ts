import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { commerceExact as exact, commerceInteger as integer, commerceInstant as instant, commerceLocales as locales } from "./offers-validation";
import { commerceCurrencyScale } from "../commerce/format";
import { validMethodText } from "../methods/validation";
import type { EntitlementPage, EntitlementSummary, RefundAllocation, RefundContext, RefundDecisionResult, RefundDecisionView, RefundLine, RefundOperationPage, RefundOperationView, RefundPreview, RefundRequestPage, RefundRequestView } from "./generated/types.gen";

export const refundRequestStates = ["REQUESTED", "APPROVED", "REJECTED"] as const;
export const refundOperationStates = ["PREPARED", "CALLING", "UNKNOWN", "PENDING", "REQUIRES_ACTION", "SUCCEEDED", "FAILED", "CANCELED", "NEEDS_REVIEW"] as const;
const oneOf = (value: unknown, options: readonly string[]) => typeof value === "string" && options.includes(value);
const nullableId = (value: unknown) => value === null || isUuid(value);
const nullableInstant = (value: unknown) => value === null || instant(value);
const reason = (value: unknown) => validMethodText(value, 2000, 1) && typeof value === "string" && value.trim().length > 0;
const currency = (value: unknown) => typeof value === "string" && Object.hasOwn(commerceCurrencyScale, value);
const amount = (value: unknown) => integer(value, 0, Number.MAX_SAFE_INTEGER);
const operationAmount = (value: unknown) => integer(value, 1, 99_999_999);
const code = (value: unknown) => value === null || typeof value === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(value);
const notification = (value: unknown) => oneOf(value, ["NONE", "PENDING", "SENT", "ISSUE"]);
function allocations(value: unknown): value is RefundAllocation[] {
  return Array.isArray(value) && value.length <= 20 && value.every(item => record(item) && exact(item, ["orderResourceId", "amountMinor", "accessAction"]) && isUuid(item.orderResourceId) && amount(item.amountMinor) && oneOf(item.accessAction, ["KEEP", "REVOKE"]))
    && new Set(value.map((item: RefundAllocation) => item.orderResourceId)).size === value.length;
}
const allocationTotal = (value: RefundAllocation[]) => value.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
export function isRefundLine(value: unknown): value is RefundLine {
  return record(value) && exact(value, ["orderResourceId", "resourceId", "versionId", "versionNumber", "title", "locales", "originRevoked"])
    && [value.orderResourceId, value.resourceId, value.versionId].every(isUuid) && integer(value.versionNumber, 1) && validMethodText(value.title, 240, 1) && locales(value.locales) && value.locales.length > 0 && typeof value.originRevoked === "boolean";
}
function lines(value: unknown): value is RefundLine[] { return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(isRefundLine) && new Set(value.map((item: RefundLine) => item.orderResourceId)).size === value.length; }
export function isRefundContext(value: unknown): value is RefundContext {
  return record(value) && exact(value, ["orderId", "orderRevision", "paymentStatus", "fulfillmentStatus", "currency", "paidAmountMinor", "confirmedRefundedMinor", "reservedMinor", "availableMinor", "reconciliationState", "canRequest", "requestUnavailableReason", "lines"])
    && isUuid(value.orderId) && integer(value.orderRevision) && oneOf(value.paymentStatus, ["NOT_STARTED", "REQUIRES_PAYMENT", "PROCESSING", "PAID", "FAILED", "EXPIRED", "UNKNOWN"])
    && oneOf(value.fulfillmentStatus, ["NOT_STARTED", "PENDING", "READY", "RETRYING", "NEEDS_REVIEW"]) && currency(value.currency)
    && [value.paidAmountMinor, value.confirmedRefundedMinor, value.reservedMinor, value.availableMinor].every(amount)
    && oneOf(value.reconciliationState, ["CURRENT", "NEEDS_REVIEW"]) && typeof value.canRequest === "boolean" && code(value.requestUnavailableReason) && lines(value.lines);
}
export function isRefundDecisionView(value: unknown): value is RefundDecisionView {
  if (!record(value) || !exact(value, ["id", "outcome", "reason", "amountMinor", "allocations", "operationId", "decidedAt"]) || !isUuid(value.id) || !reason(value.reason) || !instant(value.decidedAt) || !allocations(value.allocations)) return false;
  return value.outcome === "REJECT" ? value.amountMinor === null && value.operationId === null && value.allocations.length === 0
    : value.outcome === "APPROVE" && operationAmount(value.amountMinor) && isUuid(value.operationId) && value.allocations.length > 0 && allocationTotal(value.allocations) === BigInt(value.amountMinor as number);
}
export function isRefundRequestView(value: unknown): value is RefundRequestView {
  return record(value) && exact(value, ["id", "revision", "orderId", "state", "reason", "decision", "createdAt", "updatedAt"])
    && isUuid(value.id) && integer(value.revision) && isUuid(value.orderId) && oneOf(value.state, refundRequestStates) && reason(value.reason) && instant(value.createdAt) && instant(value.updatedAt)
    && (value.state === "REQUESTED" ? value.decision === null : isRefundDecisionView(value.decision) && value.decision.outcome === (value.state === "APPROVED" ? "APPROVE" : "REJECT"));
}
export function isRefundPreview(value: unknown): value is RefundPreview {
  return record(value) && exact(value, ["requestId", "requestRevision", "orderId", "orderRevision", "currency", "amountMinor", "availableMinor", "fullRefund", "allocations", "lines", "fingerprint"])
    && isUuid(value.requestId) && integer(value.requestRevision) && isUuid(value.orderId) && integer(value.orderRevision) && currency(value.currency)
    && operationAmount(value.amountMinor) && amount(value.availableMinor) && value.amountMinor <= value.availableMinor && typeof value.fullRefund === "boolean"
    && typeof value.fingerprint === "string" && /^[a-f0-9]{64}$/.test(value.fingerprint) && allocations(value.allocations) && value.allocations.length > 0 && lines(value.lines)
    && allocationTotal(value.allocations) === BigInt(value.amountMinor) && value.allocations.every(item => (value.lines as RefundLine[]).some(line => line.orderResourceId === item.orderResourceId))
    && (!value.fullRefund || value.allocations.length === value.lines.length && value.allocations.every(item => item.accessAction === "REVOKE"));
}
export function isRefundOperationView(value: unknown): value is RefundOperationView {
  return record(value) && exact(value, ["id", "revision", "orderId", "requestId", "origin", "state", "amountMinor", "currency", "allocations", "accessState", "lastErrorCode", "createdAt", "updatedAt", "confirmedAt", "notificationStatus", "canExecute", "canCancel", "canReconcile", "canDecideAccess"])
    && isUuid(value.id) && integer(value.revision) && isUuid(value.orderId) && nullableId(value.requestId) && oneOf(value.origin, ["LOCAL_DECISION", "STRIPE_DASHBOARD"])
    && oneOf(value.state, refundOperationStates) && operationAmount(value.amountMinor) && currency(value.currency) && allocations(value.allocations)
    && (value.allocations.length === 0 ? value.origin === "STRIPE_DASHBOARD" : allocationTotal(value.allocations) === BigInt(value.amountMinor))
    && oneOf(value.accessState, ["NOT_APPLIED", "APPLIED", "KEPT", "NEEDS_REVIEW"]) && code(value.lastErrorCode) && instant(value.createdAt) && instant(value.updatedAt) && nullableInstant(value.confirmedAt)
    && (value.state !== "SUCCEEDED" || instant(value.confirmedAt))
    && notification(value.notificationStatus) && [value.canExecute, value.canCancel, value.canReconcile, value.canDecideAccess].every(item => typeof item === "boolean");
}
export function isRefundDecisionResult(value: unknown): value is RefundDecisionResult {
  if (!record(value) || !exact(value, ["request", "operation"]) || !isRefundRequestView(value.request) || !value.request.decision) return false;
  return value.request.state === "REJECTED" ? value.operation === null : value.request.state === "APPROVED" && isRefundOperationView(value.operation)
    && value.operation.id === value.request.decision.operationId && value.operation.orderId === value.request.orderId && value.operation.requestId === value.request.id && value.operation.amountMinor === value.request.decision.amountMinor;
}
function page<T>(value: unknown, guard: (item: unknown) => item is T, identifier: (item: T) => string): boolean {
  return record(value) && exact(value, ["items", "page", "pageSize", "total"]) && integer(value.page, 0, 1_000_000) && integer(value.pageSize, 1, 100) && integer(value.total)
    && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(guard) && new Set(value.items.map(identifier)).size === value.items.length;
}
export const isRefundRequestPage = (value: unknown): value is RefundRequestPage => page(value, isRefundRequestView, item => item.id);
export const isRefundOperationPage = (value: unknown): value is RefundOperationPage => page(value, isRefundOperationView, item => item.id);
export function isEntitlementSummary(value: unknown): value is EntitlementSummary {
  return record(value) && exact(value, ["id", "originType", "orderId", "orderResourceId", "resourceId", "versionId", "versionNumber", "title", "locales", "versionPolicy", "state", "revokedReason", "startsAt", "expiresAt", "revokedAt"])
    && isUuid(value.id) && oneOf(value.originType, ["ORDER_LINE", "MANUAL_TEST"]) && nullableId(value.orderId) && nullableId(value.orderResourceId)
    && (value.originType !== "ORDER_LINE" || isUuid(value.orderId) && isUuid(value.orderResourceId)) && isUuid(value.resourceId) && isUuid(value.versionId) && integer(value.versionNumber, 1)
    && validMethodText(value.title, 240, 1) && locales(value.locales) && value.locales.length > 0 && oneOf(value.versionPolicy, ["PINNED", "UPDATES_DURING_PERIOD"])
    && oneOf(value.state, ["ACTIVE", "NOT_STARTED", "EXPIRED", "REVOKED"]) && (value.revokedReason === null || oneOf(value.revokedReason, ["REFUND", "ACCESS_REVOKED"]))
    && instant(value.startsAt) && nullableInstant(value.expiresAt) && nullableInstant(value.revokedAt);
}
export const isEntitlementPage = (value: unknown): value is EntitlementPage => page(value, isEntitlementSummary, item => item.id);
export const refundRequestEtag = (value: Pick<RefundRequestView, "id" | "revision">) => `"refund-request-${value.id}-r${value.revision}"`;
export const refundOperationEtag = (value: Pick<RefundOperationView, "id" | "revision" | "notificationStatus" | "canExecute" | "canCancel" | "canReconcile" | "canDecideAccess">) => `"refund-operation-${value.id}-r${value.revision}-n${value.notificationStatus}-a${[value.canExecute, value.canCancel, value.canReconcile, value.canDecideAccess].map(item => item ? "1" : "0").join("")}"`;
