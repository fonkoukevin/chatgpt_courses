import type { MediaAccessContext, MediaProgressView, VideoMediaView, VideoPlaybackAccess } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";

const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const language = (value: unknown) => value === "fr" || value === "en";
const duration = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 86400;
const position = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86400;
const instant = (value: unknown): value is string => typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const text = (value: unknown): value is string | null => value === null || typeof value === "string" && Array.from(value).length <= 8000;
const mediaBytes = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 134217728;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function isMediaAccessContext(value: unknown): value is MediaAccessContext {
  return record(value) && exact(value, ["locale", "resourceId", "versionId", "enrollmentId"]) && language(value.locale) && isUuid(value.resourceId) && isUuid(value.versionId) && (value.enrollmentId === null || isUuid(value.enrollmentId));
}
export function isVideoMediaView(value: unknown): value is VideoMediaView {
  return record(value) && exact(value, ["id", "locale", "provider", "durationSeconds", "sizeBytes", "sha256", "playbackAvailable", "unavailableReason", "transcript", "captionsVtt"])
    && isUuid(value.id) && language(value.locale) && value.provider === "LOCAL_TEST" && duration(value.durationSeconds) && mediaBytes(value.sizeBytes) && hash(value.sha256)
    && typeof value.playbackAvailable === "boolean" && (value.playbackAvailable ? value.unavailableReason === null : value.unavailableReason === "PROVIDER_NOT_CONFIGURED" || value.unavailableReason === "MEDIA_UNAVAILABLE")
    && text(value.transcript) && text(value.captionsVtt) && (value.captionsVtt === null || value.captionsVtt.startsWith("WEBVTT"));
}
export function isVideoPlaybackAccess(value: unknown): value is VideoPlaybackAccess {
  if (!record(value) || !exact(value, ["mediaId", "provider", "url", "expiresAt", "contentType", "durationSeconds", "sizeBytes", "sha256"]) || !isUuid(value.mediaId)) return false;
  return value.provider === "LOCAL_TEST" && typeof value.url === "string" && new RegExp(`^/api/v1/media/${value.mediaId}/stream\\?grant=[A-Za-z0-9_-]{43}$`).test(value.url)
    && instant(value.expiresAt) && value.contentType === "video/mp4" && duration(value.durationSeconds) && mediaBytes(value.sizeBytes) && hash(value.sha256);
}
export function isMediaProgressView(value: unknown): value is MediaProgressView {
  return record(value) && exact(value, ["mediaId", "locale", "durationSeconds", "positionSeconds", "revision", "updatedAt"])
    && isUuid(value.mediaId) && language(value.locale) && duration(value.durationSeconds) && position(value.positionSeconds) && value.positionSeconds <= value.durationSeconds
    && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.revision === 0 ? value.updatedAt === null && value.positionSeconds === 0 : instant(value.updatedAt));
}
