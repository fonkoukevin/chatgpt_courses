"use client";
import { helpHref } from "@/lib/account/routes";
import { getAccountDictionary } from "@/lib/i18n/account";

import { useId, useState } from "react";
import { Copy, Flag } from "lucide-react";
import { Button, Dialog, FormField, Link, StatusMessage, TextArea } from "@/components/ui";
import type { PublicDocument, ResourceDetail } from "@/lib/api/generated/types.gen";
import { getPublicDictionary } from "@/lib/i18n/public";
import type { Locale } from "@/lib/i18n/locales";

export function PublicDocumentBody({ locale, document, prefix = "resource", showMedia = true }: { locale: Locale; document: PublicDocument; prefix?: string; showMedia?: boolean }) {
  const t = getPublicDictionary(locale);
  return <div className="min-w-0 space-y-5">{document.blocks.map((block, index) => {
    const id = `${prefix}-section-${index}`;
    switch (block.type) {
      case "HEADING": return <h2 key={index} id={id} className="scroll-mt-6 break-words pt-3 text-2xl font-semibold tracking-tight">{block.text}</h2>;
      case "LIST": return <ul key={index} className="list-disc space-y-2 pl-6 leading-relaxed">{block.text.split("\n").filter(Boolean).map((line, row) => <li key={row} className="break-words">{line}</li>)}</ul>;
      case "CODE": return <pre key={index} className="max-w-full overflow-x-auto rounded-input border border-border bg-surface-subtle p-4 text-sm leading-relaxed"><code>{block.text}</code></pre>;
      case "LINK": return <p key={index} className="break-words leading-relaxed">{block.url ? <Link href={block.url}>{block.text}</Link> : block.text}</p>;
      case "CALLOUT": return <StatusMessage key={index}>{block.text}</StatusMessage>;
      default: return <p key={index} className="whitespace-pre-wrap break-words leading-relaxed">{block.text}</p>;
    }
  })}{showMedia && document.media.length > 0 && <ul className="space-y-3">{document.media.map((media) => <li key={media.assetId} className="rounded-input border border-border bg-surface-subtle p-4"><p className="font-medium">{media.label}</p><p className="mt-1 text-sm text-muted-foreground">{t.mediaUnavailable}</p></li>)}</ul>}</div>;
}
export function ResourceTools({ locale, resource }: { locale: Locale; resource: ResourceDetail }) {
  const t = getPublicDictionary(locale), id = useId();
  const [copyState, setCopyState] = useState<"busy" | "copied" | "error" | null>(null);
  const [reportState, setReportState] = useState<"busy" | "copied" | "error" | null>(null);
  const [message, setMessage] = useState("");
  const context = `${resource.title ?? ""}\nResource: ${resource.resourceId}\nVersion: ${resource.versionId}\nRevision: ${resource.revisionId ?? "—"}\nLocale: ${resource.locale}`;
  const text = [resource.title, resource.summary, resource.document?.objective, resource.document?.expectedResult, ...(resource.document?.blocks.map((block) => block.text) ?? []), resource.document?.exerciseInstructions].filter(Boolean).join("\n\n");
  async function copy(value: string, report = false) {
    const update = report ? setReportState : setCopyState; update("busy");
    try { await navigator.clipboard.writeText(value); update("copied"); } catch { update("error"); }
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-3">{resource.document && <Button variant="secondary" busy={copyState === "busy"} loadingLabel={t.copyPending} onClick={() => void copy(text)}><Copy size={17} aria-hidden="true" />{t.copy}</Button>}
    <Dialog title={t.reportTitle} description={t.reportDescription} closeLabel={t.close} trigger={<Button variant="ghost" className="max-w-full whitespace-normal"><Flag size={17} aria-hidden="true" />{t.report}</Button>}>
      <div className="space-y-5"><Link href={helpHref(locale, { resourceId: resource.resourceId, versionId: resource.versionId, contextLocale: resource.locale, ...(resource.revisionId ? { revisionId: resource.revisionId } : {}) })} prefetch={false} className="inline-flex min-h-11 items-center">{getAccountDictionary(locale).help}</Link><FormField id={`${id}-context`} label={t.reportContext}><TextArea readOnly rows={5} value={context} /></FormField><FormField id={`${id}-message`} label={t.reportMessage}><TextArea rows={5} maxLength={4000} value={message} onChange={(event) => { setMessage(event.target.value); setReportState(null); }} placeholder={t.reportPlaceholder} /></FormField><Button busy={reportState === "busy"} loadingLabel={t.copyPending} onClick={() => void copy(`${context}\n\n${message}`, true)}>{t.reportCopy}</Button>{reportState && reportState !== "busy" && <StatusMessage tone={reportState === "copied" ? "success" : "danger"}>{reportState === "copied" ? t.copied : t.copyFailed}</StatusMessage>}</div>
    </Dialog></div>{copyState && copyState !== "busy" && <StatusMessage tone={copyState === "copied" ? "success" : "danger"}>{copyState === "copied" ? t.copied : t.copyFailed}</StatusMessage>}</div>;
}
