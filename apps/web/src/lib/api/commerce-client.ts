import type { AuthResult } from "./auth-client";
import type { CreateOrder, OrderView } from "./generated/types.gen";
import type { Locale } from "../i18n/locales";
import { commerceInteger, commerceLocale, commerceString, isOfferPage, isPublicOffer } from "./offers-validation";
import { isOrderPage, isOrderView, isPurchaseContext, orderEtag } from "./orders-validation";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";

function language(value: Locale): Locale { if (!commerceLocale(value)) throw new Error("Invalid commerce locale."); return value; }
export const offerPath = (offerId: string, locale: Locale) => `/offers/${id(offerId)}?locale=${language(locale)}`;
export const offerListPath = (locale: Locale, page = 0, pageSize = 20) => `/offers?locale=${language(locale)}&${resourcePagination(page, pageSize)}`;
export const purchaseContextPath = (offerId: string, locale: Locale) => `/me/offers/${id(offerId)}/purchase-context?locale=${language(locale)}`;
export const orderPath = (orderId: string) => `/me/orders/${id(orderId)}`;
export const orderListPath = (page = 0, pageSize = 20) => `/me/orders?${resourcePagination(page, pageSize)}`;
export async function checkedOrder(result: Promise<AuthResult<OrderView>>): Promise<AuthResult<OrderView>> {
  const value = await result; return value.ok && value.etag !== orderEtag(value.data) ? { ok: false, error: { kind: "invalid-response", status: value.status } } : value;
}
export const listOffers = (locale: Locale, page = 0, pageSize = 20) => readResourceJson(offerListPath(locale, page, pageSize), matching(isOfferPage, (value) => value.page === page && value.pageSize === pageSize && value.items.every((item) => item.locale === locale)), { credentials: "omit" });
export const getOffer = (offerId: string, locale: Locale) => readResourceJson(offerPath(offerId, locale), matching(isPublicOffer, (value) => value.id === offerId && value.locale === locale), { credentials: "omit" });
export const getPurchaseContext = (offerId: string, locale: Locale) => readResourceJson(purchaseContextPath(offerId, locale), matching(isPurchaseContext, (value) => value.offer.id === offerId && value.offer.locale === locale));
export const listOrders = (page = 0, pageSize = 20) => readResourceJson(orderListPath(page, pageSize), matching(isOrderPage, (value) => value.page === page && value.pageSize === pageSize));
export const getOrder = (orderId: string) => checkedOrder(readResourceJson(orderPath(orderId), matching(isOrderView, (value) => value.id === orderId)));
export function createOrder(body: CreateOrder, idempotencyKey: string, accountContext: string): Promise<AuthResult<OrderView>> {
  id(body.offerId); id(idempotencyKey); id(accountContext);
  if (!commerceInteger(body.offerRevision) || !commerceLocale(body.locale) || !commerceString(body.acceptedTermsVersion, 100, 1)) throw new Error("Invalid order preparation.");
  const command: CreateOrder = { offerId: body.offerId, offerRevision: body.offerRevision, locale: body.locale, acceptedTermsVersion: body.acceptedTermsVersion };
  return checkedOrder(mutateResourceJson("/me/orders", command, accountContext, matching(isOrderView, (value) => value.snapshot.offerId === command.offerId && value.snapshot.offerRevision === command.offerRevision && value.snapshot.locale === command.locale && value.acceptedTermsVersion === command.acceptedTermsVersion), [200, 201], { idempotencyKey }));
}
