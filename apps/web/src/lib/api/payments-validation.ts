import type { CheckoutAccess, OrderPaymentStatus } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { commerceExact as exact, commerceInstant as instant, commerceInteger as integer, commerceCode as code } from "./offers-validation";
import { isStripeCheckoutUrl } from "../commerce/checkout";

export const orderStatuses = ["PREPARED", "AWAITING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED", "NEEDS_REVIEW"];
export const paymentStatuses = ["NOT_STARTED", "REQUIRES_PAYMENT", "PROCESSING", "PAID", "FAILED", "EXPIRED", "UNKNOWN"];
export const fulfillmentStatuses = ["NOT_STARTED", "PENDING", "READY", "RETRYING", "NEEDS_REVIEW"];
const checkoutStates = ["PREPARED", "CALLING", "OPEN", "UNKNOWN", "COMPLETE", "EXPIRED", "FAILED", "NEEDS_REVIEW"];
const oneOf = (value: unknown, values: string[]) => typeof value === "string" && values.includes(value);
export function isCheckoutAccess(value: unknown): value is CheckoutAccess {
  return record(value) && exact(value, ["orderId", "operationId", "state", "url", "expiresAt", "retryAfterSeconds", "unavailableReason"])
    && isUuid(value.orderId) && (value.operationId === null || isUuid(value.operationId)) && oneOf(value.state, checkoutStates)
    && (value.url === null || value.state === "OPEN" && isUuid(value.operationId) && isStripeCheckoutUrl(value.url) && instant(value.expiresAt)) && (value.expiresAt === null || instant(value.expiresAt))
    && (value.retryAfterSeconds === null || integer(value.retryAfterSeconds, 1, 300)) && (value.unavailableReason === null || code(value.unavailableReason));
}
export function isOrderPaymentStatus(value: unknown): value is OrderPaymentStatus {
  return record(value) && exact(value, ["orderId", "orderRevision", "orderStatus", "paymentStatus", "fulfillmentStatus", "checkoutState", "checkoutAvailable", "checkoutUnavailableReason", "sessionExpiresAt", "canRetry", "notificationStatus"])
    && isUuid(value.orderId) && integer(value.orderRevision) && oneOf(value.orderStatus, orderStatuses) && oneOf(value.paymentStatus, paymentStatuses) && oneOf(value.fulfillmentStatus, fulfillmentStatuses)
    && (value.checkoutState === "NONE" || oneOf(value.checkoutState, checkoutStates)) && typeof value.checkoutAvailable === "boolean" && typeof value.canRetry === "boolean"
    && (value.checkoutUnavailableReason === null || code(value.checkoutUnavailableReason)) && (value.sessionExpiresAt === null || instant(value.sessionExpiresAt)) && oneOf(value.notificationStatus, ["NONE", "PENDING", "SENT", "ISSUE"]);
}
