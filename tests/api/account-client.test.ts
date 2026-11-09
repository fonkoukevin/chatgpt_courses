import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken, signOut } from "../../apps/web/src/lib/api/auth-client";
import { cancelDataRequest, createDataRequest, getAccountProfile, getCommercialDocuments, saveAccountProfile } from "../../apps/web/src/lib/api/account-client";
import { dataRequestEtag, isCommercialDocuments, isDataRequestPage, isDataRequestView, profileEtag } from "../../apps/web/src/lib/api/account-validation";
import { accountIntent } from "../../apps/web/src/lib/account/intent";
import { attestationsHref, helpHref, safeAccountDestination, translateAccountDestination } from "../../apps/web/src/lib/account/routes";
import { safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import type { DataRequestView, ProfileView } from "../../apps/web/src/lib/api/generated/types.gen";

const originalFetch = globalThis.fetch, actor = randomUUID(), now = "2026-11-08T00:00:00Z", csrf = { token: "unit-only-account-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const profile: ProfileView = { id: actor, email: "unit-account@example.test", displayName: "Synthetic declared name", revision: 2 };
const request: DataRequestView = { id: randomUUID(), revision: 0, type: "EXPORT", reason: "Synthetic data request", state: "WAITING_POLICY", processingUnavailableReason: "RETENTION_POLICY_UNCONFIGURED", createdAt: now, updatedAt: now, cancelledAt: null };
beforeEach(() => clearCsrfToken()); afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("profile changes are account-scoped and a no-op is valid only with an exact acknowledgement and strong revision", async () => {
  let patches = 0;
  globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); patches++; const headers = new Headers(init?.headers); assert.equal(init?.method, "PATCH"); assert.equal(init?.cache, "no-store"); assert.equal(headers.get("X-Account-Context"), actor); assert.equal(headers.get("If-Match"), profileEtag(profile)); assert.deepEqual(JSON.parse(String(init?.body)), { displayName: profile.displayName }); return Response.json(profile, { headers: { ETag: profileEtag(profile) } }); };
  assert.equal((await saveAccountProfile(profileEtag(profile), { displayName: profile.displayName, email: "not-sent@example.test" } as ProfileView, actor)).ok, true); assert.equal(patches, 1);
  globalThis.fetch = async () => Response.json(profile, { headers: { ETag: `W/${profileEtag(profile)}` } });
  const invalid = await getAccountProfile(); assert.equal(invalid.ok, false); if (!invalid.ok) assert.equal(invalid.error.kind, "invalid-response");
  assert.throws(() => saveAccountProfile(profileEtag(profile), { displayName: "A" }, "unknown"));
});

test("an ambiguous data request preserves its exact idempotency intention without a repeated transport mutation", async () => {
  const body = { type: request.type, reason: request.reason }, attempt = accountIntent(null, "data-request", actor, body, randomUUID); let writes = 0; const keys: Array<string | null> = [];
  globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); writes++; keys.push(new Headers(init?.headers).get("Idempotency-Key")); if (writes === 1) throw new TypeError("Synthetic ambiguous transport"); return Response.json(request, { status: 201, headers: { ETag: dataRequestEtag(request) } }); };
  const first = await createDataRequest(body, attempt.key, actor); assert.equal(first.ok, false); assert.equal(writes, 1);
  const retry = accountIntent(attempt, "data-request", actor, body, () => { throw new Error("Identical retry must retain the key"); });
  assert.equal((await createDataRequest(body, retry.key, actor)).ok, true); assert.deepEqual(keys, [attempt.key, attempt.key]);
  assert.notEqual(accountIntent(attempt, "data-request", randomUUID(), body, randomUUID).key, attempt.key);
  assert.notEqual(accountIntent(attempt, "data-request", actor, { ...body, type: "ERASURE" }, randomUUID).key, attempt.key);
});

