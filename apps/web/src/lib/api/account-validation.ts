import type { CommercialDocuments, DataRequestEvent, DataRequestEventPage, DataRequestPage, DataRequestView, ProfileView } from "./generated/types.gen";
import { accountPage, exact, instant, integer, isUuid, nullableInstant, oneOf, record } from "./account-validation-common";
import { validMethodText } from "../methods/validation";

export const dataRequestTypes = ["EXPORT", "ERASURE", "ACCOUNT_CLOSURE"] as const;
export function isProfileView(value: unknown): value is ProfileView {
  return record(value) && exact(value, ["id", "email", "displayName", "revision"]) && isUuid(value.id) && validMethodText(value.email, 320, 1) && (value.displayName === null || validMethodText(value.displayName, 120)) && integer(value.revision);
}
export function isCommercialDocuments(value: unknown): value is CommercialDocuments {
  return record(value) && exact(value, ["orderId", "state", "documents", "unavailableReason"]) && isUuid(value.orderId) && value.state === "NONE_AVAILABLE" && Array.isArray(value.documents) && value.documents.length === 0 && value.unavailableReason === "NO_VERIFIED_COMMERCIAL_DOCUMENT";
}
export function isDataRequestView(value: unknown): value is DataRequestView {
  return record(value) && exact(value, ["id", "revision", "type", "reason", "state", "processingUnavailableReason", "createdAt", "updatedAt", "cancelledAt"]) && isUuid(value.id) && integer(value.revision) && oneOf(value.type, dataRequestTypes) && validMethodText(value.reason, 2000, 1) && typeof value.reason === "string" && Boolean(value.reason.trim())
    && instant(value.createdAt) && instant(value.updatedAt) && nullableInstant(value.cancelledAt)
    && (value.state === "WAITING_POLICY" ? value.processingUnavailableReason === "RETENTION_POLICY_UNCONFIGURED" && value.cancelledAt === null : value.state === "CANCELLED" && value.processingUnavailableReason === null && instant(value.cancelledAt));
}
export function isDataRequestEvent(value: unknown): value is DataRequestEvent {
  return record(value) && exact(value, ["id", "requestId", "type", "reason", "createdAt"]) && isUuid(value.id) && isUuid(value.requestId) && oneOf(value.type, ["REQUESTED", "CANCELLED"]) && validMethodText(value.reason, 2000, 1) && instant(value.createdAt);
}
export const isDataRequestPage = (value: unknown): value is DataRequestPage => accountPage(value, isDataRequestView, item => item.id);
export const isDataRequestEventPage = (value: unknown): value is DataRequestEventPage => accountPage(value, isDataRequestEvent, item => item.id);
export const profileEtag = (value: Pick<ProfileView, "id" | "revision">) => `"profile-${value.id}-r${value.revision}"`;
export const dataRequestEtag = (value: Pick<DataRequestView, "id" | "revision">) => `"data-request-${value.id}-r${value.revision}"`;
