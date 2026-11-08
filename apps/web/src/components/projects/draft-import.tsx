"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, ConfirmationDialog, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectTemplate } from "@/lib/api/generated/types.gen";
import { getProjectTemplate } from "@/lib/api/projects-client";
import { clearProjectDraft, parseProjectDraft, projectDraftSnapshot, readProjectDraft, subscribeProjectDraft, type ProjectDraft } from "@/lib/auth/project-draft";
import { getProjectDraftDictionary } from "@/lib/i18n/project-draft";
import type { Locale } from "@/lib/i18n/locales";
import { catalogueHref } from "@/lib/public/routes";
import { projectsNewHref } from "@/lib/projects/routes";
import { ProjectEditor } from "./editor";
import { ProjectShell } from "./shell";

function ImportedProject({ locale, expectedAccountId, draft }: { locale: Locale; expectedAccountId: string; draft: ProjectDraft }) {
  const [template, setTemplate] = useState<AuthResult<ProjectTemplate> | undefined>();
  useEffect(() => {
    let active = true;
    void getProjectTemplate(draft.source.activityId, draft.source.activityVersionId, draft.source.sourceLocale).then((value) => { if (active) setTemplate(value); });
    return () => { active = false; };
  }, [draft.source.activityId, draft.source.activityVersionId, draft.source.sourceLocale]);
  return <ProjectEditor locale={locale} expectedAccountId={expectedAccountId} initial={null} initialFields={draft.fields} source={draft.source} template={template} creationId={draft.id} onCreated={() => clearProjectDraft(draft.id)} />;
}
export function ProjectDraftImport({ locale, expectedAccountId, email, draftId }: { locale: Locale; expectedAccountId: string; email: string; draftId?: string }) {
  const t = getProjectDraftDictionary(locale), [imported, setImported] = useState<ProjectDraft | null>(null);
  const raw = useSyncExternalStore<string | null | undefined>(subscribeProjectDraft, () => draftId ? projectDraftSnapshot(draftId) : null, () => undefined);
  const draft = parseProjectDraft(raw ?? null);
  if (imported) return <ImportedProject key={`imported-project:${expectedAccountId}:${imported.id}`} locale={locale} expectedAccountId={expectedAccountId} draft={imported} />;
  return <ProjectShell locale={locale} title={t.title} description={t.description} languageLinks={{ fr: projectsNewHref("fr", draftId), en: projectsNewHref("en", draftId) }}>
    <div className="max-w-3xl space-y-5"><p className="break-words text-sm text-muted-foreground">{t.connectedAs} : {email}</p>
      {!draftId ? <><StatusMessage>{t.noSource}</StatusMessage><Link href={catalogueHref(locale, { locale, type: "ACTIVITY", access: "FREE" })} prefetch={false}>{t.discover}</Link></> : raw === undefined ? <p role="status">{t.loading}</p> : draft ? <>
        <StatusMessage title={t.importTitle}>{t.importHelp}</StatusMessage><div className="flex flex-wrap gap-3"><Button onClick={() => { const value = readProjectDraft(draftId); if (value) setImported(structuredClone(value)); }}>{t.importAction}</Button>
          <ConfirmationDialog title={t.discard} description={t.discardHelp} confirmLabel={t.discard} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.discard}</Button>} onConfirm={() => clearProjectDraft(draftId)} />
        </div></> : <StatusMessage tone="warning">{t.unavailable}</StatusMessage>}
    </div>
  </ProjectShell>;
}
