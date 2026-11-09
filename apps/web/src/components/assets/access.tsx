"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { AssetAccessContext, AssetDownloadAccess } from "@/lib/api/generated/types.gen";
import { downloadAssetFile, getAssetDownload, getEditorialAssetPreview, getSolutionFileDownload } from "@/lib/api/assets-client";
import { getAssetsDictionary } from "@/lib/i18n/assets";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { AssetError } from "./upload";

export function AssetAccess({ locale, assetId, label, kind, context, account, boundary, privateFile = false, editorialPreview = false, solutionReveal }: {
  locale: Locale; assetId: string; label: string; kind: "FILE" | "IMAGE"; context: AssetAccessContext | null;
  account?: LearningAccountState; boundary?: LearningAccountBoundary; privateFile?: boolean; editorialPreview?: boolean;
  solutionReveal?: { projectId: string; revealId: string };
}) {
  const t = getAssetsDictionary(locale), [pending, setPending] = useState(false), [error, setError] = useState<ApiError | null>(null);
  const [access, setAccess] = useState<AssetDownloadAccess | null>(null), [expired, setExpired] = useState(false), [imageError, setImageError] = useState(false), [prepared, setPrepared] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const lock = useRef(false), sequence = useRef(0), blobUrls = useRef(new Set<string>());
  const blocked = Boolean(account && account.status !== "active" && account.status !== "anonymous") || (privateFile || editorialPreview || Boolean(solutionReveal)) && account?.status !== "active";
  useEffect(() => { if (!access) return; const timer = setTimeout(() => { setExpired(true); setAccess(null); setImageUrl(null); }, Math.max(0, Date.parse(access.expiresAt) - Date.now())); return () => clearTimeout(timer); }, [access]);
  useEffect(() => { if (!imageUrl) return; const urls = blobUrls.current; return () => { URL.revokeObjectURL(imageUrl); urls.delete(imageUrl); }; }, [imageUrl]);
  useEffect(() => { const urls = blobUrls.current, request = sequence; return () => { request.current++; for (const value of urls) URL.revokeObjectURL(value); urls.clear(); }; }, []);
  async function open() {
    if (blocked || lock.current) return;
    const scope = boundary?.capture(), request = ++sequence.current;
    const current = () => request === sequence.current && (!boundary || scope !== undefined && boundary.isCurrent(scope));
    lock.current = true; setPending(true); setError(null); setExpired(false); setImageError(false); setPrepared(false); setUnconfirmed(false); setAccess(null); setImageUrl(null);
    try {
      const response = solutionReveal ? await getSolutionFileDownload(solutionReveal.projectId, solutionReveal.revealId, assetId, account!.accountId!) : editorialPreview ? await getEditorialAssetPreview(assetId, account!.accountId!) : await getAssetDownload(assetId, context, account?.status === "active" ? account.accountId! : undefined);
      if (!current()) { setUnconfirmed(true); return; }
      if (!response.ok) { setError(response.error); boundary?.fail(response.error); return; }
      if (Date.parse(response.data.expiresAt) <= Date.now()) { setExpired(true); return; }
      const downloaded = await downloadAssetFile(response.data);
      if (!current()) { setUnconfirmed(true); return; }
      if (!downloaded.ok) { setError(downloaded.error); return; }
      const url = URL.createObjectURL(downloaded.data); blobUrls.current.add(url);
      if (kind === "IMAGE") { setAccess(response.data); setImageUrl(url); return; }
      try { const link = document.createElement("a"); link.href = url; link.download = response.data.filename; document.body.appendChild(link); link.click(); link.remove(); setPrepared(true); }
      finally { setTimeout(() => { URL.revokeObjectURL(url); blobUrls.current.delete(url); }, 1000); }
    } finally { lock.current = false; setPending(false); }
  }
  return <div className="min-w-0 space-y-3" data-asset-access={assetId}><Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked} busy={pending} loadingLabel={t.downloading} onClick={() => void open()}>{kind === "IMAGE" ? editorialPreview ? t.preview : t.showImage : t.download}</Button>
    {error && <AssetError locale={locale} error={error} access />}{expired && <StatusMessage tone="warning">{t.accessExpired}</StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}{prepared && <StatusMessage tone="success">{t.downloadStarted}</StatusMessage>}
    {access && imageUrl && !blocked && !imageError && <div className="relative aspect-[4/3] w-full overflow-hidden rounded-input border border-border bg-surface-subtle"><Image src={imageUrl} alt={label} fill unoptimized crossOrigin="anonymous" referrerPolicy="no-referrer" sizes="(max-width: 768px) 100vw, 720px" className="object-contain" onError={() => { setImageError(true); setAccess(null); setImageUrl(null); }} /></div>}{imageError && <StatusMessage tone="warning">{t.imageError}</StatusMessage>}
  </div>;
}