test("data requests cannot be presented as exports or deletion; cancellation requires the matching revision", async () => {
  assert.equal(isDataRequestView(request), true); assert.equal(isDataRequestView({ ...request, state: "COMPLETED" }), false); assert.equal(isDataRequestView({ ...request, state: ["WAITING_POLICY"] }), false); assert.equal(isDataRequestView({ ...request, cancelledAt: now }), false);
  assert.equal(isDataRequestPage({ items: [request, request], page: 0, pageSize: 20, total: 2 }), false);
  assert.throws(() => cancelDataRequest(request.id, `"data-request-${randomUUID()}-r0"`, { reason: "Synthetic cancellation" }, randomUUID(), actor));
  let posts = 0; globalThis.fetch = async path => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); posts++; return Response.json({ type: "about:blank", title: "Conflict", status: 412, detail: "Synthetic stale revision", instance: "/api/v1/me/data-requests", code: "REVISION_CONFLICT", traceId: randomUUID() }, { status: 412, headers: { "Content-Type": "application/problem+json" } }); };
  const result = await cancelDataRequest(request.id, dataRequestEtag(request), { reason: "Synthetic cancellation" }, randomUUID(), actor); assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.error.kind, "http"); assert.equal(result.error.status, 412); } assert.equal(posts, 1);
});

test("no commercial document is inferred from a paid order or an unrelated response", async () => {
  const orderId = randomUUID(), documents = { orderId, state: "NONE_AVAILABLE", documents: [], unavailableReason: "NO_VERIFIED_COMMERCIAL_DOCUMENT" };
  assert.equal(isCommercialDocuments(documents), true); assert.equal(isCommercialDocuments({ ...documents, documents: [{ id: randomUUID(), kind: "INVOICE", filename: "invented.pdf", contentType: "application/pdf" }] }), false);
  globalThis.fetch = async () => Response.json({ ...documents, orderId: randomUUID() }); assert.equal((await getCommercialDocuments(orderId)).ok, false);
  globalThis.fetch = async () => { throw new TypeError("Synthetic unavailable transport"); }; const result = await getCommercialDocuments(orderId); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "unavailable");
});

test("logout carries the expected account, with no retry after a context mismatch", async () => {
  let posts = 0; globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); posts++; assert.equal(new Headers(init?.headers).get("X-Account-Context"), actor); return Response.json({ type: "about:blank", title: "Account changed", status: 409, detail: "Synthetic changed account", instance: "/api/v1/auth/logout", code: "ACCOUNT_CONTEXT_CHANGED", traceId: randomUUID() }, { status: 409, headers: { "Content-Type": "application/problem+json" } }); };
  const result = await signOut(actor); assert.equal(result.ok, false); assert.equal(posts, 1);
  await assert.rejects(signOut("missing-context")); assert.equal(posts, 1);
});

test("account destinations retain only known UUID context across login and language changes", () => {
  const enrollmentId = randomUUID(), resourceId = randomUUID(), versionId = randomUUID(), revisionId = randomUUID(), route = helpHref("fr", { resourceId, versionId, revisionId, enrollmentId, page: 1 });
  assert.equal(safeReturnTo(route, "fr"), route); assert.equal(translateReturnTo(route, "en"), helpHref("en", { page: 1, resourceId, versionId, revisionId, enrollmentId }));
  const attestation = attestationsHref("fr", { enrollmentId }); assert.equal(translateAccountDestination(attestation, "en"), attestationsHref("en", { enrollmentId }));
  for (const invalid of [route + "&message=private", route + "&page=1", "/fr/compte/aide?resourceId=" + resourceId, "//other.invalid/fr/compte", "/fr/compte/aide%3fpage=1", attestationsHref("fr") + "?enrollmentId=bad"]) assert.equal(safeAccountDestination(invalid, "fr"), null);
});

test("a French content revision remains French under an English interface and authentication return", () => {
  const context = { resourceId: randomUUID(), versionId: randomUUID(), revisionId: randomUUID(), contextLocale: "fr" as const }, english = helpHref("en", context), french = helpHref("fr", context);
  assert.equal(safeReturnTo(english, "en"), english);
  assert.equal(translateReturnTo(english, "fr"), french);
  assert.equal(translateReturnTo(french, "en"), english);
  assert.equal(new URLSearchParams(english.split("?")[1]).get("contextLocale"), "fr");
  for (const invalid of [english.replace("contextLocale=fr", "contextLocale=de"), english + "&contextLocale=en", "/en/account/help?contextLocale=fr", english.replace(`versionId=${context.versionId}`, "versionId=missing")]) assert.equal(safeAccountDestination(invalid, "en"), null);
  assert.throws(() => helpHref("en", { contextLocale: "fr" }));
});
