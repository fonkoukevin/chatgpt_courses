"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, ConfirmationDialog, FormField, Input, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { AssetUploadCapabilities, AssetView, MediaReference } from "@/lib/api/generated/types.gen";
import { confirmEditorialUpload, createEditorialUpload, getEditorialUploadPolicy } from "@/lib/api/assets-client";
import { cmsPath } from "@/lib/cms/routes";
import { getAssetsDictionary } from "@/lib/i18n/assets";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { AssetAccess } from "@/components/assets/access";
import { AssetAccountNotice, AssetError, AssetUpload } from "@/components/assets/upload";

export function EditorialImageUpload({ locale, resourceId, versionId, contentLocale, disabled = false, onAdd }: {
  locale: Locale; resourceId: string; versionId: string; contentLocale: Locale; disabled?: boolean; onAdd: (reference: MediaReference) => void;
}) {
  const t = getAssetsDictionary(locale), id = useId(), { state: account, boundary } = useLearningAccount(cmsPath(locale));
  const [policy, setPolicy] = useState<AuthResult<AssetUploadCapabilities> | null>(null), [refresh, setRefresh] = useState(0), request = useRef(0);
  const [ready, setReady] = useState<AssetView | null>(null), [label, setLabel] = useState(""), [required, setRequired] = useState(false), [invalid, setInvalid] = useState(false), [added, setAdded] = useState(false);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const sequence = ++request.current, scope = boundary.capture();
    void getEditorialUploadPolicy().then((value) => { if (!active || sequence !== request.current || !boundary.isCurrent(scope)) return; setPolicy(value); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, refresh]);
  function add() {
    if (!ready || ready.state !== "READY" || account.status !== "active" || disabled || added) return;
    if (!label.trim() || label.length > 240) { setInvalid(true); return; }
    onAdd({ assetId: ready.id, kind: ready.kind, label: label.trim(), required }); setAdded(true);
  }
  return <section className="min-w-0 space-y-5 rounded-panel border border-border p-4 sm:p-6" data-editorial-asset-upload><h2 className="text-xl font-semibold">{t.editorialTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.editorialHelp}</p>
    <AssetAccountNotice locale={locale} account={account} boundary={boundary} returnTo={cmsPath(locale)} />
    {!policy ? <p role="status">{t.loading}</p> : !policy.ok ? <div className="space-y-3"><AssetError locale={locale} error={policy.error} /><Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>{t.retry}</Button></div> : <AssetUpload locale={locale} policy={policy.data} projectQuota={false} account={account} boundary={boundary} disabled={disabled} create={(body, actor) => createEditorialUpload({ ...body, resourceId, versionId, locale: contentLocale }, actor)} confirm={confirmEditorialUpload} onReady={(asset) => { setReady(asset); setAdded(false); }} />}
    {ready && <div className="space-y-4 rounded-input border border-border bg-surface-subtle p-4"><p className="break-words font-medium">{ready.filename}</p><FormField id={`${id}-label`} label={t.referenceLabel} required error={invalid ? t.labelRequired : undefined}><Input lang={contentLocale} maxLength={240} disabled={disabled || account.status !== "active" || added} value={label} onChange={(event) => { setLabel(event.target.value); setInvalid(false); }} /></FormField><Checkbox id={`${id}-required`} label={t.required} checked={required} disabled={disabled || account.status !== "active" || added} onCheckedChange={setRequired} />
      <div className="flex flex-wrap items-start gap-3"><ConfirmationDialog title={t.addTitle} description={t.addHelp} confirmLabel={t.addReference} cancelLabel={t.cancel} destructive={false} trigger={<Button disabled={disabled || account.status !== "active" || added} className="max-w-full whitespace-normal">{t.addReference}</Button>} onConfirm={add} /><AssetAccess locale={locale} assetId={ready.id} kind={ready.kind} label={label || ready.filename} context={null} account={account} boundary={boundary} editorialPreview /></div>{added && <StatusMessage tone="success">{t.added}</StatusMessage>}
    </div>}
  </section>;
}
