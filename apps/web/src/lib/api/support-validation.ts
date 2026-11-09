import type { SupportAttachment, SupportContext, SupportConversationUpdate, SupportEventPage, SupportMessagePage, SupportMessageView, SupportTicketEvent, SupportTicketPage, SupportTicketView } from "./generated/types.gen";
import { accountPage, exact, hash, instant, integer, isUuid, locale, nullableId, oneOf, record } from "./account-validation-common";
import { assetFilename, maxAssetBytes } from "./assets-validation";
import { validMethodText } from "../methods/validation";

export const supportCategories = ["TECHNICAL", "CONTENT", "ACCESS", "ORDER", "ACCOUNT", "OTHER"] as const;
export const supportStates = ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"] as const;
export function isSupportContext(value: unknown): value is SupportContext {
  return record(value) && exact(value, ["locale", "resourceId", "versionId", "revisionId", "orderId", "projectId", "enrollmentId"]) && locale(value.locale)
    && [value.resourceId, value.versionId, value.revisionId, value.orderId, value.projectId, value.enrollmentId].every(nullableId)
    && (value.resourceId === null) === (value.versionId === null) && (value.revisionId === null || value.resourceId !== null)
    && [value.resourceId, value.orderId, value.projectId, value.enrollmentId].some(item => item !== null);
}
export function isSupportTicketView(value: unknown): value is SupportTicketView {
  return record(value) && exact(value, ["id", "revision", "category", "subject", "locale", "state", "context", "createdAt", "updatedAt"]) && isUuid(value.id) && integer(value.revision) && oneOf(value.category, supportCategories) && validMethodText(value.subject, 160, 1) && locale(value.locale) && oneOf(value.state, supportStates) && (value.context === null || isSupportContext(value.context)) && instant(value.createdAt) && instant(value.updatedAt);
}
export function isSupportAttachment(value: unknown): value is SupportAttachment {
  return record(value) && exact(value, ["assetId", "filename", "contentType", "sizeBytes", "sha256"]) && isUuid(value.assetId) && assetFilename(value.filename) && oneOf(value.contentType, ["text/plain", "application/pdf"]) && integer(value.sizeBytes, 1, maxAssetBytes) && hash(value.sha256);
}
export function isSupportMessageView(value: unknown): value is SupportMessageView {
  return record(value) && exact(value, ["id", "ticketId", "authorKind", "message", "attachments", "createdAt", "notificationStatus"]) && isUuid(value.id) && isUuid(value.ticketId) && oneOf(value.authorKind, ["USER", "SUPPORT"]) && validMethodText(value.message, 8000, 1)
    && Array.isArray(value.attachments) && value.attachments.length <= 5 && value.attachments.every(isSupportAttachment) && new Set(value.attachments.map(item => item.assetId)).size === value.attachments.length && instant(value.createdAt)
    && oneOf(value.notificationStatus, ["NOT_REQUIRED", "PENDING", "SENT", "ISSUE"]) && (value.authorKind !== "USER" || value.notificationStatus === "NOT_REQUIRED");
}
export function isSupportTicketEvent(value: unknown): value is SupportTicketEvent {
  return record(value) && exact(value, ["id", "ticketId", "type", "fromState", "toState", "authorKind", "reason", "createdAt"]) && isUuid(value.id) && isUuid(value.ticketId) && oneOf(value.type, ["CREATED", "USER_MESSAGE", "SUPPORT_REPLY", "STATE_CHANGED"]) && (value.fromState === null || oneOf(value.fromState, supportStates)) && (value.toState === null || oneOf(value.toState, supportStates)) && oneOf(value.authorKind, ["USER", "SUPPORT"]) && (value.reason === null || validMethodText(value.reason, 2000)) && instant(value.createdAt);
}
export const isSupportTicketPage = (value: unknown): value is SupportTicketPage => accountPage(value, isSupportTicketView, item => item.id);
export const isSupportMessagePage = (value: unknown): value is SupportMessagePage => accountPage(value, isSupportMessageView, item => item.id);
export const isSupportEventPage = (value: unknown): value is SupportEventPage => accountPage(value, isSupportTicketEvent, item => item.id);
export const isSupportConversationUpdate = (value: unknown): value is SupportConversationUpdate => record(value) && exact(value, ["ticket", "message"]) && isSupportTicketView(value.ticket) && isSupportMessageView(value.message) && value.message.ticketId === value.ticket.id;
export const supportTicketEtag = (value: Pick<SupportTicketView, "id" | "revision">) => `"support-ticket-${value.id}-r${value.revision}"`;
