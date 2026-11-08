"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { AssetPage, AssetUploadCapabilities } from "@/lib/api/generated/types.gen";
import { confirmProjectUpload, createProjectUpload, getProjectFilePolicy, listProjectFiles } from "@/lib/api/assets-client";
import { fileSize } from "@/lib/assets/files";
import { getAssetsDictionary } from "@/lib/i18n/assets";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { AssetAccess } from "@/components/assets/access";
import { AssetError, AssetUpload } from "@/components/assets/upload";

export function ProjectFiles({ locale, projectId, account, boundary }: { locale: Locale; projectId: string; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getAssetsDictionary(locale), [policy, setPolicy] = useState<AuthResult<AssetUploadCapabilities> | null>(null), [files, setFiles] = useState<AuthResult<AssetPage> | null>(null);
  const [page, setPage] = useState(0), [refresh, setRefresh] = useState(0), sequence = useRef(0);
  const [confirmation, setConfirmation] = useState<{ id: string; busy: boolean; error: ApiError | null; unconfirmed: boolean } | null>(null), confirmationLock = useRef(false);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const request = ++sequence.current, scope = boundary.capture();
    void Promise.all([getProjectFilePolicy(projectId), listProjectFiles(projectId, page)]).then(([nextPolicy, nextFiles]) => {
      if (!active || request !== sequence.current || !boundary.isCurrent(scope)) return;
      setPolicy(nextPolicy); setFiles(nextFiles); if (!nextPolicy.ok) boundary.fail(nextPolicy.error); if (!nextFiles.ok) boundary.fail(nextFiles.error);
    });
    return () => { active = false; };
  }, [account.status, boundary, page, projectId, refresh]);
  async function confirmPending(assetId: string) {
    if (account.status !== "active" || !account.accountId || confirmationLock.current) return;
    confirmationLock.current = true; const scope = boundary.capture(); setConfirmation({ id: assetId, busy: true, error: null, unconfirmed: false });
    try {
      const result = await confirmProjectUpload(projectId, assetId, account.accountId);
      if (!boundary.isCurrent(scope)) { setConfirmation({ id: assetId, busy: false, error: null, unconfirmed: true }); return; }
      setConfirmation({ id: assetId, busy: false, error: result.ok ? null : result.error, unconfirmed: false });
      if (!result.ok) boundary.fail(result.error); else setRefresh((value) => value + 1);
    } finally { confirmationLock.current = false; }
  }
  return <section className="min-w-0 space-y-6" data-project-files><h2 className="text-2xl font-semibold">{t.files}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.filesHelp}</p>
    {!policy ? <p role="status">{t.loading}</p> : !policy.ok ? <AssetError locale={locale} error={policy.error} /> : <AssetUpload key={`project-upload:${projectId}`} locale={locale} policy={policy.data} account={account} boundary={boundary} create={(body, actor) => createProjectUpload(projectId, body, actor)} confirm={(assetId, actor) => confirmProjectUpload(projectId, assetId, actor)} onReady={() => setRefresh((value) => value + 1)} />}
    {!files ? <p role="status">{t.loading}</p> : !files.ok ? <AssetError locale={locale} error={files.error} /> : files.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : <ul className="space-y-4">{files.data.items.map((asset) => <li key={`project-file:${asset.id}`} className="min-w-0 space-y-3 rounded-panel border border-border p-4"><p className="break-words font-medium">{asset.filename}</p><div className="flex flex-wrap gap-2"><Badge tone={asset.state === "READY" ? "success" : asset.state === "REJECTED" ? "danger" : "neutral"}>{asset.state === "READY" ? t.ready : asset.state === "REJECTED" ? t.rejected : asset.state === "EXPIRED" ? t.expired : t.pending}</Badge><span className="text-sm text-muted-foreground">{fileSize(asset.sizeBytes, locale)} · {asset.contentType}</span></div>{asset.state === "READY" && <AssetAccess key={`project-download:${asset.id}`} locale={locale} assetId={asset.id} label={asset.filename} kind="FILE" context={null} account={account} boundary={boundary} privateFile />}{asset.state === "PENDING" && <Button variant="secondary" disabled={account.status !== "active"} busy={confirmation?.id === asset.id && confirmation.busy} loadingLabel={t.confirming} onClick={() => void confirmPending(asset.id)}>{t.confirm}</Button>}{confirmation?.id === asset.id && confirmation.error && <AssetError locale={locale} error={confirmation.error} />}{confirmation?.id === asset.id && confirmation.unconfirmed && <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}</li>)}</ul>}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={account.status !== "active"} onClick={() => setRefresh((value) => value + 1)}>{t.refresh}</Button>{files?.ok && files.data.total > files.data.pageSize && <><Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>{t.previous}</Button><span className="py-3 text-sm">{t.page} {page + 1}</span><Button variant="secondary" disabled={(page + 1) * files.data.pageSize >= files.data.total} onClick={() => setPage((value) => value + 1)}>{t.next}</Button></>}</div>
    <p className="text-sm leading-relaxed text-muted-foreground">{t.accessHelp}</p>
  </section>;
}
