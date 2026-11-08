"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { MediaAccessContext, VideoMediaView, VideoPlaybackAccess } from "@/lib/api/generated/types.gen";
import { getVideoMedia, getVideoPlayback } from "@/lib/api/video-client";
import type { Locale } from "@/lib/i18n/locales";
import { getVideoDictionary } from "@/lib/i18n/video";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { mediaPosition, mediaTime } from "@/lib/learning/media-time";
import { VideoProgress } from "./video-progress";

export function VideoMedia({ locale, mediaId, label, context: sourceContext, account, boundary }: { locale: Locale; mediaId: string; label: string; context: MediaAccessContext; account?: LearningAccountState; boundary?: LearningAccountBoundary }) {
  const t = getVideoDictionary(locale), video = useRef<HTMLVideoElement>(null), sequence = useRef(0), lock = useRef(false), pendingSeek = useRef<number | null>(null);
  const context = useMemo(() => ({ locale: sourceContext.locale, resourceId: sourceContext.resourceId, versionId: sourceContext.versionId, enrollmentId: sourceContext.enrollmentId }), [sourceContext.enrollmentId, sourceContext.locale, sourceContext.resourceId, sourceContext.versionId]);
  const [metadata, setMetadata] = useState<{ result: AuthResult<VideoMediaView>; scope: number | undefined; context: MediaAccessContext } | null>(null), [refresh, setRefresh] = useState(0), [playback, setPlayback] = useState<VideoPlaybackAccess | null>(null), [playbackScope, setPlaybackScope] = useState<number | undefined>();
  const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [expired, setExpired] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [position, setPosition] = useState(0), [measured, setMeasured] = useState(false), [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const blocked = Boolean(account && account.status !== "active" && account.status !== "anonymous");
  useEffect(() => {
    if (blocked) return;
    let active = true; const request = ++sequence.current, scope = boundary?.capture();
    void getVideoMedia(mediaId, context).then((result) => { if (active && request === sequence.current && (!boundary || scope !== undefined && boundary.isCurrent(scope))) { setMetadata({ result, scope, context }); if (!result.ok) boundary?.fail(result.error); } });
    return () => { active = false; };
  }, [account?.status, blocked, boundary, context, mediaId, refresh]);
  useEffect(() => { if (!captionsUrl) return; return () => URL.revokeObjectURL(captionsUrl); }, [captionsUrl]);
  useEffect(() => { const lifetime = sequence; return () => { lifetime.current++; }; }, []);
  useEffect(() => { if (!playback) return; const timer = setTimeout(() => { setExpired(true); setPlayback(null); setCaptionsUrl(null); }, Math.max(0, Date.parse(playback.expiresAt) - Date.now())); return () => clearTimeout(timer); }, [playback]);
  const currentMetadata = !blocked && metadata?.context === context && (!boundary || metadata.scope !== undefined && boundary.isCurrent(metadata.scope)) ? metadata.result : null;
  const media = currentMetadata?.ok ? currentMetadata.data : null;
  const currentPlayback = !blocked && (!boundary || playbackScope !== undefined && boundary.isCurrent(playbackScope)) ? playback : null;
  async function load(targetPosition = position) {
    if (lock.current || blocked || !media?.playbackAvailable) return;
    lock.current = true; const request = ++sequence.current, scope = boundary?.capture(); pendingSeek.current = mediaPosition(targetPosition, media.durationSeconds);
    setLoading(true); setFailed(false); setExpired(false); setUnconfirmed(false);
    try {
      const result = await getVideoPlayback(mediaId, context, account?.status === "active" ? account.accountId! : undefined);
      if (request !== sequence.current || boundary && (scope === undefined || !boundary.isCurrent(scope))) { setUnconfirmed(true); return; }
      if (!result.ok) { setFailed(true); boundary?.fail(result.error); return; }
      if (result.data.durationSeconds !== media.durationSeconds || result.data.sha256 !== media.sha256 || result.data.sizeBytes !== media.sizeBytes) { setFailed(true); return; }
      setPlaybackScope(scope); setPlayback(result.data);
      setCaptionsUrl(media.captionsVtt ? URL.createObjectURL(new Blob([media.captionsVtt], { type: "text/vtt;charset=utf-8" })) : null);
    } finally { lock.current = false; setLoading(false); }
  }
  function seek(value: number) {
    if (!media) return; const target = mediaPosition(value, media.durationSeconds); setPosition(target); pendingSeek.current = target;
    if (video.current && video.current.readyState >= 1) { video.current.currentTime = target; pendingSeek.current = null; }
    else if (!currentPlayback) void load(target);
  }
  return <div className="min-w-0 space-y-4" data-video-player={mediaId}>{blocked ? <StatusMessage>{account?.status === "changed" ? t.accountChanged : t.loadingVideo}</StatusMessage> : !currentMetadata ? <p role="status">{t.loadingVideo}</p> : !media ? <div className="space-y-3"><StatusMessage>{t.unavailable}</StatusMessage><Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>{t.retry}</Button></div> : <>
    {media.playbackAvailable ? <><div className="space-y-2"><Badge>{t.localTest}</Badge><p className="text-sm leading-relaxed text-muted-foreground">{t.localTestHelp}</p><p className="text-sm">{t.duration} : {mediaTime(media.durationSeconds)}</p></div><Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked} busy={loading} loadingLabel={t.loadingVideo} onClick={() => void load()}>{expired ? t.renewVideo : t.loadVideo}</Button>
      {currentPlayback && <video ref={video} controls playsInline preload="metadata" crossOrigin="anonymous" aria-label={label} lang={media.locale} className="aspect-video w-full rounded-input bg-black" src={currentPlayback.url} onLoadedMetadata={(event) => { setMeasured(true); event.currentTarget.currentTime = mediaPosition(pendingSeek.current ?? position, media.durationSeconds); pendingSeek.current = null; }} onTimeUpdate={(event) => { if (event.currentTarget.readyState >= 1 && Number.isFinite(event.currentTarget.currentTime)) setPosition(mediaPosition(event.currentTarget.currentTime, media.durationSeconds)); }} onSeeked={(event) => { if (event.currentTarget.readyState >= 1 && Number.isFinite(event.currentTarget.currentTime)) setPosition(mediaPosition(event.currentTarget.currentTime, media.durationSeconds)); }} onError={() => { setFailed(true); setPlayback(null); setCaptionsUrl(null); }}>{captionsUrl && <track kind="captions" src={captionsUrl} srcLang={media.locale} label={`${t.captions} · ${media.locale.toUpperCase()}`} default />}</video>}
    </> : <StatusMessage>{t.unavailable}</StatusMessage>}
    {failed && <StatusMessage tone="warning">{t.error}</StatusMessage>}{expired && <StatusMessage tone="warning">{t.linkExpired}</StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}
    {media.transcript ? <details className="rounded-input border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.transcript}</summary><p lang={media.locale} className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{media.transcript}</p></details> : <p className="text-sm text-muted-foreground">{t.noTranscript}</p>}
    {media.captionsVtt && <details className="rounded-input border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.captions}</summary><pre lang={media.locale} className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{media.captionsVtt}</pre></details>}
    {account?.accountId && boundary ? <VideoProgress key={`video-progress:${mediaId}:${account.accountId}`} locale={locale} mediaId={mediaId} context={context} duration={media.durationSeconds} position={position} loaded={measured} onSeek={seek} account={account} boundary={boundary} /> : <p className="text-sm text-muted-foreground">{t.signInHelp}</p>}
  </>}</div>;
}
