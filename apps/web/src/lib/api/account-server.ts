import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { AuthResult } from "./auth-client";
import { decodeAssetResponse } from "./assets-response";
import { checkProfile, checkDataRequest } from "./account-client";
import { checkSupportTicket, supportQuery, type SupportQuery } from "./support-client";
import { isCommercialDocuments, isDataRequestPage, isDataRequestView, isProfileView } from "./account-validation";
import { isSupportTicketPage, isSupportTicketView } from "./support-validation";
import { isAttestationEnrollmentPage, isAttestationPage, isAttestationView } from "./attestations-validation";
import { matchingResource as matching, resourceId as id, resourcePagination } from "./resource-http";

async function read<T>(path: string, guard: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  try { const config = getServerConfig(); const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), { headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs) }); return await decodeAssetResponse(response, guard); }
  catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readAccountProfile = () => checkProfile(read("/me/profile", isProfileView));
export const readCommercialDocuments = (orderId: string) => read(`/me/orders/${id(orderId)}/documents`, matching(isCommercialDocuments, value => value.orderId === orderId));
export const readSupportTickets = (query: SupportQuery = {}) => read(`/me/support-tickets?${supportQuery(query)}`, matching(isSupportTicketPage, value => value.page === (query.page ?? 0) && value.pageSize === (query.pageSize ?? 20) && value.items.every(item => !query.state || item.state === query.state)));
export const readSupportTicket = (ticketId: string) => checkSupportTicket(read(`/me/support-tickets/${id(ticketId)}`, matching(isSupportTicketView, value => value.id === ticketId)));
export const readDataRequests = (page = 0, pageSize = 20) => read(`/me/data-requests?${resourcePagination(page, pageSize)}`, matching(isDataRequestPage, value => value.page === page && value.pageSize === pageSize));
export const readDataRequest = (requestId: string) => checkDataRequest(read(`/me/data-requests/${id(requestId)}`, matching(isDataRequestView, value => value.id === requestId)));
export const readAttestations = (page = 0, pageSize = 20) => read(`/me/attestations?${resourcePagination(page, pageSize)}`, matching(isAttestationPage, value => value.page === page && value.pageSize === pageSize));
export const readAttestation = (attestationId: string) => read(`/me/attestations/${id(attestationId)}`, matching(isAttestationView, value => value.summary.id === attestationId));
export const readAttestationEnrollments = (page = 0, pageSize = 20) => read(`/me/attestation-enrollments?${resourcePagination(page, pageSize)}`, matching(isAttestationEnrollmentPage, value => value.page === page && value.pageSize === pageSize));
