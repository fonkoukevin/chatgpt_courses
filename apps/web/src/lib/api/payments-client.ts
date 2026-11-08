import type { AuthResult } from "./auth-client";
import type { CheckoutAccess, CreateCheckout } from "./generated/types.gen";
import { commerceString } from "./offers-validation";
import { isCheckoutAccess, isOrderPaymentStatus } from "./payments-validation";
import { matchingResource, mutateResourceJson, readResourceJson, resourceId as id } from "./resource-http";

export const paymentStatusPath = (orderId: string) => `/me/orders/${id(orderId)}/payment-status`;
export const getOrderPaymentStatus = (orderId: string) => readResourceJson(paymentStatusPath(orderId), matchingResource(isOrderPaymentStatus, (value) => value.orderId === orderId));
export async function createCheckout(orderId: string, etag: string, body: CreateCheckout, idempotencyKey: string, accountContext: string): Promise<AuthResult<CheckoutAccess>> {
  id(orderId); id(idempotencyKey); id(accountContext);
  if (!new RegExp(`^"order-${orderId}-r(?:0|[1-9][0-9]*)"$`).test(etag) || !commerceString(body.acceptedTermsVersion, 100, 1)) throw new Error("Invalid checkout precondition or terms version.");
  const value = await mutateResourceJson(`/me/orders/${orderId}/checkout`, { acceptedTermsVersion: body.acceptedTermsVersion }, accountContext, matchingResource(isCheckoutAccess, (result) => result.orderId === orderId), [200, 202], { etag, idempotencyKey });
  return value.ok && value.data.state === "OPEN" && value.status !== 200 ? { ok: false, error: { kind: "invalid-response", status: value.status } } : value;
}
