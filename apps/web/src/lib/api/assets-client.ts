import type { AuthResult } from "./auth-client";
import type { AssetAccessContext, AssetDownloadAccess, AssetUploadIntent, AssetUploadRequest, AssetView, EditorialAssetUploadRequest } from "./generated/types.gen";
import { isAssetDownloadAccess, isAssetPage, isAssetUploadCapabilities, isAssetUploadIntent, isAssetView, maxAssetBytes } from "./assets-validation";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId as id, resourcePagination } from "./resource-http";
import { canonicalFileMime } from "../assets/files";

export const getProjectFilePolicy = (projectId: string) => readResourceJson(`/me/projects/${id(projectId)}/file-policy`, isAssetUploadCapabilities);
export const listProjectFiles = (projectId: string, page = 0, pageSize = 20) => readResourceJson(`/me/projects/${id(projectId)}/attachments?${resourcePagination(page, pageSize)}`, matching(isAssetPage, (value) => value.page === page && value.pageSize === pageSize && value.items.every((asset) => asset.scope === "PROJECT_FILE" && asset.projectId === projectId)));
export const createProjectUpload = (projectId: string, body: AssetUploadRequest, accountContext: string) => mutateResourceJson(`/me/projects/${id(projectId)}/upload-intents`, body, id(accountContext), matching(isAssetUploadIntent, (value) => value.asset.scope === "PROJECT_FILE" && value.asset.projectId === projectId && value.asset.filename === body.filename && value.asset.contentType === body.contentType && value.asset.sizeBytes === body.sizeBytes), [201]);
export const confirmProjectUpload = (projectId: string, assetId: string, accountContext: string) => mutateResourceJson(`/me/projects/${id(projectId)}/attachments`, { assetId: id(assetId) }, id(accountContext), matching(isAssetView, (value) => value.id === assetId && value.scope === "PROJECT_FILE" && value.projectId === projectId));
export const getEditorialUploadPolicy = () => readResourceJson("/admin/assets/upload-policy", isAssetUploadCapabilities);
export const createEditorialUpload = (body: EditorialAssetUploadRequest, accountContext: string) => {
  id(body.resourceId); id(body.versionId); if (body.locale !== "fr" && body.locale !== "en") throw new Error("Invalid editorial asset locale.");
  return mutateResourceJson("/admin/assets/upload-intents", body, id(accountContext), matching(isAssetUploadIntent, (value) => value.asset.scope === "EDITORIAL" && value.asset.locale === body.locale && value.asset.filename === body.filename && value.asset.contentType === body.contentType && value.asset.sizeBytes === body.sizeBytes), [201]);
};
export const getEditorialAsset = (assetId: string) => readResourceJson(`/admin/assets/${id(assetId)}`, matching(isAssetView, (value) => value.id === assetId && value.scope === "EDITORIAL"));
export const confirmEditorialUpload = (assetId: string, accountContext: string) => mutateResourceJson(`/admin/assets/${id(assetId)}/confirmations`, undefined, id(accountContext), matching(isAssetView, (value) => value.id === assetId && value.scope === "EDITORIAL"));
export const getEditorialAssetPreview = (assetId: string, accountContext: string) => mutateResourceJson(`/admin/assets/${id(assetId)}/download-access`, undefined, id(accountContext), matching(isAssetDownloadAccess, (value) => value.assetId === assetId));
export const getSolutionFileDownload = (projectId: string, revealId: string, assetId: string, accountContext: string) => mutateResourceJson(`/me/projects/${id(projectId)}/solution-reveals/${id(revealId)}/files/${id(assetId)}/download-access`, undefined, id(accountContext), matching(isAssetDownloadAccess, value => value.assetId === assetId));
export const getAssetDownload = (assetId: string, context: AssetAccessContext | null, accountContext?: string) => {
  if (context) { id(context.resourceId); id(context.versionId); if (context.enrollmentId) id(context.enrollmentId); if (context.locale !== "fr" && context.locale !== "en") throw new Error("Invalid asset access locale."); }
  return mutateResourceJson(`/assets/${id(assetId)}/download-access`, context, accountContext, matching(isAssetDownloadAccess, (value) => value.assetId === assetId));
};

// Binary transport receives only the canonical, validated API intent/access.
// No API cookie, CSRF header, external XML response or signed URL is forwarded to logs.
export async function transferAssetFile(intent: AssetUploadIntent, file: File): Promise<AuthResult<void>> {
  if (!isAssetUploadIntent(intent) || Date.parse(intent.expiresAt) <= Date.now() || file.size !== intent.asset.sizeBytes || file.name !== intent.asset.filename || file.type && canonicalFileMime(file) !== intent.asset.contentType) return { ok: false, error: { kind: "invalid-response", status: 0 } };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.headers, body: file, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
    if (![200, 201, 204].includes(response.status)) return { ok: false, error: { kind: response.status >= 500 ? "unavailable" : "http", status: response.status } };
    return { ok: true, data: undefined, status: response.status };
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
export async function downloadAssetFile(access: AssetDownloadAccess): Promise<AuthResult<Blob>> {
  if (!isAssetDownloadAccess(access) || Date.parse(access.expiresAt) <= Date.now()) return { ok: false, error: { kind: "invalid-response", status: 0 } };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(access.url, { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
    if (response.status !== 200) return { ok: false, error: { kind: response.status >= 500 ? "unavailable" : "http", status: response.status } };
    const length = response.headers.get("Content-Length"), mime = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    if (mime !== access.contentType || length !== null && (!/^\d+$/.test(length) || Number(length) !== access.sizeBytes) || !response.body) { await response.body?.cancel(); return { ok: false, error: { kind: "invalid-response", status: response.status } }; }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > access.sizeBytes || size > maxAssetBytes) { await reader.cancel(); return { ok: false, error: { kind: "invalid-response", status: response.status } }; } chunks.push(chunk.value); }
    } finally { reader.releaseLock(); }
    if (size !== access.sizeBytes) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    if (hash !== access.sha256) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: true, data: new Blob([bytes], { type: access.contentType }), status: response.status };
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
export type { AssetView };
