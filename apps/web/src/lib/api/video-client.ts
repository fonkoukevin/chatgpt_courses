import type { AuthResult } from "./auth-client";
import type { MediaAccessContext, MediaProgressView, SetMediaProgress } from "./generated/types.gen";
import { matchingResource, mutateResourceJson, readResourceJson, resourceId } from "./resource-http";
import { isMediaAccessContext, isMediaProgressView, isVideoMediaView, isVideoPlaybackAccess } from "./video-validation";

function query(context: MediaAccessContext): string {
  if (!isMediaAccessContext(context)) throw new Error("Invalid media publication context.");
  return new URLSearchParams({ resourceId: context.resourceId, versionId: context.versionId, locale: context.locale, ...(context.enrollmentId ? { enrollmentId: context.enrollmentId } : {}) }).toString();
}
export const mediaProgressEtag = (value: MediaProgressView) => `"media-progress-${value.mediaId}-r${value.revision}"`;
function strongProgressTag(tag: string, mediaId: string): boolean {
  return new RegExp(`^"media-progress-${mediaId}-r(?:0|[1-9][0-9]*)"$`).test(tag);
}
async function progressResult(result: Promise<AuthResult<MediaProgressView>>): Promise<AuthResult<MediaProgressView>> {
  const value = await result;
  return value.ok && value.etag !== mediaProgressEtag(value.data) ? { ok: false, error: { kind: "invalid-response", status: value.status } } : value;
}
export const getVideoMedia = (mediaId: string, context: MediaAccessContext) => readResourceJson(`/media/${resourceId(mediaId)}?${query(context)}`, matchingResource(isVideoMediaView, (value) => value.id === mediaId && value.locale === context.locale));
export function getVideoPlayback(mediaId: string, context: MediaAccessContext, accountContext?: string) {
  resourceId(mediaId); query(context);
  return mutateResourceJson(`/media/${mediaId}/playback-access`, context, accountContext, matchingResource(isVideoPlaybackAccess, (value) => value.mediaId === mediaId && Date.parse(value.expiresAt) > Date.now()));
}
export const getMediaProgress = (mediaId: string, context: MediaAccessContext) => progressResult(readResourceJson(`/me/media-progress/${resourceId(mediaId)}?${query(context)}`, matchingResource(isMediaProgressView, (value) => value.mediaId === mediaId && value.locale === context.locale)));
export function setMediaProgress(mediaId: string, etag: string, body: SetMediaProgress, accountContext: string): Promise<AuthResult<MediaProgressView>> {
  resourceId(mediaId); query(body.context); resourceId(accountContext);
  if (!strongProgressTag(etag, mediaId) || !Number.isFinite(body.positionSeconds) || body.positionSeconds < 0 || body.positionSeconds > 86400) throw new Error("Invalid media position or precondition.");
  return progressResult(mutateResourceJson(`/me/media-progress/${mediaId}`, { context: body.context, positionSeconds: body.positionSeconds }, accountContext,
    matchingResource(isMediaProgressView, (value) => value.mediaId === mediaId && value.locale === body.context.locale), [200], { method: "PUT", etag }));
}
