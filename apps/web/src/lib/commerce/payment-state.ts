import type { OrderPaymentStatus } from "../api/generated/types.gen";

export type PaymentOutcome = "ready" | "activation" | "review" | "processing" | "failed" | "awaiting";
export function paymentOutcome(value: OrderPaymentStatus): PaymentOutcome {
  if (value.orderStatus === "NEEDS_REVIEW" || value.fulfillmentStatus === "NEEDS_REVIEW" || value.checkoutState === "NEEDS_REVIEW") return "review";
  if (value.paymentStatus === "PAID") return value.fulfillmentStatus === "READY" ? "ready" : "activation";
  if (["PROCESSING", "UNKNOWN"].includes(value.paymentStatus) || ["CALLING", "UNKNOWN"].includes(value.checkoutState)) return "processing";
  return ["FAILED", "EXPIRED"].includes(value.paymentStatus) || ["EXPIRED", "CANCELLED"].includes(value.orderStatus) ? "failed" : "awaiting";
}
export type CheckoutIntent = { orderId: string; accountId: string; terms: string; key: string };
export function checkoutIntent(previous: CheckoutIntent | null, orderId: string, accountId: string, terms: string, newKey: () => string): CheckoutIntent {
  return previous?.orderId === orderId && previous.accountId === accountId && previous.terms === terms ? previous : { orderId, accountId, terms, key: newKey() };
}
