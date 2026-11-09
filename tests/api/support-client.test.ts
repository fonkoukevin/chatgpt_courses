import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { addSupportMessage, createSupportTicket, getSupportTicket } from "../../apps/web/src/lib/api/support-client";
import { isSupportContext, isSupportConversationUpdate, isSupportMessageView, supportTicketEtag } from "../../apps/web/src/lib/api/support-validation";
import type { CreateSupportTicket, SupportTicketView } from "../../apps/web/src/lib/api/generated/types.gen";
const originalFetch = globalThis.fetch, actor = randomUUID(), now = "2026-11-08T00:00:00Z", csrf = { token: "unit-only-support-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const context = { locale: "fr" as const, resourceId: randomUUID(), versionId: randomUUID(), revisionId: randomUUID(), orderId: null, projectId: null, enrollmentId: null };
const ticket: SupportTicketView = { id: randomUUID(), revision: 0, category: "CONTENT", subject: "Synthetic support question", locale: "fr", state: "OPEN", context, createdAt: now, updatedAt: now };
beforeEach(() => clearCsrfToken()); afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });
test("support sends only explicit references and selected attachment IDs, not work or owner fields", async () => {
  const body: CreateSupportTicket = { category: ticket.category, subject: ticket.subject, message: "Synthetic selected message", locale: "fr", context, attachmentIds: [randomUUID()] };
  let posts = 0; globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); posts++; const headers = new Headers(init?.headers); assert.equal(headers.get("X-Account-Context"), actor); assert.ok(headers.get("Idempotency-Key")); assert.deepEqual(JSON.parse(String(init?.body)), body); return Response.json({ ...ticket, context: { enrollmentId: null, projectId: null, orderId: null, revisionId: context.revisionId, versionId: context.versionId, resourceId: context.resourceId, locale: "fr" } }, { status: 201, headers: { ETag: supportTicketEtag(ticket) } }); };
  assert.equal((await createSupportTicket({ ...body, privateNotes: "must-not-send", ownerId: actor } as CreateSupportTicket, randomUUID(), actor)).ok, true); assert.equal(posts, 1);
  assert.equal(isSupportContext({ ...context, versionId: null }), false); assert.equal(isSupportContext({ ...context, resourceId: null, versionId: null, revisionId: null }), false);
});
test("a support acknowledgement must match the message, ticket and chosen attachments without claiming delivery", async () => {
  const message = { id: randomUUID(), ticketId: ticket.id, authorKind: "USER" as const, message: "Synthetic follow-up", attachments: [], createdAt: now, notificationStatus: "NOT_REQUIRED" as const }, update = { ticket: { ...ticket, revision: 1 }, message };
  assert.equal(isSupportConversationUpdate(update), true); assert.equal(isSupportMessageView({ ...message, notificationStatus: "SENT" }), false); assert.equal(isSupportConversationUpdate({ ...update, message: { ...message, ticketId: randomUUID() } }), false);
  globalThis.fetch = async path => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json({ ...update, message: { ...message, message: "Unrelated response" } }, { status: 201 });
  const result = await addSupportMessage(ticket.id, supportTicketEtag(ticket), { message: message.message, attachmentIds: [] }, randomUUID(), actor); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "invalid-response");
  globalThis.fetch = async () => Response.json(ticket, { headers: { ETag: `"support-ticket-${ticket.id}-r99"` } }); assert.equal((await getSupportTicket(ticket.id)).ok, false);
});
