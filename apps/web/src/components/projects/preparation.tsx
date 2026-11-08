"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, Checkbox, ConfirmationDialog, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectTemplate, ResourceDetail } from "@/lib/api/generated/types.gen";
import { getProjectTemplate } from "@/lib/api/projects-client";
import { keepAnonymousProjectDraft, type ProjectCreationSource } from "@/lib/auth/project-draft";
import { authHref } from "@/lib/auth/routes";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { emptyProjectFields, invalidProjectField } from "@/lib/projects/fields";
import { projectsNewHref, projectsPath } from "@/lib/projects/routes";
import { useProjectEditing } from "@/lib/projects/use-project-editing";
import { useUnsavedLearningInput } from "@/components/learning/unsaved";
import { ProjectBriefContent } from "./brief";
import { ProjectAccountNotice, ProjectError } from "./parts";
import { ProjectSaveForm } from "./save-form";

export function StartProjectAction({ locale, source, account, boundary, enrollmentId }: { locale: Locale; source: ResourceDetail; account: LearningAccountState; boundary: LearningAccountBoundary; enrollmentId?: string }) {
  const t = getProjectsDictionary(locale), [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const [template, setTemplate] = useState<AuthResult<ProjectTemplate> | null>(null), sequence = useRef(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const request = ++sequence.current;
    void getProjectTemplate(source.resourceId, source.versionId, source.locale).then((result) => { if (active && request === sequence.current) setTemplate(result); });
    return () => { active = false; };
  }, [open, attempt, source.resourceId, source.versionId, source.locale]);
  if (source.kind !== "ACTIVITY" || source.availability !== "PUBLISHED" || source.access !== "FREE" || !source.document?.projectPolicy) return null;
  return <section className="space-y-5 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6" data-project-start><h2 className="text-2xl font-semibold">{t.preparation}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.preparationHelp}</p>{!open ? <Button className="max-w-full whitespace-normal" onClick={() => setOpen(true)}>{t.start}</Button> : !template ? <p role="status">{t.loading}</p> : !template.ok ? <ProjectError locale={locale} error={template.error} retry={() => setAttempt((value) => value + 1)} /> : template.data.availability !== "PUBLISHED" || !template.data.revisionId || !template.data.rubric ? <StatusMessage tone="warning">{t.sourceUnavailable}</StatusMessage> : <ProjectPreparation key={`preparation:${source.versionId}:${template.data.revisionId}`} locale={locale} template={template.data} account={account} boundary={boundary} enrollmentId={enrollmentId} />}</section>;
}

export function ProjectPreparation({ locale, template, account, boundary, enrollmentId }: { locale: Locale; template: ProjectTemplate; account: LearningAccountState; boundary: LearningAccountBoundary; enrollmentId?: string }) {
  const t = getProjectsDictionary(locale), id = useId(), [consent, setConsent] = useState(false), [storageFailed, setStorageFailed] = useState(false);
  const leaving = useRef(false), knownAccount = useRef(account.accountId !== null);
  // Once a personal account is known, expiration never makes its work an anonymous draft.
  useEffect(() => { if (account.accountId) knownAccount.current = true; }, [account.accountId]);
  const source: ProjectCreationSource = { activityId: template.activityId, activityVersionId: template.activityVersionId, revisionId: template.revisionId!, sourceLocale: template.locale, enrollmentId: enrollmentId ?? null };
  const editing = useProjectEditing({ locale, initial: null, initialFields: { ...emptyProjectFields(template.locale), title: template.title ?? "" }, source, account, boundary });
  useUnsavedLearningInput(editing.dirty && editing.session.change > 0, { ...boundary, isPrivacyExit: () => leaving.current || boundary.isPrivacyExit() }, t.unsavedLeave);
  const anonymous = account.status === "anonymous" && account.accountId === null;
  function keepAndSignIn() {
    if (!anonymous || knownAccount.current || !consent || invalidProjectField(editing.session.value.fields)) { setStorageFailed(true); return; }
    const draftId = keepAnonymousProjectDraft(editing.session.value.fields, { ...source, enrollmentId: null });
    if (!draftId) { setStorageFailed(true); return; }
    leaving.current = true; window.location.assign(authHref(locale, "sign-in", projectsNewHref(locale, draftId)));
  }
  return <div className="min-w-0 space-y-6" data-project-preparation><div className="flex flex-wrap gap-2"><Badge>{template.rubric?.caseCode}</Badge><Badge>{template.locale.toUpperCase()}</Badge></div>{anonymous ? <StatusMessage>{t.anonymousHelp}</StatusMessage> : <ProjectAccountNotice locale={locale} state={account} boundary={boundary} returnTo={projectsPath(locale)} />}
    <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t.brief}</summary><div className="mt-4"><ProjectBriefContent locale={locale} resource={editing.sourceTemplate?.resource ?? template.resource} /></div></details>
    <ProjectSaveForm locale={locale} editing={editing} allowAnonymousEditing={anonymous} />
    {anonymous && <div className="space-y-4"><Checkbox id={`${id}-consent`} label={t.consentDraft} checked={consent} onCheckedChange={setConsent} /><ConfirmationDialog title={t.keepAndSignIn} description={t.anonymousHelp} destructive={false} confirmLabel={t.keepAndSignIn} cancelLabel={t.cancel} trigger={<Button disabled={!consent} className="max-w-full whitespace-normal">{t.keepAndSignIn}</Button>} onConfirm={keepAndSignIn} />{storageFailed && <StatusMessage tone="danger">{t.storageFailed}</StatusMessage>}</div>}
    {editing.record && <Link href={projectsPath(locale, editing.record.id)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.open}</Link>}
  </div>;
}
