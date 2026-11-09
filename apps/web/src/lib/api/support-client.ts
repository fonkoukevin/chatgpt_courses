import type { AuthResult } from "./auth-client";
import type { AddSupportMessage, CreateSupportTicket, SupportTicketView } from "./generated/types.gen";
import { isSupportContext, isSupportConversationUpdate, isSupportEventPage, isSupportMessagePage, isSupportTicketPage, isSupportTicketView, supportStates, supportTicketEtag } from "./support-validation";
import { isAssetDownloadAccess } from "./assets-validation";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";
import { validMethodText } from "../methods/validation";

export type SupportQuery = { state?: SupportTicketView["state"]; page?: number; pageSize?: number };
export function supportQuery(query: SupportQuery = {}): string {
  const params = new URLSearchParams(resourcePagination(query.page ?? 0, query.pageSize ?? 20));
  if (query.state) { if (!supportStates.some(state => state === query.state)) throw new Error("Invalid support state."); params.set("state", query.state); }
  return params.toString();
}
export async function checkSupportTicket(value: Promise<AuthResult<SupportTicketView>>): Promise<AuthResult<SupportTicketView>> { const result = await value; return result.ok && result.etag !== supportTicketEtag(result.data) ? { ok: false, error: { kind: "invalid-response", status: result.status } } : result; }
function content(message: string, attachmentIds: string[]) {
  if (!validMethodText(message, 8000, 1) || !message.trim() || attachmentIds.length > 5 || new Set(attachmentIds).size !== attachmentIds.length) throw new Error("Invalid support message.");
  return { message, attachmentIds: attachmentIds.map(id) };
}
const sameContext = (left: CreateSupportTicket["context"], right: CreateSupportTicket["context"]) => left === null || right === null ? left === right : (["locale", "resourceId", "versionId", "revisionId", "orderId", "projectId", "enrollmentId"] as const).every(field => left[field] === right[field]);
export const listSupportTickets = (query: SupportQuery = {}) => readResourceJson(`/me/support-tickets?${supportQuery(query)}`, matching(isSupportTicketPage, value => value.page === (query.page ?? 0) && value.pageSize === (query.pageSize ?? 20) && value.items.every(item => !query.state || item.state === query.state)));
export const getSupportTicket = (ticketId: string) => checkSupportTicket(readResourceJson(`/me/support-tickets/${id(ticketId)}`, matching(isSupportTicketView, value => value.id === ticketId)));
export const getSupportMessages = (ticketId: string, page = 0, pageSize = 20) => readResourceJson(`/me/support-tickets/${id(ticketId)}/messages?${resourcePagination(page, pageSize)}`, matching(isSupportMessagePage, value => value.page === page && value.pageSize === pageSize && value.items.every(item => item.ticketId === ticketId)));
export const getSupportEvents = (ticketId: string, page = 0, pageSize = 20) => readResourceJson(`/me/support-tickets/${id(ticketId)}/events?${resourcePagination(page, pageSize)}`, matching(isSupportEventPage, value => value.page === page && value.pageSize === pageSize && value.items.every(item => item.ticketId === ticketId)));
export function createSupportTicket(body: CreateSupportTicket, key: string, accountContext: string) {
  const message = content(body.message, body.attachmentIds);
  if (!validMethodText(body.subject, 160, 1) || !body.subject.trim() || body.context !== null && !isSupportContext(body.context)) throw new Error("Invalid support request.");
  const command = { category: body.category, subject: body.subject, ...message, locale: body.locale, context: body.context };
  if (new TextEncoder().encode(JSON.stringify(command)).byteLength > 48 * 1024) throw new Error("Support request exceeds its size limit.");
  return checkSupportTicket(mutateResourceJson("/me/support-tickets", command, id(accountContext), matching(isSupportTicketView, value => value.category === body.category && value.subject === body.subject && value.locale === body.locale && sameContext(value.context, body.context)), [200, 201], { idempotencyKey: key }));
}
export function addSupportMessage(ticketId: string, tag: string, body: AddSupportMessage, key: string, accountContext: string) {
  if (!new RegExp(`^"support-ticket-${id(ticketId)}-r(?:0|[1-9][0-9]*)"$`).test(tag)) throw new Error("A matching strong support revision is required.");
  const command = content(body.message, body.attachmentIds);
  return mutateResourceJson(`/me/support-tickets/${id(ticketId)}/messages`, command, id(accountContext), matching(isSupportConversationUpdate, value => value.ticket.id === ticketId && value.message.message === body.message && value.message.authorKind === "USER" && value.message.attachments.length === body.attachmentIds.length && value.message.attachments.every(item => body.attachmentIds.includes(item.assetId))), [200, 201], { etag: tag, idempotencyKey: key });
}
export const getSupportAttachmentDownload = (ticketId: string, assetId: string, accountContext: string) => mutateResourceJson(`/me/support-tickets/${id(ticketId)}/attachments/${id(assetId)}/download-access`, undefined, id(accountContext), matching(isAssetDownloadAccess, value => value.assetId === assetId));
