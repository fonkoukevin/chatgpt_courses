"use client";

import { useState } from "react";
import { Button, StatusMessage } from "@/components/ui";
import { downloadMarkdown } from "@/lib/files/markdown-export";
import type { Locale } from "@/lib/i18n/locales";
import { getExportsDictionary } from "@/lib/i18n/exports";

export function MarkdownExport({ locale, textLocale, kind, text, disabled = false }: { locale: Locale; textLocale: Locale; kind: "project" | "method"; text: string; disabled?: boolean }) {
  const t = getExportsDictionary(locale), [failed, setFailed] = useState(false);
  return <div className="space-y-2"><Button variant="secondary" className="max-w-full whitespace-normal" disabled={disabled} onClick={() => { try { downloadMarkdown(kind, textLocale, text); setFailed(false); } catch { setFailed(true); } }}>{t.action}</Button><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.notice}</p>{failed && <StatusMessage tone="danger">{t.failed}</StatusMessage>}</div>;
}
