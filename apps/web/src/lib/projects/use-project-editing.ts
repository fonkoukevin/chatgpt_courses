"use client";

import { useRef, useState } from "react";
import type { AuthResult } from "../api/auth-client";
import type { ApiError } from "../api/client";
import type { CreateProject, ProjectFields, ProjectTemplate, ProjectView, SaveProject } from "../api/generated/types.gen";
import { createProject, getProject, getProjectTemplate, updateProject } from "../api/projects-client";
import { projectEtag } from "../api/projects-validation";
import type { ProjectCreationSource } from "../auth/project-draft";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave, type EditSession } from "../cms/edit-session";
import type { LearningAccountBoundary, LearningAccountState } from "../learning/account";
import { ambiguousLearningError } from "../learning/state";
import { emptyProjectFields, invalidProjectField, projectSectionKeys, sameProjectFields } from "./fields";
import type { Locale } from "../i18n/locales";

export function useProjectEditing({ locale, initial, initialFields, source, creationId, account, boundary, onCreated }: {
  locale: Locale; initial: ProjectView | null; initialFields?: ProjectFields; source?: ProjectCreationSource; creationId?: string;
  account: LearningAccountState; boundary: LearningAccountBoundary; onCreated?: (value: ProjectView) => void;
}) {
  const [record, setRecord] = useState(initial), [creationSource, setCreationSource] = useState(source);
  const [session, setSession] = useState<EditSession<SaveProject>>(() => {
    const state = createEditSession<SaveProject>({ fields: initial?.fields ?? initialFields ?? emptyProjectFields(locale), stage: initial?.stage ?? "DRAFT" }, initial ? projectEtag(initial) : "");
    return initial ? state : { ...state, phase: "modified" };
  });
  const [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState<ReturnType<typeof invalidProjectField> | "empty" | null>(null);
  const [conflict, setConflict] = useState<AuthResult<ProjectView> | null>(null), [conflictPending, setConflictPending] = useState(false);
  const [sourceCandidate, setSourceCandidate] = useState<AuthResult<ProjectTemplate> | null>(null);
  const [sourceTemplate, setSourceTemplate] = useState<ProjectTemplate | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false), [uncertain, setUncertain] = useState(false);
  const lock = useRef(false), request = useRef(0), readGeneration = useRef(0), id = useRef(creationId);
  const pendingCreation = useRef<{ body: CreateProject; change: number } | null>(null), minimumRevision = useRef(initial?.revision ?? 0);
  function change(value: SaveProject) { setSession((current) => changeEditSession(current, value)); setInvalid(null); }
  async function readConflict(project = record) {
    if (!project || account.status !== "active") return;
    const generation = ++readGeneration.current, scope = boundary.capture(); setConflictPending(true);
    const response = await getProject(project.id);
    if (generation !== readGeneration.current) return;
    setConflictPending(false);
    if (!boundary.isCurrent(scope)) return;
    if (response.ok && (response.data.id !== project.id || response.data.revision < minimumRevision.current)) { setConflict({ ok: false, error: { kind: "invalid-response", status: response.status } }); return; }
    setConflict(response); if (!response.ok) boundary.fail(response.error);
  }
  async function save(stage = session.value.stage): Promise<ProjectView | null> {
    if (lock.current || account.status !== "active" || !account.accountId || (!record && !creationSource)) return null;
    const value = { ...session.value, stage }, bad = invalidProjectField(value.fields);
    if (!pendingCreation.current && (bad || stage === "READY_FOR_SELF_ASSESSMENT" && ![...projectSectionKeys.map((key) => value.fields[key]), value.fields.externalText].some((text) => text.trim()))) { setInvalid(bad ?? "empty"); return null; }
    const starting = beginSave({ ...session, value }, ++request.current), previous = pendingCreation.current;
    id.current ??= crypto.randomUUID();
    const body: CreateProject | null = record ? null : previous?.body ?? { ...creationSource!, creationId: id.current, fields: starting.attempt.value.fields, stage };
    const attempt = previous ? { ...starting.attempt, change: previous.change, value: { fields: previous.body.fields, stage: previous.body.stage } } : starting.attempt;
    if (body) pendingCreation.current = { body, change: attempt.change };
    const scope = boundary.capture(); lock.current = true; readGeneration.current++; setConflictPending(false); setSession(starting.state); setError(null); setInvalid(null); setUnconfirmed(false);
    try {
      const response = record ? await updateProject(record.id, attempt.etag, attempt.value, account.accountId) : await createProject(body!, account.accountId);
      if (!boundary.isCurrent(scope)) { setSession((current) => rejectSave(current, attempt, false)); setUnconfirmed(true); return null; }
      if (response.ok) {
        const value = response.data;
        if (value.stage !== attempt.value.stage || !sameProjectFields(value.fields, attempt.value.fields) || record && (value.id !== record.id || value.revision < record.revision) || !record && (value.origin.activityId !== body!.activityId || value.origin.activityVersionId !== body!.activityVersionId || value.origin.revisionId !== body!.revisionId)) {
          setSession((current) => rejectSave(current, attempt, false)); setError({ kind: "invalid-response", status: response.status }); setUncertain(true); return null;
        }
        pendingCreation.current = null; setUncertain(false); minimumRevision.current = value.revision; setRecord(value); setConflict(null);
        setSession((current) => confirmSave(current, attempt, { fields: value.fields, stage: value.stage }, projectEtag(value)));
        if (!record) onCreated?.(value);
        return value;
      }
      const ambiguous = ambiguousLearningError(response.error); setUncertain(ambiguous); if (!ambiguous) pendingCreation.current = null;
      setSession((current) => rejectSave(current, attempt, response.error.status === 412)); setError(response.error); boundary.fail(response.error);
      if (response.error.status === 412 && record) { minimumRevision.current = record.revision + 1; void readConflict(record); }
      return null;
    } finally { lock.current = false; }
  }
  function adoptServer(keepLocal: boolean) {
    if (!conflict?.ok || lock.current || account.status !== "active" || conflict.data.revision < minimumRevision.current) return;
    const value = conflict.data; readGeneration.current++; setRecord(value); minimumRevision.current = value.revision;
    const confirmed: SaveProject = { fields: value.fields, stage: value.stage };
    setSession((current) => keepLocal ? rebaseLocalEdit(current, confirmed, projectEtag(value)) : createEditSession(confirmed, projectEtag(value)));
    setConflict(null); setError(null); setUncertain(false);
  }
  async function readSource() {
    if (!creationSource || account.status !== "active") return;
    const generation = ++readGeneration.current, scope = boundary.capture(); setConflictPending(true);
    const response = await getProjectTemplate(creationSource.activityId, creationSource.activityVersionId, creationSource.sourceLocale);
    if (generation !== readGeneration.current) return;
    setConflictPending(false); if (!boundary.isCurrent(scope)) return; setSourceCandidate(response);
  }
  function adoptSource() {
    if (!sourceCandidate?.ok || !creationSource || sourceCandidate.data.availability !== "PUBLISHED" || !sourceCandidate.data.revisionId || !sourceCandidate.data.rubric || lock.current || account.status !== "active") return;
    const candidate = sourceCandidate.data;
    if (candidate.activityId !== creationSource.activityId || candidate.activityVersionId !== creationSource.activityVersionId || candidate.locale !== creationSource.sourceLocale) return;
    setCreationSource({ ...creationSource, revisionId: candidate.revisionId! }); setSourceTemplate(candidate); pendingCreation.current = null; id.current = crypto.randomUUID(); setError(null); setSourceCandidate(null); setUncertain(false);
    setSession((current) => ({ ...current, phase: "modified" }));
  }
  return { record, session, change, save, error, invalid, conflict, conflictPending, readConflict, adoptServer, sourceCandidate, sourceTemplate, readSource, adoptSource, uncertain, unconfirmed,
    dirty: session.phase !== "saved", blocked: account.status !== "active", busy: session.phase === "saving" };
}
