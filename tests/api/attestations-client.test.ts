import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { downloadAttestationDocument, issueAttestation } from "../../apps/web/src/lib/api/attestations-client";
import { isAttestationEligibility, isAttestationView } from "../../apps/web/src/lib/api/attestations-validation";
import type { AttestationEligibility, AttestationView, ParticipationEvidence } from "../../apps/web/src/lib/api/generated/types.gen";
const originalFetch = globalThis.fetch, actor = randomUUID(), enrollmentId = randomUUID(), attestationId = randomUUID(), now = "2026-11-08T00:00:00Z", fingerprint = "a".repeat(64), csrf = { token: "unit-only-attestation-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const bytes = new TextEncoder().encode('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Synthetic participation</title></html>');
const document = { format: "HTML" as const, contentType: "text/html; charset=UTF-8" as const, filename: `attestation-${attestationId}.html`, sizeBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
const evidence: ParticipationEvidence = { enrollmentId, courseResourceId: randomUUID(), courseVersionId: randomUUID(), courseVersionNumber: 1, courseTitle: "Synthetic retained course", enrolledLocale: "fr", profileRevision: 1, participantName: "Synthetic declared name", identityVerified: false, humanReview: false, activities: [{ activityId: randomUUID(), activityVersionId: randomUUID(), position: 1, title: "Synthetic activity", readAt: now, declaredCompletedAt: now }], quizzes: [], selfAssessments: [] };
const view: AttestationView = { summary: { id: attestationId, enrollmentId, type: "PARTICIPATION", locale: "fr", courseResourceId: evidence.courseResourceId, courseVersionId: evidence.courseVersionId, courseVersionNumber: 1, courseTitle: evidence.courseTitle, participantName: evidence.participantName!, issuedAt: now, document }, evidenceFingerprint: fingerprint, evidence };
beforeEach(() => clearCsrfToken()); afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });
test("issuance confirms only a reviewed participation fingerprint and rejects changed or unrelated evidence", async () => {
  const body = { locale: "fr" as const, expectedEvidenceFingerprint: fingerprint }; let posts = 0;
  globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(csrf); posts++; assert.equal(new Headers(init?.headers).get("X-Account-Context"), actor); assert.deepEqual(JSON.parse(String(init?.body)), body); return Response.json(view, { status: 201 }); };
  assert.equal((await issueAttestation(enrollmentId, body, randomUUID(), actor)).ok, true); assert.equal(posts, 1);
  globalThis.fetch = async () => Response.json({ ...view, evidenceFingerprint: "b".repeat(64) }, { status: 201 }); assert.equal((await issueAttestation(enrollmentId, body, randomUUID(), actor)).ok, false);
  assert.equal(isAttestationView({ ...view, evidence: { ...evidence, humanReview: true } }), false); assert.equal(isAttestationView({ ...view, summary: { ...view.summary, participantName: "Different snapshot" } }), false);
  const eligibility: AttestationEligibility = { enrollmentId, type: "PARTICIPATION", locale: "fr", eligible: true, blockingCodes: [], criteria: [{ code: "PROFILE_NAME_PRESENT", met: true }, { code: "PERSISTED_PARTICIPATION_PRESENT", met: true }], evidenceFingerprint: fingerprint, evidence };
  assert.equal(isAttestationEligibility(eligibility), true); assert.equal(isAttestationEligibility({ ...eligibility, blockingCodes: ["PROFILE_NAME_PRESENT"] }), false);
});
test("real HTML download accepts MIME whitespace, verifies exact bytes and never embeds returned HTML", async () => {
  globalThis.fetch = async (path, init) => { assert.equal(path, `/api/v1/me/attestations/${attestationId}/document`); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); return new Response(bytes, { headers: { "Content-Type": "text/html;charset=UTF-8", "Content-Length": String(bytes.byteLength) } }); };
  const value = await downloadAttestationDocument(attestationId, document); assert.equal(value.ok, true); if (value.ok) assert.deepEqual(new Uint8Array(await value.data.arrayBuffer()), bytes);
  globalThis.fetch = async () => new Response(bytes, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  assert.equal((await downloadAttestationDocument(attestationId, { ...document, sha256: "0".repeat(64) })).ok, false);
  for (const contentType of ["text/html", "text/html; charset=iso-8859-1", "text/html; charset=utf-8; script=allowed", "application/json"]) { globalThis.fetch = async () => new Response(bytes, { headers: { "Content-Type": contentType } }); assert.equal((await downloadAttestationDocument(attestationId, document)).ok, false); }
});
test("an oversized stream is cancelled and an unavailable document is not reported as downloaded", async () => {
  let cancelled = false; const over = new Uint8Array(document.sizeBytes + 1);
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(over); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": document.contentType } });
  const result = await downloadAttestationDocument(attestationId, document); assert.equal(result.ok, false); assert.equal(cancelled, true);
  globalThis.fetch = async () => { throw new TypeError("Synthetic unavailable document"); }; const unavailable = await downloadAttestationDocument(attestationId, document); assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.error.kind, "unavailable");
});
