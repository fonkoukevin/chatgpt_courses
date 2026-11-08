import type { MethodFields, MethodFromTemplate } from "../api/generated/types.gen";
import { isMethodFields } from "../api/methods-validation";
import { isUuid } from "../api/cms-validation";

export const methodDraftPrefix = "chatgpt-courses:personal:method-draft:";
export const methodDraftTtlMs = 2 * 60 * 60 * 1000;
const changedEvent = "courses-method-draft-changed";
export type MethodSource = Omit<MethodFromTemplate, "fields">;
export type MethodDraft = { version: 1; id: string; expiresAt: number; fields: MethodFields; source: MethodSource | null };
export function isMethodSource(value: unknown): value is MethodSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return Object.keys(source).length === 4 && Object.keys(source).every((key) => ["sourceResourceId", "sourceVersionId", "sourceRevisionId", "sourceLocale"].includes(key))
    && [source.sourceResourceId, source.sourceVersionId, source.sourceRevisionId].every(isUuid) && (source.sourceLocale === "fr" || source.sourceLocale === "en");
}
export function parseMethodDraft(raw: string | null, now = Date.now()): MethodDraft | null {
  if (!raw || raw.length > 64 * 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Record<string, unknown>;
    if (Object.keys(draft).length !== 5 || Object.keys(draft).some((key) => !["version", "id", "expiresAt", "fields", "source"].includes(key))) return null;
    if (draft.version !== 1 || !isUuid(draft.id) || typeof draft.expiresAt !== "number" || !Number.isFinite(draft.expiresAt)
      || draft.expiresAt <= now || draft.expiresAt > now + methodDraftTtlMs || !isMethodFields(draft.fields) || (draft.source !== null && !isMethodSource(draft.source))) return null;
    return draft as MethodDraft;
  } catch { return null; }
}
// Only an explicit action on the anonymous builder calls this function. Private
// editor input is kept in React memory and is never sent to browser storage.
export function keepAnonymousMethodDraft(fields: MethodFields, source: MethodSource | null): string | null {
  const draft: MethodDraft = { version: 1, id: crypto.randomUUID(), expiresAt: Date.now() + methodDraftTtlMs, fields: structuredClone(fields), source };
  const raw = JSON.stringify(draft);
  if (!parseMethodDraft(raw)) return null;
  try { sessionStorage.setItem(methodDraftPrefix + draft.id, raw); window.dispatchEvent(new Event(changedEvent)); return draft.id; } catch { return null; }
}
export function readMethodDraft(id: string): MethodDraft | null {
  if (!isUuid(id)) return null;
  try {
    const draft = parseMethodDraft(sessionStorage.getItem(methodDraftPrefix + id));
    if (!draft || draft.id !== id) { clearMethodDraft(id); return null; }
    return draft;
  } catch { return null; }
}
export function methodDraftSnapshot(id: string): string | null {
  if (!isUuid(id)) return null;
  try { const raw = sessionStorage.getItem(methodDraftPrefix + id); return parseMethodDraft(raw) ? raw : null; } catch { return null; }
}
export function subscribeMethodDraft(listener: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function notify() {
    clearTimeout(timer);
    let next: number | undefined;
    try {
      for (let index = 0; index < sessionStorage.length; index++) {
        const key = sessionStorage.key(index);
        if (!key?.startsWith(methodDraftPrefix)) continue;
        const draft = parseMethodDraft(sessionStorage.getItem(key));
        if (draft) next = Math.min(next ?? draft.expiresAt, draft.expiresAt);
      }
    } catch { /* The unavailable state is rendered without claiming persistence. */ }
    if (next !== undefined) timer = setTimeout(notify, Math.max(1, next - Date.now()));
    listener();
  }
  window.addEventListener(changedEvent, notify); window.addEventListener("storage", notify); notify();
  return () => { clearTimeout(timer); window.removeEventListener(changedEvent, notify); window.removeEventListener("storage", notify); };
}
export function clearMethodDraft(id: string): void { if (isUuid(id)) { try { sessionStorage.removeItem(methodDraftPrefix + id); window.dispatchEvent(new Event(changedEvent)); } catch { /* Explicitly best-effort local cleanup. */ } } }
