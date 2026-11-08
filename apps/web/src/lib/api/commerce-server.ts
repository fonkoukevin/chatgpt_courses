import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { AuthResult } from "./auth-client";
import type { Locale } from "../i18n/locales";
import { checkedOrder, offerListPath, offerPath, orderListPath, orderPath } from "./commerce-client";
import { decodeAssetResponse } from "./assets-response";
import { isOfferPage, isPublicOffer } from "./offers-validation";
import { isOrderPage, isOrderView } from "./orders-validation";
import { matchingResource as matching } from "./resource-http";

async function read<T>(path: string, decode: (value: unknown) => value is T, personal: boolean): Promise<AuthResult<T>> {
  const session = personal ? (await cookies()).get("SESSION")?.value : undefined;
  if (personal && (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session))) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), { method: "GET", headers: { Accept: "application/json, application/problem+json", ...(session ? { Cookie: `SESSION=${session}` } : {}) }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs) });
    return await decodeAssetResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readOffers = (locale: Locale, page = 0, pageSize = 20) => read(offerListPath(locale, page, pageSize), matching(isOfferPage, (value) => value.page === page && value.pageSize === pageSize && value.items.every((item) => item.locale === locale)), false);
export const readOffer = (offerId: string, locale: Locale) => read(offerPath(offerId, locale), matching(isPublicOffer, (value) => value.id === offerId && value.locale === locale), false);
export const readOrders = (page = 0, pageSize = 20) => read(orderListPath(page, pageSize), matching(isOrderPage, (value) => value.page === page && value.pageSize === pageSize), true);
export const readOrder = (orderId: string) => checkedOrder(read(orderPath(orderId), matching(isOrderView, (value) => value.id === orderId), true));
