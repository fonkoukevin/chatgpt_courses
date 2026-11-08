import type { Locale } from "../i18n/locales";

export const anonymousDraftKey = "chatgpt-courses:anonymous-draft:v1";
export const anonymousDraftTtlMs = 2 * 60 * 60 * 1000;
const changedEvent = "courses-anonymous-draft-changed";
export type AnonymousDraft = { version: 1; activityId: string; locale: Locale; body: string; brief: string; expiresAt: number };

export function draftSnapshot(): string | null {
  try { return sessionStorage.getItem(anonymousDraftKey); } catch { return null; }
}

export function parseAnonymousDraft(raw: string | null, now = Date.now()): AnonymousDraft | null {
  if (!raw || raw.length > 26000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Record<string, unknown>;
    if (Object.keys(draft).some((key) => !["version", "activityId", "locale", "body", "brief", "expiresAt"].includes(key))) return null;
    if (draft.version !== 1 || typeof draft.activityId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(draft.activityId)
      || (draft.locale !== "fr" && draft.locale !== "en") || typeof draft.body !== "string" || draft.body.length > 20000
      || typeof draft.brief !== "string" || draft.brief.length > 5000 || typeof draft.expiresAt !== "number"
      || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= now || draft.expiresAt > now + anonymousDraftTtlMs) return null;
    return draft as AnonymousDraft;
  } catch { return null; }
}

export function saveAnonymousDraft(draft: Pick<AnonymousDraft, "activityId" | "locale" | "body" | "brief">): boolean {
  const value = { version: 1, activityId: draft.activityId, locale: draft.locale, body: draft.body, brief: draft.brief, expiresAt: Date.now() + anonymousDraftTtlMs };
  if (!parseAnonymousDraft(JSON.stringify(value))) return false;
  try {
    sessionStorage.setItem(anonymousDraftKey, JSON.stringify(value));
    window.dispatchEvent(new Event(changedEvent));
    return true;
  } catch { return false; }
}

export function clearAnonymousDraft(): void {
  try { sessionStorage.removeItem(anonymousDraftKey); window.dispatchEvent(new Event(changedEvent)); } catch { /* Storage can be unavailable. */ }
}

export function subscribeDraft(listener: () => void): () => void {
  let expiry: ReturnType<typeof setTimeout> | undefined;
  function notify() {
    clearTimeout(expiry);
    const existing = draftSnapshot();
    const draft = parseAnonymousDraft(existing);
    if (existing && !draft) {
      try { sessionStorage.removeItem(anonymousDraftKey); } catch { /* Storage can be unavailable. */ }
    }
    if (draft) expiry = setTimeout(notify, Math.max(1, draft.expiresAt - Date.now()));
    listener();
  }
  window.addEventListener(changedEvent, notify);
  window.addEventListener("storage", notify);
  notify();
  return () => { clearTimeout(expiry); window.removeEventListener(changedEvent, notify); window.removeEventListener("storage", notify); };
}

export async function purgePersonalBrowserCaches(): Promise<void> {
  for (const storage of [() => sessionStorage, () => localStorage]) {
    try {
      const target = storage();
      for (let index = target.length - 1; index >= 0; index--) {
        const key = target.key(index);
        if (key?.startsWith("chatgpt-courses:personal:")) target.removeItem(key);
      }
    } catch { /* No broad clear: other applications and anonymous work remain intact. */ }
  }
  if (typeof caches !== "undefined") {
    try { await Promise.all((await caches.keys()).filter((name) => name.startsWith("chatgpt-courses-personal-")).map((name) => caches.delete(name))); } catch { /* No personal cache is created by P04. */ }
  }
}
