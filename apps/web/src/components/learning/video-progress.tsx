"use client";

import { useEffect, useRef, useState } from "react";
import { Button, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { MediaAccessContext, MediaProgressView } from "@/lib/api/generated/types.gen";
import { getMediaProgress, setMediaProgress } from "@/lib/api/video-client";
import type { Locale } from "@/lib/i18n/locales";
import { getVideoDictionary } from "@/lib/i18n/video";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { mediaPosition, mediaTime } from "@/lib/learning/media-time";

type Saved = { value: MediaProgressView; etag: string };
export function VideoProgress({ locale, mediaId, context, duration, position, loaded, onSeek, account, boundary }: { locale: Locale; mediaId: string; context: MediaAccessContext; duration: number; position: number; loaded: boolean; onSeek: (position: number) => void; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getVideoDictionary(locale), [saved, setSaved] = useState<Saved | null>(null), record = useRef<Saved | null>(null), readSequence = useRef(0), lock = useRef(false);
  const [reading, setReading] = useState(true), [phase, setPhase] = useState<"idle" | "saving" | "error" | "conflict">("idle"), [error, setError] = useState<ApiError | null>(null), [conflict, setConflict] = useState<Saved | null>(null), [unconfirmed, setUnconfirmed] = useState(false);
  const blocked = account.status !== "active", dirty = Boolean(saved && loaded && Math.abs(position - saved.value.positionSeconds) > 0.0001);
  function canonical(result: AuthResult<MediaProgressView>): Saved | null { return result.ok && result.etag && result.data.mediaId === mediaId && result.data.locale === context.locale && result.data.durationSeconds === duration ? { value: result.data, etag: result.etag } : null; }
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const request = ++readSequence.current, scope = boundary.capture();
    void getMediaProgress(mediaId, context).then((result) => {
      if (!active || request !== readSequence.current || !boundary.isCurrent(scope)) return;
      setReading(false);
      if (!result.ok) { setError(result.error); boundary.fail(result.error); return; }
      if (!result.etag || result.data.durationSeconds !== duration) { setError({ kind: "invalid-response", status: result.status }); return; }
      const next = { value: result.data, etag: result.etag }, current = record.current;
      if (current && next.value.revision < current.value.revision) return;
      if (current && next.value.revision !== current.value.revision) { setConflict(next); setPhase("conflict"); return; }
      record.current = next; setSaved(next);
    });
    return () => { active = false; };
  }, [account.status, boundary, context, duration, mediaId]);
  async function readConflict() {
    if (blocked) return;
    const request = ++readSequence.current, scope = boundary.capture(); setReading(true);
    const result = await getMediaProgress(mediaId, context);
    if (request !== readSequence.current) return; setReading(false); if (!boundary.isCurrent(scope)) return;
    const next = canonical(result);
    if (next && (!record.current || next.value.revision >= record.current.value.revision)) {
      if (!record.current || next.value.revision === record.current.value.revision) { record.current = next; setSaved(next); setPhase("idle"); setError(null); }
      else { setConflict(next); setPhase("conflict"); }
    }
    else if (!result.ok) { setError(result.error); boundary.fail(result.error); }
    else setError({ kind: "invalid-response", status: result.status });
  }
  async function save() {
    if (blocked || lock.current || !saved || !account.accountId || !loaded) return;
    const sent = mediaPosition(position, duration), scope = boundary.capture(); lock.current = true; readSequence.current++; setPhase("saving"); setError(null); setUnconfirmed(false);
    try {
      const result = await setMediaProgress(mediaId, saved.etag, { context, positionSeconds: sent }, account.accountId);
      if (!boundary.isCurrent(scope)) { setPhase("error"); setUnconfirmed(true); return; }
      const next = canonical(result);
      if (next && next.value.positionSeconds === sent && next.value.revision >= saved.value.revision && next.value.updatedAt !== null) { record.current = next; setSaved(next); setConflict(null); setPhase("idle"); return; }
      if (!result.ok) { setError(result.error); boundary.fail(result.error); setPhase(result.error.status === 412 ? "conflict" : "error"); if (result.error.status === 412) void readConflict(); }
      else { setPhase("error"); setError({ kind: "invalid-response", status: result.status }); }
    } finally { lock.current = false; }
  }
  function adopt(keepLocal: boolean) {
    if (!conflict || blocked || lock.current) return;
    readSequence.current++; record.current = conflict; setSaved(conflict); if (!keepLocal) onSeek(conflict.value.positionSeconds); setConflict(null); setError(null); setPhase("idle");
  }
  const state = phase !== "idle" ? phase : reading && !saved ? "loading" : dirty ? "modified" : !saved?.value.updatedAt ? "not-saved" : "saved";
  return <section className="space-y-4 rounded-input border border-border p-4" data-media-progress-state={state}><p className="text-sm leading-relaxed text-muted-foreground">{t.positionHelp}</p>{saved?.value.updatedAt && <p className="text-sm">{t.savedPosition} : <span className="font-medium tabular-nums">{mediaTime(saved.value.positionSeconds)}</span></p>}{loaded ? <p className="text-sm">{t.currentPosition} : <span className="font-medium tabular-nums">{mediaTime(position)}</span></p> : <p className="text-sm text-muted-foreground">{t.loadFirst}</p>}
    <p role="status" className="text-sm font-medium">{state === "loading" ? t.loading : state === "saving" ? t.savingPosition : state === "saved" ? t.positionSaved : state === "modified" ? t.positionModified : state === "not-saved" ? t.positionNotSaved : t.positionError}</p>
    <div className="flex flex-wrap gap-3"><Button className="max-w-full whitespace-normal" disabled={blocked || !saved || !loaded || phase === "conflict" || state === "saved"} busy={phase === "saving"} loadingLabel={t.savingPosition} onClick={() => void save()}>{t.savePosition}</Button>{saved?.value.updatedAt && <Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked || phase === "saving"} onClick={() => onSeek(saved.value.positionSeconds)}>{t.resumePosition}</Button>}</div>
    {error && <div className="space-y-3"><StatusMessage tone="danger">{t.positionError}</StatusMessage>{phase !== "conflict" && <Button variant="secondary" disabled={blocked || reading} onClick={() => void readConflict()}>{t.retry}</Button>}</div>}{unconfirmed && <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}
    {phase === "conflict" && <section className="space-y-3 rounded-input bg-warning-soft p-4"><h4 className="font-semibold">{t.conflictTitle}</h4><p className="text-sm leading-relaxed">{t.conflictHelp}</p><p className="text-sm">{t.localPosition} : {mediaTime(position)}</p>{conflict && <><p className="text-sm">{t.serverPosition} : {mediaTime(conflict.value.positionSeconds)}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked} onClick={() => adopt(false)}>{t.loadSavedPosition}</Button><Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked} onClick={() => adopt(true)}>{t.keepLocalPosition}</Button></div></>}<Button variant="secondary" disabled={blocked || reading} onClick={() => void readConflict()}>{t.retry}</Button></section>}
  </section>;
}
