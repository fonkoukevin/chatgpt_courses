"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, ConfirmationDialog, StatusMessage } from "@/components/ui";
import { getMethodPageDictionary } from "@/lib/i18n/method-pages";
import type { Locale } from "@/lib/i18n/locales";
import { clearMethodDraft, methodDraftSnapshot, parseMethodDraft, readMethodDraft, subscribeMethodDraft, type MethodDraft } from "@/lib/auth/method-draft";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import { PersonalMethodEditor } from "./editor";
import { MethodShell } from "./shell";
import { methodsNewHref } from "@/lib/methods/routes";

export function MethodDraftImport({ locale, expectedAccountId, email, draftId }: { locale: Locale; expectedAccountId: string; email: string; draftId?: string }) {
  const [imported, setImported] = useState<MethodDraft | null>(null);
  const raw = useSyncExternalStore<string | null | undefined>(subscribeMethodDraft, () => draftId ? methodDraftSnapshot(draftId) : null, () => undefined);
  const draft = parseMethodDraft(raw ?? null), t = getMethodPageDictionary(locale), labels = getMethodsDictionary(locale);
  if (imported) return <PersonalMethodEditor key={imported.id} locale={locale} expectedAccountId={expectedAccountId} email={email} initial={null} initialFields={imported.fields} source={imported.source ?? undefined} draftId={imported.id} onCreated={() => clearMethodDraft(imported.id)} />;
  if (!draftId) return <PersonalMethodEditor locale={locale} expectedAccountId={expectedAccountId} email={email} initial={null} />;
  return <MethodShell locale={locale} title={t.newMethod} description={t.newDescription} languageLinks={{ fr: methodsNewHref("fr", draftId), en: methodsNewHref("en", draftId) }}><div className="max-w-3xl space-y-5"><p className="break-words text-sm text-muted-foreground">{t.connectedAs} : {email}</p>
    {raw === undefined ? <p role="status">{labels.loading}</p> : draft ? <><StatusMessage title={t.importTitle}>{t.importHelp}</StatusMessage><div className="flex flex-wrap gap-3"><Button onClick={() => { const current = readMethodDraft(draftId); if (current) setImported(structuredClone(current)); }}>{t.importAction}</Button>
      <ConfirmationDialog title={t.discard} description={t.temporary} confirmLabel={t.discard} cancelLabel={labels.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.discard}</Button>} onConfirm={() => clearMethodDraft(draftId)} />
    </div></> : <StatusMessage tone="warning">{t.draftUnavailable}</StatusMessage>}
  </div></MethodShell>;
}
