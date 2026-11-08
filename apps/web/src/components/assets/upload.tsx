"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, ConfirmationDialog, FormField, Input, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { AssetUploadCapabilities, AssetUploadIntent, AssetUploadRequest, AssetView } from "@/lib/api/generated/types.gen";
import { transferAssetFile } from "@/lib/api/assets-client";
import { acceptedFile, fileSize } from "@/lib/assets/files";
import { authHref } from "@/lib/auth/routes";
import { getAssetsDictionary } from "@/lib/i18n/assets";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { useUnsavedLearningInput } from "@/components/learning/unsaved";

export function AssetError({ locale, error, access = false }: { locale: Locale; error: ApiError; access?: boolean }) {
  const t = getAssetsDictionary(locale);
  return <StatusMessage tone="danger">{error.kind === "invalid-response" ? t.invalidResponse : access ? error.status === 401 ? t.accessSignIn : error.status === 403 ? t.accessDenied : t.resourceUnavailable : t.unavailable}</StatusMessage>;
}
export function AssetAccountNotice({ locale, account, boundary, returnTo }: { locale: Locale; account: LearningAccountState; boundary: LearningAccountBoundary; returnTo: string }) {
  const t = getAssetsDictionary(locale);
  if (account.status === "active") return null;
  if (account.status === "loading") return <p role="status">{t.loading}</p>;
  return <div className="space-y-3"><StatusMessage tone="warning">{account.status === "changed" ? t.accountBlocked : account.status === "expired" || account.status === "anonymous" ? t.sessionExpired : t.unavailable}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", returnTo)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.signIn}</Link><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void boundary.refresh()}>{t.accountCheck}</Button></div></div>;
}
export function UploadPolicy({ locale, value, projectQuota = true }: { locale: Locale; value: AssetUploadCapabilities; projectQuota?: boolean }) {
  const t = getAssetsDictionary(locale);
  return <section className="space-y-3 rounded-input border border-border bg-surface-subtle p-4"><h3 className="font-semibold">{t.policy}</h3>{!value.enabled && <StatusMessage tone="warning">{t.storageDisabled}</StatusMessage>}<ul className="space-y-2 text-sm">{value.formats.map((format) => <li key={format.contentType} className="break-words">{format.extensions.join(", ")} · {format.contentType} · {fileSize(format.maxBytes, locale)}{!format.available && ` · ${t.formatUnavailable}`}</li>)}</ul>{projectQuota && <><dl className="space-y-2 text-sm"><div><dt>{t.maxCount}</dt><dd className="font-medium">{value.maxFilesPerProject}</dd></div><div><dt>{t.maxTotal}</dt><dd className="font-medium">{fileSize(value.maxBytesPerProject, locale)}</dd></div></dl><p className="text-sm leading-relaxed text-muted-foreground">{t.limitsHelp}</p></>}</section>;
}

