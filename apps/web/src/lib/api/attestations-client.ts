import type { AuthResult } from "./auth-client";
import type { AttestationDocument, IssueAttestation } from "./generated/types.gen";
import type { Locale } from "../i18n/locales";
import { isAttestationContentType, isAttestationDocument, isAttestationEligibility, isAttestationEnrollmentPage, isAttestationPage, isAttestationView } from "./attestations-validation";
import { hash } from "./account-validation-common";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";
import { isProblem } from "./client";

const language = (locale: Locale) => { if (locale !== "fr" && locale !== "en") throw new Error("Invalid attestation locale."); return locale; };
export const listAttestationEnrollments = (page = 0, pageSize = 20) => readResourceJson(`/me/attestation-enrollments?${resourcePagination(page, pageSize)}`, matching(isAttestationEnrollmentPage, value => value.page === page && value.pageSize === pageSize));
export const getAttestationEligibility = (enrollmentId: string, locale: Locale) => readResourceJson(`/me/enrollments/${id(enrollmentId)}/attestation-eligibility?locale=${language(locale)}`, matching(isAttestationEligibility, value => value.enrollmentId === enrollmentId && value.locale === locale));
export const listAttestations = (page = 0, pageSize = 20) => readResourceJson(`/me/attestations?${resourcePagination(page, pageSize)}`, matching(isAttestationPage, value => value.page === page && value.pageSize === pageSize));
export const getAttestation = (attestationId: string) => readResourceJson(`/me/attestations/${id(attestationId)}`, matching(isAttestationView, value => value.summary.id === attestationId));
export function issueAttestation(enrollmentId: string, body: IssueAttestation, key: string, accountContext: string) {
  if (!hash(body.expectedEvidenceFingerprint)) throw new Error("A confirmed participation fingerprint is required.");
  return mutateResourceJson(`/me/enrollments/${id(enrollmentId)}/attestations`, { locale: language(body.locale), expectedEvidenceFingerprint: body.expectedEvidenceFingerprint }, id(accountContext), matching(isAttestationView, value => value.summary.enrollmentId === enrollmentId && value.summary.locale === body.locale && value.evidenceFingerprint === body.expectedEvidenceFingerprint), [200, 201], { idempotencyKey: key });
}
/** HTML is downloaded as a file; no returned HTML is inserted into the application DOM. */
export async function downloadAttestationDocument(attestationId: string, document: AttestationDocument): Promise<AuthResult<Blob>> {
  id(attestationId);
  if (!isAttestationDocument(document) || document.filename !== `attestation-${attestationId}.html`) return { ok: false, error: { kind: "invalid-response", status: 0 } };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`/api/v1/me/attestations/${attestationId}/document`, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal });
    const media = response.headers.get("Content-Type")?.toLowerCase();
    if (!response.ok) { let problem: unknown; try { problem = await response.json(); } catch { /* A malformed error is not a verified Problem. */ } return { ok: false, error: media?.split(";")[0] === "application/problem+json" && isProblem(problem, response.status) ? { kind: [502, 503, 504].includes(response.status) ? "unavailable" : "http", status: response.status, problem } : { kind: "invalid-response", status: response.status } }; }
    const length = response.headers.get("Content-Length");
    if (response.status !== 200 || !isAttestationContentType(media ?? null) || length !== null && (!/^\d+$/.test(length) || Number(length) !== document.sizeBytes) || !response.body) { await response.body?.cancel(); return { ok: false, error: { kind: "invalid-response", status: response.status } }; }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > document.sizeBytes || size > 262144) { await reader.cancel(); return { ok: false, error: { kind: "invalid-response", status: response.status } }; } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
    if (size !== document.sizeBytes) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== document.sha256) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: true, data: new Blob([bytes], { type: document.contentType }), status: response.status };
  } catch { return { ok: false, error: { kind: "unavailable" } }; } finally { clearTimeout(timer); }
}
