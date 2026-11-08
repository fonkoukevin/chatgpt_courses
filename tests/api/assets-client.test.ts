import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { confirmProjectUpload, createProjectUpload, downloadAssetFile, getAssetDownload, listProjectFiles, transferAssetFile } from "../../apps/web/src/lib/api/assets-client";
import { decodeAssetResponse } from "../../apps/web/src/lib/api/assets-response";
import { isAssetDownloadAccess, isAssetUploadIntent, isAssetView } from "../../apps/web/src/lib/api/assets-validation";
import { listNotifications, retryNotification } from "../../apps/web/src/lib/api/notifications-client";
import { isNotificationSummary } from "../../apps/web/src/lib/api/notifications-validation";
import type { AssetDownloadAccess, AssetUploadIntent, AssetView, NotificationSummary } from "../../apps/web/src/lib/api/generated/types.gen";

// Synthetic responses isolate validation and binary transport; no S3/API integration is claimed here.
const originalFetch = globalThis.fetch, actor = randomUUID(), projectId = randomUUID(), assetId = randomUUID();
const instant = "2066-11-08T00:00:00Z", csrf = { token: "unit-only-assets-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const content = new TextEncoder().encode("Production synthétique UTF-8\n"), sha = createHash("sha256").update(content).digest("hex");
function url() { return "http://127.0.0.1:9000/private/opaque?" + new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": "unit/20661108/region/s3/aws4_request", "X-Amz-Date": "20661108T000000Z", "X-Amz-Expires": "60", "X-Amz-SignedHeaders": "host", "X-Amz-Signature": "a".repeat(64) }); }
function asset(state: AssetView["state"] = "PENDING"): AssetView { return { id: assetId, revision: 0, scope: "PROJECT_FILE", kind: "FILE", state, filename: "production.txt", contentType: "text/plain", sizeBytes: content.byteLength, locale: null, projectId, createdAt: instant, readyAt: state === "READY" ? instant : null, rejectionCode: state === "REJECTED" ? "INVALID_TEXT" : null, validationStatus: state === "READY" ? "FORMAT_VERIFIED" : state === "REJECTED" ? "REJECTED" : "PENDING" }; }
function intent(): AssetUploadIntent { return { asset: asset(), method: "PUT", uploadUrl: url(), headers: { "Content-Type": "text/plain" }, expiresAt: instant }; }
function access(): AssetDownloadAccess { return { assetId, method: "GET", url: url(), expiresAt: instant, contentType: "text/plain", filename: "production.txt", disposition: "attachment", sizeBytes: content.byteLength, sha256: sha }; }
function notification(): NotificationSummary { return { id: randomUUID(), type: "PASSWORD_RESET", status: "INDETERMINATE", attempts: 2, cycleAttempts: 2, requeueCount: 0, nextAttemptAt: null, leaseUntil: null, lastErrorCode: "SMTP_IO", createdAt: instant, updatedAt: instant, expiresAt: instant, sentAt: null, purgedAt: null, payloadAvailable: true }; }
function problem(status: number) { return Response.json({ type: "about:blank", title: "Request failed", status, detail: "Synthetic safe failure.", instance: "/api/v1/assets", code: status === 403 ? "CSRF_INVALID" : "RESOURCE_NOT_FOUND", traceId: randomUUID() }, { status, headers: { "Content-Type": "application/problem+json" } }); }
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("les états canoniques refusent READY fabriqué, secrets, mauvais scope et URL non signée", () => {
  for (const state of ["PENDING", "READY", "REJECTED", "EXPIRED"] as const) assert.equal(isAssetView(asset(state)), true);
  for (const value of [{ ...asset(), state: "READY" }, { ...asset("READY"), ownerId: actor }, { ...asset(), bucket: "private" }, { ...asset(), scope: "EDITORIAL" }, { ...asset(), contentType: "text/html" }]) assert.equal(isAssetView(value), false);
  assert.equal(isAssetUploadIntent(intent()), true); assert.equal(isAssetDownloadAccess(access()), true);
  assert.equal(isAssetUploadIntent({ ...intent(), headers: { "Content-Type": "text/plain", Cookie: "must-not-forward" } }), false);
  for (const unsafe of ["javascript:alert(1)", "http://169.254.169.254/latest/meta-data", "http://s3:8333/key", "https://example.invalid/key", url().replace("127.0.0.1", "user:pass@127.0.0.1")]) assert.equal(isAssetDownloadAccess({ ...access(), url: unsafe }), false);
});

test("le PUT sans cookie confirme seulement le transfert et accepte File.type vide", async () => {
  const value = intent(), snapshot = structuredClone(value); let called = 0;
  globalThis.fetch = async (_path, init) => { called++; assert.equal(init?.method, "PUT"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.equal(init.referrerPolicy, "no-referrer"); const headers = new Headers(init.headers); assert.equal(headers.get("Content-Type"), "text/plain"); assert.equal(headers.get("Cookie"), null); assert.equal(headers.get("X-CSRF-TOKEN"), null); return new Response(null, { status: 200 }); };
  const result = await transferAssetFile(value, new File([content], "production.txt")); assert.equal(result.ok, true); if (result.ok) assert.equal(result.data, undefined);
  assert.equal(value.asset.state, "PENDING"); assert.deepEqual(value, snapshot); assert.equal(called, 1);
  assert.equal((await transferAssetFile(value, new File([content], "production.txt", { type: "text/html" }))).ok, false); assert.equal(called, 1);
});

test("le téléchargement contrôle réellement MIME, octets exacts et SHA-256 sans cookie", async () => {
  globalThis.fetch = async (_path, init) => { assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store"); assert.equal(init?.headers, undefined); return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Length": String(content.byteLength) } }); };
  const result = await downloadAssetFile(access()); assert.equal(result.ok, true); if (result.ok) assert.equal(await result.data.text(), new TextDecoder().decode(content));
  assert.equal((await downloadAssetFile({ ...access(), sha256: "0".repeat(64) })).ok, false);
  for (const headers of [new Headers({ "Content-Type": "text/html" }), new Headers({ "Content-Type": "text/plain", "Content-Length": "1000" })]) { globalThis.fetch = async () => new Response(content, { headers }); assert.equal((await downloadAssetFile(access())).ok, false); }
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(content.byteLength + 1)); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/plain" } });
  assert.equal((await downloadAssetFile(access())).ok, false); assert.equal(cancelled, true);
});