type Phase = "selected" | "authorizing" | "transferring" | "transferred" | "confirming" | "ready" | "error" | "rejected" | "expired";
export function AssetUpload({ locale, policy, account, boundary, create, confirm, onReady, disabled = false, projectQuota = true }: {
  locale: Locale; policy: AssetUploadCapabilities; account: LearningAccountState; boundary: LearningAccountBoundary; disabled?: boolean; projectQuota?: boolean;
  create: (body: AssetUploadRequest, accountContext: string) => Promise<AuthResult<AssetUploadIntent>>;
  confirm: (assetId: string, accountContext: string) => Promise<AuthResult<AssetView>>; onReady: (asset: AssetView) => void;
}) {
  const t = getAssetsDictionary(locale), id = useId(), input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const [file, setFile] = useState<File | null>(null), [intent, setIntent] = useState<AssetUploadIntent | null>(null), [asset, setAsset] = useState<AssetView | null>(null);
  const [phase, setPhase] = useState<Phase>("selected"), [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [intentExpired, setIntentExpired] = useState(false);
  const busy = phase === "authorizing" || phase === "transferring" || phase === "confirming", blocked = disabled || account.status !== "active";
  useUnsavedLearningInput(Boolean(file) && phase !== "ready" && phase !== "rejected" && phase !== "expired", boundary, t.unsavedLeave);
  useEffect(() => { if (!intent) return; const timer = setTimeout(() => setIntentExpired(true), Math.max(0, Date.parse(intent.expiresAt) - Date.now())); return () => clearTimeout(timer); }, [intent]);
  function reset() { if (busy) return; setFile(null); setIntent(null); setAsset(null); setPhase("selected"); setError(null); setInvalid(false); setUnconfirmed(false); setIntentExpired(false); if (input.current) input.current.value = ""; }
  async function send() {
    if (blocked || lock.current || !file || !account.accountId) return;
    const format = acceptedFile(file, policy); if (!format) { setInvalid(true); return; }
    const scope = boundary.capture(); lock.current = true; setError(null); setInvalid(false); setUnconfirmed(false);
    try {
      let target = intent;
      if (!target || Date.parse(target.expiresAt) <= Date.now()) {
        setPhase("authorizing"); const response = await create({ filename: file.name, contentType: format.contentType, sizeBytes: file.size }, account.accountId);
        if (!boundary.isCurrent(scope)) { setPhase("error"); setUnconfirmed(true); return; }
        if (!response.ok) { setPhase("error"); setError(response.error); boundary.fail(response.error); return; }
        target = response.data; setIntent(target); setAsset(target.asset); setIntentExpired(false);
      }
      setPhase("transferring"); const result = await transferAssetFile(target, file);
      if (!boundary.isCurrent(scope)) { setPhase("error"); setUnconfirmed(true); return; }
      if (result.ok) setPhase("transferred"); else { setPhase("error"); setError(result.error); }
    } finally { lock.current = false; }
  }
  async function verify() {
    if (blocked || lock.current || !asset || !account.accountId) return;
    lock.current = true; const scope = boundary.capture(); setPhase("confirming"); setError(null); setUnconfirmed(false);
    try {
      const result = await confirm(asset.id, account.accountId);
      if (!boundary.isCurrent(scope)) { setPhase("error"); setUnconfirmed(true); return; }
      if (!result.ok) { setPhase("transferred"); setError(result.error); boundary.fail(result.error); return; }
      if (result.data.id !== asset.id) { setPhase("transferred"); setError({ kind: "invalid-response", status: result.status }); return; }
      setAsset(result.data);
      if (result.data.state === "READY") { setPhase("ready"); setIntent(null); onReady(result.data); }
      else setPhase(result.data.state === "REJECTED" ? "rejected" : result.data.state === "EXPIRED" ? "expired" : "transferred");
    } finally { lock.current = false; }
  }
  return <div className="min-w-0 space-y-5" data-asset-upload-state={phase}><UploadPolicy locale={locale} value={policy} projectQuota={projectQuota} />
    {policy.enabled && <><FormField id={`${id}-file`} label={t.choose} hint={t.selectionHelp}><Input ref={input} type="file" accept={policy.formats.filter((format) => format.available).flatMap((format) => format.extensions).join(",")} disabled={blocked || busy || Boolean(file)} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setInvalid(selected ? !acceptedFile(selected, policy) : false); }} /></FormField>
      {file && <div className="space-y-3"><p className="break-words text-sm">{t.selected} : <span className="font-medium">{file.name}</span> · {fileSize(file.size, locale)}</p><div className="flex flex-wrap gap-3">{phase !== "transferred" && phase !== "confirming" && phase !== "ready" && phase !== "rejected" && phase !== "expired" && <Button className="max-w-full whitespace-normal" disabled={blocked || invalid} busy={phase === "authorizing" || phase === "transferring"} loadingLabel={phase === "authorizing" ? t.authorizing : t.transferring} onClick={() => void send()}>{intentExpired ? t.newTransfer : intent ? t.retryTransfer : t.transfer}</Button>}{(phase === "transferred" || phase === "confirming") && <Button className="max-w-full whitespace-normal" busy={phase === "confirming"} loadingLabel={t.confirming} disabled={blocked} onClick={() => void verify()}>{t.confirm}</Button>}<ConfirmationDialog title={t.changeTitle} description={t.changeHelp} confirmLabel={t.continue} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal" disabled={busy}>{t.changeFile}</Button>} onConfirm={reset} /></div></div>}
      {invalid && <StatusMessage tone="danger">{t.invalidFile}</StatusMessage>}{phase === "transferred" && <StatusMessage>{t.transferred}</StatusMessage>}{phase === "ready" && <StatusMessage tone="success">{t.ready}</StatusMessage>}{(phase === "rejected" || phase === "expired") && <StatusMessage tone="danger" title={phase === "rejected" ? t.rejected : t.expired}>{t.rejectedHelp}</StatusMessage>}{error && <AssetError locale={locale} error={error} />}{unconfirmed && <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}{asset?.state === "READY" && <p className="text-sm leading-relaxed text-muted-foreground">{t.validationNotice}</p>}{asset && <Badge className="break-all whitespace-normal">{asset.filename}</Badge>}
    </>}
  </div>;
}
