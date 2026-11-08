"use client";

import { useSyncExternalStore } from "react";
import { Button, Link, StatusMessage } from "@/components/ui";
import { clearAnonymousDraft, draftSnapshot, parseAnonymousDraft, subscribeDraft } from "@/lib/auth/anonymous-draft";
import { authHref } from "@/lib/auth/routes";
import { getAuthDictionary } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/locales";

export function ResumeContext({ locale, onRestore }: { locale: Locale; onRestore?: (body: string) => void }) {
  const raw = useSyncExternalStore(subscribeDraft, draftSnapshot, () => null);
  const draft = parseAnonymousDraft(raw);
  if (!draft || !draft.body.trim()) return null;
  const text = getAuthDictionary(locale);
  return <StatusMessage title={text.draftTitle}><p>{text.draftBody}</p><div className="mt-3 flex flex-wrap gap-2">
    {onRestore ? <Button variant="secondary" onClick={() => {
      const current = parseAnonymousDraft(draftSnapshot());
      if (current) onRestore(current.body);
      else clearAnonymousDraft();
    }}>{text.draftRestore}</Button>
      : <Link prefetch={false} href={`/${draft.locale}/dev/learning`}>{text.draftResume}</Link>}
    {onRestore && <Link prefetch={false} href={authHref(locale, "sign-in", `/${locale}/dev/learning`)}>{text.draftKeep}</Link>}
  </div></StatusMessage>;
}