test("les erreurs XML externes restent normalisées sans lire ou exposer le corps S3", async () => {
  let read = false;
  globalThis.fetch = async () => { const response = new Response("<Error>synthetic external details</Error>", { status: 403 }); response.text = async () => { read = true; throw new Error("External body must not be exposed"); }; return response; };
  assert.deepEqual(await downloadAssetFile(access()), { ok: false, error: { kind: "http", status: 403 } }); assert.equal(read, false);
  assert.deepEqual(await decodeAssetResponse(new Response("<Error/>", { status: 503, headers: { "Content-Type": "application/xml" } }), isAssetView), { ok: false, error: { kind: "invalid-response", status: 503 } });
});

test("les wrappers lient compte, projet et asset et ne confondent pas refus de confirmation et disponibilité", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); calls.push({ path: String(path), init: init ?? {} }); return String(path).endsWith("upload-intents") ? Response.json(intent(), { status: 201 }) : Response.json(asset("REJECTED")); };
  assert.equal((await createProjectUpload(projectId, { filename: "production.txt", contentType: "text/plain", sizeBytes: content.byteLength }, actor)).ok, true);
  const rejected = await confirmProjectUpload(projectId, assetId, actor); assert.equal(rejected.ok, true); if (rejected.ok) assert.equal(rejected.data.state, "REJECTED");
  for (const call of calls) { const headers = new Headers(call.init.headers); assert.equal(headers.get("X-Account-Context"), actor); assert.equal(headers.get("X-CSRF-TOKEN"), csrf.token); assert.equal(call.init.credentials, "same-origin"); assert.equal(call.init.cache, "no-store"); }
  globalThis.fetch = async () => Response.json({ items: [{ ...asset(), projectId: randomUUID() }], page: 0, pageSize: 20, total: 1 }); assert.equal((await listProjectFiles(projectId)).ok, false);
  clearCsrfToken(); globalThis.fetch = async (path) => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json({ ...access(), assetId: randomUUID() }); assert.equal((await getAssetDownload(assetId, null, actor)).ok, false);
});

test("les métadonnées de notifications sont expurgées et la reprise ne répète pas une écriture refusée", async () => {
  const item = notification(); assert.equal(isNotificationSummary(item), true);
  for (const secret of [{ recipient: "synthetic@example.invalid" }, { payload: "synthetic secret" }, { businessKey: "synthetic-key" }, { ciphertext: "synthetic" }]) assert.equal(isNotificationSummary({ ...item, ...secret }), false);
  let writes = 0;
  globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); writes++; assert.equal(new Headers(init?.headers).get("X-Account-Context"), actor); assert.deepEqual(JSON.parse(String(init?.body)), { reason: "MANUAL_RECONCILIATION", ackDuplicate: true }); return problem(403); };
  const result = await retryNotification(item.id, { reason: "MANUAL_RECONCILIATION", ackDuplicate: true }, actor); assert.equal(result.ok, false); assert.equal(writes, 1);
  globalThis.fetch = async () => Response.json({ items: [{ ...item, status: "SENT" }], page: 0, pageSize: 20, total: 1 }); assert.equal((await listNotifications({ status: "INDETERMINATE" })).ok, false);
});
