"use client";

import { useId, useRef, useState } from "react";
import { Badge, Button, ConfirmationDialog, Dialog, FormField, StatusMessage, TextArea } from "@/components/ui";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { projectBodyText } from "@/lib/projects/fields";
import type { useProjectEditing } from "@/lib/projects/use-project-editing";
import { ProjectFieldsEditor, type ProjectFieldErrors } from "./fields";
import { ProjectCopy, ProjectError } from "./parts";
import { ProjectBriefContent } from "./brief";
import { MarkdownExport } from "@/components/files/markdown-export";
import { projectMarkdown } from "@/lib/files/markdown-export";

export function ProjectSaveForm({ locale, editing, onSaved, allowAnonymousEditing = false, sourceVisible = true }: { locale: Locale; editing: ReturnType<typeof useProjectEditing>; onSaved?: () => void; allowAnonymousEditing?: boolean; sourceVisible?: boolean }) {
  const t = getProjectsDictionary(locale), id = useId(), form = useRef<HTMLFormElement>(null), feedback = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false), [importText, setImportText] = useState("");
  const { session, record, blocked, busy } = editing;
  const fieldsBlocked = blocked && !allowAnonymousEditing;
  const errors: ProjectFieldErrors = editing.invalid && editing.invalid !== "size" && editing.invalid !== "empty" ? { [editing.invalid]: editing.invalid === "title" ? t.titleRequired : t.invalidText } : {};
  async function save(ready = false) {
    await editing.save(ready ? "READY_FOR_SELF_ASSESSMENT" : session.value.stage);
    requestAnimationFrame(() => { const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]'); if (invalid) invalid.focus(); else feedback.current?.focus(); });
    onSaved?.();
  }
  function importExternal() {
    if (fieldsBlocked || busy) return;
    editing.change({ ...session.value, fields: { ...session.value.fields, externalText: importText } }); setImportOpen(false); setImportText("");
  }
  return <section className="min-w-0 space-y-6" data-project-save-state={session.phase}>
    <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold">{t.write}</h2><Badge>{session.value.fields.locale.toUpperCase()}</Badge></div>
    <Dialog open={importOpen} onOpenChange={setImportOpen} title={t.importText} description={t.importDescription} closeLabel={t.close} trigger={<Button variant="secondary" disabled={fieldsBlocked || busy} className="max-w-full whitespace-normal">{t.importText}</Button>}><div className="space-y-4"><FormField id={`${id}-external-import`} label={t.externalText}><TextArea rows={10} lang={session.value.fields.locale} value={importText} onChange={(event) => setImportText(event.target.value)} /></FormField>{session.value.fields.externalText ? <ConfirmationDialog title={t.replaceExternal} description={t.replaceExternalHelp} confirmLabel={t.importConfirm} cancelLabel={t.cancel} trigger={<Button disabled={fieldsBlocked || busy}>{t.importConfirm}</Button>} onConfirm={importExternal} /> : <Button disabled={fieldsBlocked || busy} onClick={importExternal}>{t.importConfirm}</Button>}</div></Dialog>
    <form ref={form} noValidate onSubmit={(event) => { event.preventDefault(); if (!blocked) void save(); }} className="space-y-6"><ProjectFieldsEditor locale={locale} value={session.value.fields} onChange={(fields) => editing.change({ ...session.value, fields })} disabled={fieldsBlocked} errors={errors} localeEditable={!record} />
      {!allowAnonymousEditing && <div className="flex flex-wrap gap-3"><Button type="submit" className="max-w-full whitespace-normal" busy={busy} loadingLabel={t.saving} disabled={blocked || session.phase === "saved"}>{editing.uncertain ? t.retry : t.save}</Button><Button type="button" variant="secondary" className="max-w-full whitespace-normal" disabled={blocked || busy || editing.uncertain || session.phase === "conflict"} onClick={() => void save(true)}>{t.ready}</Button></div>}
    </form>
    <div ref={feedback} tabIndex={-1} className="space-y-4 rounded-input outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus" aria-live="polite">
      <p role="status" className="text-sm font-medium">{session.phase === "saved" ? t.saved : session.phase === "saving" ? t.saving : session.phase === "modified" ? t.modified : t.failed}</p>
      {editing.invalid && <StatusMessage tone="danger">{editing.invalid === "size" ? t.tooLarge : editing.invalid === "empty" ? t.noProduction : t.invalidFields}</StatusMessage>}
      {editing.error && <ProjectError locale={locale} error={editing.error} />}{editing.unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}{editing.uncertain && !record && <StatusMessage tone="warning">{t.pendingCreation}</StatusMessage>}
    </div>
    {session.phase === "conflict" && record && <section className="min-w-0 space-y-4 rounded-panel border border-warning/40 bg-warning-soft p-4 sm:p-6"><h3 className="text-xl font-semibold">{t.conflictTitle}</h3><p className="text-sm leading-relaxed">{t.conflictHelp}</p>{editing.conflictPending && <p role="status">{t.loading}</p>}{editing.conflict && !editing.conflict.ok && <ProjectError locale={locale} error={editing.conflict.error} />}{editing.conflict?.ok && <><div className="grid min-w-0 gap-6 lg:grid-cols-2"><div className="min-w-0 space-y-3"><h4 className="font-semibold">{t.local}</h4><pre lang={session.value.fields.locale} className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{projectBodyText(session.value.fields)}</pre></div><div className="min-w-0 space-y-3"><h4 className="font-semibold">{t.server}</h4><pre lang={editing.conflict.data.fields.locale} className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{projectBodyText(editing.conflict.data.fields)}</pre></div></div><div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reload} description={t.reloadHelp} confirmLabel={t.reload} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked || busy}>{t.reload}</Button>} onConfirm={() => { editing.adoptServer(false); onSaved?.(); }} /><ConfirmationDialog title={t.keepLocal} description={t.keepLocalHelp} confirmLabel={t.keepLocal} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked || busy}>{t.keepLocal}</Button>} onConfirm={() => { editing.adoptServer(true); onSaved?.(); }} /></div></>}<Button variant="secondary" disabled={blocked || editing.conflictPending} onClick={() => void editing.readConflict()}>{t.retry}</Button></section>}
    {!record && editing.error?.status === 412 && <section className="space-y-4 rounded-panel border border-warning/40 p-4"><StatusMessage tone="warning">{t.sourceConflict}</StatusMessage><Button variant="secondary" disabled={blocked || editing.conflictPending} onClick={() => void editing.readSource()}>{t.checkSource}</Button>{sourceVisible && editing.sourceCandidate && (!editing.sourceCandidate.ok ? <ProjectError locale={locale} error={editing.sourceCandidate.error} /> : <><ProjectBriefContent locale={locale} resource={editing.sourceCandidate.data.resource} />{editing.sourceCandidate.data.availability === "PUBLISHED" && editing.sourceCandidate.data.rubric && <ConfirmationDialog title={t.useSource} description={t.useSourceHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button className="max-w-full whitespace-normal" disabled={blocked}>{t.useSource}</Button>} onConfirm={editing.adoptSource} />}</>)}</section>}
    <ProjectCopy locale={locale} fields={session.value.fields} />
    <MarkdownExport locale={locale} textLocale={session.value.fields.locale} kind="project" text={projectMarkdown(session.value.fields)} disabled={fieldsBlocked} />
  </section>;
}
