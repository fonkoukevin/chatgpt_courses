import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { getMediaProgress, getVideoMedia, getVideoPlayback, mediaProgressEtag, setMediaProgress } from "../../apps/web/src/lib/api/video-client";
import { isMediaProgressView, isVideoMediaView, isVideoPlaybackAccess } from "../../apps/web/src/lib/api/video-validation";
import type { MediaAccessContext, MediaProgressView, VideoMediaView, VideoPlaybackAccess } from "../../apps/web/src/lib/api/generated/types.gen";

// Synthetic HTTP isolates boundaries; decoding or playing an MP4 is not claimed by these unit tests.
const originalFetch = globalThis.fetch, mediaId = randomUUID(), otherId = randomUUID(), account = randomUUID();
const context: MediaAccessContext = { locale: "fr", resourceId: randomUUID(), versionId: randomUUID(), enrollmentId: null };
const csrf = { token: "unit-only-video-csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" };
const metadata: VideoMediaView = { id: mediaId, locale: "fr", provider: "LOCAL_TEST", durationSeconds: 5.125, sizeBytes: 1024, sha256: "a".repeat(64), playbackAvailable: true, unavailableReason: null, transcript: null, captionsVtt: null };
const access = (): VideoPlaybackAccess => ({ mediaId, provider: "LOCAL_TEST", url: `/api/v1/media/${mediaId}/stream?grant=${"a".repeat(43)}`, expiresAt: new Date(Date.now() + 60_000).toISOString(), contentType: "video/mp4", durationSeconds: metadata.durationSeconds, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256 });
const progress = (revision = 0): MediaProgressView => ({ mediaId, locale: "fr", durationSeconds: metadata.durationSeconds, positionSeconds: revision ? 2 : 0, revision, updatedAt: revision ? "2026-11-08T00:00:00Z" : null });
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("les métadonnées distinguent média réel indisponible et durée fabriquée ou données internes", () => {
  assert.equal(isVideoMediaView(metadata), true);
  assert.equal(isVideoMediaView({ ...metadata, playbackAvailable: false, unavailableReason: "PROVIDER_NOT_CONFIGURED" }), true);
  for (const value of [{ ...metadata, durationSeconds: 0 }, { ...metadata, durationSeconds: NaN }, { ...metadata, sizeBytes: 134217729 }, { ...metadata, playbackAvailable: false }, { ...metadata, playbackAvailable: false, unavailableReason: ["MEDIA_UNAVAILABLE"] }, { ...metadata, privatePath: "must-not-expose" }, { ...metadata, captionsVtt: "<script>invalid</script>" }]) assert.equal(isVideoMediaView(value), false);
});

test("le lecteur accepte uniquement le chemin de stream exact du média avec un grant opaque", async () => {
  assert.equal(isVideoPlaybackAccess(access()), true);
  for (const url of ["https://example.invalid/stream", `//example.invalid/api/v1/media/${mediaId}/stream`, access().url + "&extra=1", access().url.replace(mediaId, otherId), access().url.replace("/stream", "/../stream"), access().url + "#fragment", access().url.replace("/api/v1", "\\api\\v1")]) assert.equal(isVideoPlaybackAccess({ ...access(), url }), false);
  globalThis.fetch = async (path) => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json({ ...access(), expiresAt: "2000-01-01T00:00:00Z" });
  assert.equal((await getVideoPlayback(mediaId, context)).ok, false);
});

test("la position initiale n'est pas une sauvegarde, son ETag fort et son identité sont obligatoires", async () => {
  assert.equal(isMediaProgressView(progress()), true);
  for (const value of [{ ...progress(), positionSeconds: 1 }, { ...progress(1), positionSeconds: 6 }, { ...progress(1), updatedAt: null }]) assert.equal(isMediaProgressView(value), false);
  const response = (value: MediaProgressView, etag?: string) => Response.json(value, { headers: etag ? { ETag: etag } : {} });
  globalThis.fetch = async (path, init) => { const url = new URL(String(path), "http://localhost"); assert.equal(url.searchParams.get("versionId"), context.versionId); assert.equal(url.searchParams.get("enrollmentId"), null); assert.equal(init?.cache, "no-store"); return response(progress(), mediaProgressEtag(progress())); };
  assert.equal((await getMediaProgress(mediaId, context)).ok, true);
  for (const etag of [undefined, `W/${mediaProgressEtag(progress())}`, mediaProgressEtag(progress(1))]) { globalThis.fetch = async () => response(progress(), etag); assert.equal((await getMediaProgress(mediaId, context)).ok, false); }
  for (const value of [{ ...progress(), mediaId: otherId }, { ...progress(), locale: "en" as const }]) { globalThis.fetch = async () => response(value, mediaProgressEtag(value)); assert.equal((await getMediaProgress(mediaId, context)).ok, false); }
});

test("le PUT lie compte, publication et ETag sans répéter une écriture refusée", async () => {
  let writes = 0;
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(csrf);
    writes++; assert.equal(init?.method, "PUT"); const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Account-Context"), account); assert.equal(headers.get("If-Match"), mediaProgressEtag(progress())); assert.equal(headers.get("X-CSRF-TOKEN"), csrf.token);
    assert.deepEqual(JSON.parse(String(init?.body)), { context, positionSeconds: 2 });
    return Response.json({ type: "about:blank", title: "Request failed", status: 403, detail: "Synthetic safe failure.", instance: `/api/v1/me/media-progress/${mediaId}`, code: "CSRF_INVALID", traceId: randomUUID() }, { status: 403, headers: { "Content-Type": "application/problem+json" } });
  };
  const result = await setMediaProgress(mediaId, mediaProgressEtag(progress()), { context, positionSeconds: 2 }, account); assert.equal(result.ok, false); assert.equal(writes, 1);
  globalThis.fetch = async () => { throw new Error("No transport allowed for an invalid precondition."); };
  assert.throws(() => setMediaProgress(mediaId, mediaProgressEtag({ ...progress(), mediaId: otherId }), { context, positionSeconds: 2 }, account));
});

test("un no-op conserve sa révision tandis qu'un média ou contexte différent n'est jamais adopté", async () => {
  globalThis.fetch = async (path) => path === "/api/v1/auth/csrf" ? Response.json(csrf) : Response.json(progress(1), { headers: { ETag: mediaProgressEtag(progress(1)) } });
  const result = await setMediaProgress(mediaId, mediaProgressEtag(progress(1)), { context, positionSeconds: 2 }, account); assert.equal(result.ok, true); if (result.ok) assert.equal(result.etag, mediaProgressEtag(progress(1)));
  globalThis.fetch = async () => Response.json({ ...metadata, id: otherId }); assert.equal((await getVideoMedia(mediaId, context)).ok, false);
  globalThis.fetch = async () => { throw new TypeError("Synthetic connection loss"); }; assert.deepEqual(await getVideoMedia(mediaId, context), { ok: false, error: { kind: "unavailable" } });
});
