import type { AuthResult } from "./auth-client";
import type { CancelDataRequest, CreateDataRequest, DataRequestView, ProfileView, SaveProfile } from "./generated/types.gen";
import { dataRequestEtag, isCommercialDocuments, isDataRequestEventPage, isDataRequestPage, isDataRequestView, isProfileView, profileEtag } from "./account-validation";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";
import { validMethodText } from "../methods/validation";

export async function checkProfile(value: Promise<AuthResult<ProfileView>>): Promise<AuthResult<ProfileView>> { const result = await value; return result.ok && result.etag !== profileEtag(result.data) ? { ok: false, error: { kind: "invalid-response", status: result.status } } : result; }
export async function checkDataRequest(value: Promise<AuthResult<DataRequestView>>): Promise<AuthResult<DataRequestView>> { const result = await value; return result.ok && result.etag !== dataRequestEtag(result.data) ? { ok: false, error: { kind: "invalid-response", status: result.status } } : result; }
function precondition(tag: string, prefix: string) { if (!new RegExp(`^"${prefix}-[0-9a-f-]{36}-r(?:0|[1-9][0-9]*)"$`, "i").test(tag)) throw new Error("A strong account revision is required."); }
const reason = (value: string) => { if (!validMethodText(value, 2000, 1) || !value.trim()) throw new Error("A request reason is required."); return value; };
export const getAccountProfile = () => checkProfile(readResourceJson("/me/profile", isProfileView));
export function saveAccountProfile(tag: string, body: SaveProfile, accountContext: string) {
  precondition(tag, "profile"); if (body.displayName !== null && !validMethodText(body.displayName, 120)) throw new Error("Invalid display name.");
  return checkProfile(mutateResourceJson("/me/profile", { displayName: body.displayName }, id(accountContext), matching(isProfileView, value => value.id === accountContext && value.displayName === (body.displayName?.trim() || null)), [200], { method: "PATCH", etag: tag }));
}
export const getCommercialDocuments = (orderId: string) => readResourceJson(`/me/orders/${id(orderId)}/documents`, matching(isCommercialDocuments, value => value.orderId === orderId));
export const listDataRequests = (page = 0, pageSize = 20) => readResourceJson(`/me/data-requests?${resourcePagination(page, pageSize)}`, matching(isDataRequestPage, value => value.page === page && value.pageSize === pageSize));
export const getDataRequest = (requestId: string) => checkDataRequest(readResourceJson(`/me/data-requests/${id(requestId)}`, matching(isDataRequestView, value => value.id === requestId)));
export const getDataRequestEvents = (requestId: string, page = 0, pageSize = 20) => readResourceJson(`/me/data-requests/${id(requestId)}/events?${resourcePagination(page, pageSize)}`, matching(isDataRequestEventPage, value => value.page === page && value.pageSize === pageSize && value.items.every(item => item.requestId === requestId)));
export const createDataRequest = (body: CreateDataRequest, key: string, accountContext: string) => checkDataRequest(mutateResourceJson("/me/data-requests", { type: body.type, reason: reason(body.reason) }, id(accountContext), matching(isDataRequestView, value => value.type === body.type && value.reason === body.reason), [200, 201], { idempotencyKey: key }));
export function cancelDataRequest(requestId: string, tag: string, body: CancelDataRequest, key: string, accountContext: string) {
  id(requestId); precondition(tag, "data-request");
  if (!tag.startsWith(`"data-request-${requestId}-r`)) throw new Error("A matching data request revision is required.");
  return checkDataRequest(mutateResourceJson(`/me/data-requests/${id(requestId)}/cancellations`, { reason: reason(body.reason) }, id(accountContext), matching(isDataRequestView, value => value.id === requestId && value.state === "CANCELLED"), [200], { etag: tag, idempotencyKey: key }));
}
