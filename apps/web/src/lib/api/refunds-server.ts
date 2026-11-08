import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { AuthResult } from "./auth-client";
import type { Locale } from "../i18n/locales";
import { decodeAssetResponse } from "./assets-response";
import { checkedRefundOperation, checkedRefundRequest, entitlementListPath, operationPageGuard, refundContextPath, refundOperationListPath, refundOperationPath, refundRequestListPath, refundRequestPath, requestPageGuard, type RefundOperationQuery, type RefundRequestQuery } from "./refunds-client";
import { isEntitlementPage, isRefundContext, isRefundOperationView, isRefundRequestView } from "./refunds-validation";
import { matchingResource as matching } from "./resource-http";

async function read<T>(path: string, decode: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), { method: "GET", headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs) });
    return await decodeAssetResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readRefundContext = (orderId: string, admin = false) => read(refundContextPath(orderId, admin), matching(isRefundContext, value => value.orderId === orderId));
export const readRefundRequests = (query: RefundRequestQuery = {}, admin = false) => read(refundRequestListPath(query, admin), requestPageGuard(query));
export const readRefundRequest = (requestId: string, admin = false) => checkedRefundRequest(read(refundRequestPath(requestId, admin), matching(isRefundRequestView, value => value.id === requestId)));
export const readRefundOperations = (query: RefundOperationQuery = {}, admin = false) => read(refundOperationListPath(query, admin), operationPageGuard(query));
export const readRefundOperation = (operationId: string, admin = false) => checkedRefundOperation(read(refundOperationPath(operationId, admin), matching(isRefundOperationView, value => value.id === operationId)));
export const readEntitlements = (locale: Locale, page = 0, pageSize = 20) => read(entitlementListPath(locale, page, pageSize), matching(isEntitlementPage, value => value.page === page && value.pageSize === pageSize));
