import type { CreateProject, ProjectFields } from "../api/generated/types.gen";
import { isProjectFields } from "../api/projects-validation";
import { isUuid } from "../api/cms-validation";
import { record } from "../api/auth-validation";

export const projectDraftPrefix = "chatgpt-courses:personal:project-draft:";
export const projectDraftTtlMs = 2 * 60 * 60 * 1000;
const changedEvent = "courses-project-draft-changed";
export type ProjectCreationSource = Omit<CreateProject, "creationId" | "fields" | "stage">;
export type ProjectDraft = { version: 1; id: string; expiresAt: number; fields: ProjectFields; source: ProjectCreationSource };
export function isProjectCreationSource(value: unknown): value is ProjectCreationSource {
  return record(value) && Object.keys(value).length === 5 && Object.keys(value).every((key) => ["activityId", "activityVersionId", "revisionId", "sourceLocale", "enrollmentId"].includes(key))
    && [value.activityId, value.activityVersionId, value.revisionId].every(isUuid) && (value.sourceLocale === "fr" || value.sourceLocale === "en")
    && (value.enrollmentId === null || isUuid(value.enrollmentId));
}
export function parseProjectDraft(raw: string | null, now = Date.now()): ProjectDraft | null {
  if (!raw || raw.length > 64 * 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || Object.keys(value).length !== 5 || Object.keys(value).some((key) => !["version", "id", "expiresAt", "fields", "source"].includes(key))) return null;
    if (value.version !== 1 || !isUuid(value.id) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= now || value.expiresAt > now + projectDraftTtlMs || !isProjectFields(value.fields)
      || !isProjectCreationSource(value.source) || value.source.enrollmentId !== null) return null;
    return value as ProjectDraft;
  } catch { return null; }
}
// Only a deliberate anonymous, non-sensitive preparation calls this function.
// An authenticated editor never writes its production into browser storage.
export function keepAnonymousProjectDraft(fields: ProjectFields, source: ProjectCreationSource): string | null {
  const draft: ProjectDraft = { version: 1, id: crypto.randomUUID(), expiresAt: Date.now() + projectDraftTtlMs, fields: structuredClone(fields), source: structuredClone(source) };
  const raw = JSON.stringify(draft); if (!parseProjectDraft(raw)) return null;
  try { sessionStorage.setItem(projectDraftPrefix + draft.id, raw); window.dispatchEvent(new Event(changedEvent)); return draft.id; } catch { return null; }
}
export function projectDraftSnapshot(id: string): string | null {
  if (!isUuid(id)) return null;
  try { const raw = sessionStorage.getItem(projectDraftPrefix + id); return parseProjectDraft(raw) ? raw : null; } catch { return null; }
}
export function readProjectDraft(id: string): ProjectDraft | null {
  const value = parseProjectDraft(projectDraftSnapshot(id));
  if (!value || value.id !== id) { clearProjectDraft(id); return null; }
  return value;
}
export function subscribeProjectDraft(listener: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function notify() {
    clearTimeout(timer); let next: number | undefined;
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index); if (!key?.startsWith(projectDraftPrefix)) continue;
        const value = parseProjectDraft(sessionStorage.getItem(key));
        if (value) next = Math.min(next ?? value.expiresAt, value.expiresAt);
        else sessionStorage.removeItem(key);
      }
    } catch { /* A blocked storage is rendered as unavailable, never as saved. */ }
    if (next !== undefined) timer = setTimeout(notify, Math.max(1, next - Date.now()));
    listener();
  }
  window.addEventListener(changedEvent, notify); window.addEventListener("storage", notify); notify();
  return () => { clearTimeout(timer); window.removeEventListener(changedEvent, notify); window.removeEventListener("storage", notify); };
}
export function clearProjectDraft(id: string): void {
  if (!isUuid(id)) return;
  try { sessionStorage.removeItem(projectDraftPrefix + id); window.dispatchEvent(new Event(changedEvent)); } catch { /* Best-effort removal of this namespace only. */ }
}
