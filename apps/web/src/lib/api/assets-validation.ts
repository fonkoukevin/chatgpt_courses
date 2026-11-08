import type { AssetAcceptedFormat, AssetDownloadAccess, AssetPage, AssetUploadCapabilities, AssetUploadIntent, AssetView } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";

export const maxAssetBytes = 20 * 1024 * 1024;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const oneOf = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const instant = (value: unknown): value is string => typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const code = (value: unknown) => typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value);
const mime = (value: unknown): value is AssetView["contentType"] => oneOf(value, ["text/plain", "application/pdf", "image/png", "image/jpeg"]);
export function assetFilename(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 180 && !/[\\/]/.test(value)
    && Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
}
export function isSignedAssetUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || !url.hostname || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) return false;
    const params = url.searchParams;
    for (const key of ["X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires", "X-Amz-SignedHeaders", "X-Amz-Signature"]) if (params.getAll(key).length !== 1) return false;
    return params.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" && Boolean(params.get("X-Amz-Credential"))
      && /^\d{8}T\d{6}Z$/.test(params.get("X-Amz-Date")!) && /^\d+$/.test(params.get("X-Amz-Expires")!) && Number(params.get("X-Amz-Expires")) >= 1 && Number(params.get("X-Amz-Expires")) <= 900
      && Boolean(params.get("X-Amz-SignedHeaders")) && /^[a-f0-9]{64}$/.test(params.get("X-Amz-Signature")!);
  } catch { return false; }
}
export function isAssetView(value: unknown): value is AssetView {
  if (!record(value) || !exact(value, ["id", "revision", "scope", "kind", "state", "filename", "contentType", "sizeBytes", "locale", "projectId", "createdAt", "readyAt", "rejectionCode", "validationStatus"])
    || !isUuid(value.id) || !integer(value.revision) || !oneOf(value.scope, ["PROJECT_FILE", "EDITORIAL"]) || !oneOf(value.kind, ["FILE", "IMAGE"]) || !oneOf(value.state, ["PENDING", "READY", "REJECTED", "EXPIRED"])
    || !assetFilename(value.filename) || !mime(value.contentType) || !integer(value.sizeBytes, 1, maxAssetBytes) || !instant(value.createdAt)) return false;
  if (value.scope === "PROJECT_FILE" ? !isUuid(value.projectId) || value.locale !== null || value.kind !== "FILE" : value.projectId !== null || !oneOf(value.locale, ["fr", "en"])) return false;
  if ((value.kind === "IMAGE") !== ["image/png", "image/jpeg"].includes(value.contentType)) return false;
  if (value.state === "READY") return value.validationStatus === "FORMAT_VERIFIED" && instant(value.readyAt) && Date.parse(value.readyAt) >= Date.parse(value.createdAt) && value.rejectionCode === null;
  if (value.readyAt !== null) return false;
  return value.state === "REJECTED" ? value.validationStatus === "REJECTED" && code(value.rejectionCode) : value.validationStatus === "PENDING" && value.rejectionCode === null;
}
export function isAssetUploadIntent(value: unknown): value is AssetUploadIntent {
  if (!record(value) || !isAssetView(value.asset)) return false;
  const asset = value.asset;
  return exact(value, ["asset", "method", "uploadUrl", "headers", "expiresAt"]) && asset.state === "PENDING"
    && value.method === "PUT" && isSignedAssetUrl(value.uploadUrl) && instant(value.expiresAt) && record(value.headers) && Object.keys(value.headers).length === 1
    && Object.entries(value.headers).every(([name, content]) => name.toLowerCase() === "content-type" && content === asset.contentType);
}
function acceptedFormat(value: unknown): value is AssetAcceptedFormat {
  return record(value) && exact(value, ["contentType", "extensions", "kind", "maxBytes", "available", "unavailableReason"]) && mime(value.contentType)
    && Array.isArray(value.extensions) && value.extensions.length >= 1 && value.extensions.length <= 4 && value.extensions.every((extension) => typeof extension === "string" && /^\.[a-z0-9]{1,11}$/.test(extension))
    && oneOf(value.kind, ["FILE", "IMAGE"]) && (value.kind === "IMAGE") === ["image/png", "image/jpeg"].includes(value.contentType)
    && integer(value.maxBytes, 1, maxAssetBytes) && typeof value.available === "boolean" && (value.available ? value.unavailableReason === null : code(value.unavailableReason));
}
export function isAssetUploadCapabilities(value: unknown): value is AssetUploadCapabilities {
  return record(value) && exact(value, ["enabled", "unavailableReason", "formats", "maxFileBytes", "maxFilesPerProject", "maxBytesPerProject", "uploadTtlSeconds", "downloadTtlSeconds"])
    && typeof value.enabled === "boolean" && (value.enabled ? value.unavailableReason === null : code(value.unavailableReason)) && Array.isArray(value.formats) && value.formats.length >= 1 && value.formats.length <= 4
    && value.formats.every(acceptedFormat) && new Set(value.formats.map((format: AssetAcceptedFormat) => format.contentType)).size === value.formats.length && (value.enabled || value.formats.every((format: AssetAcceptedFormat) => !format.available))
    && integer(value.maxFileBytes, 1, maxAssetBytes) && integer(value.maxFilesPerProject, 1, 100) && integer(value.maxBytesPerProject, 1, 1024 * 1024 * 1024)
    && integer(value.uploadTtlSeconds, 1, 900) && integer(value.downloadTtlSeconds, 1, 300);
}
export function isAssetPage(value: unknown): value is AssetPage {
  return record(value) && exact(value, ["items", "page", "pageSize", "total"]) && Array.isArray(value.items) && value.items.every(isAssetView)
    && integer(value.page, 0, 1_000_000) && integer(value.pageSize, 1, 100) && integer(value.total) && value.items.length <= value.pageSize;
}
export function isAssetDownloadAccess(value: unknown): value is AssetDownloadAccess {
  return record(value) && exact(value, ["assetId", "method", "url", "expiresAt", "contentType", "filename", "disposition", "sizeBytes", "sha256"])
    && isUuid(value.assetId) && value.method === "GET" && isSignedAssetUrl(value.url) && instant(value.expiresAt) && mime(value.contentType) && assetFilename(value.filename)
    && value.disposition === (["image/png", "image/jpeg"].includes(value.contentType) ? "inline" : "attachment") && integer(value.sizeBytes, 1, maxAssetBytes) && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256);
}
