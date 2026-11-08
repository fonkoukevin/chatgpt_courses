import { purgePersonalBrowserCaches } from "./anonymous-draft";

export type AccountEvent = "signed-in" | "signed-out" | "session-reset";
const eventName = "chatgpt-courses-account-event";
const storageKey = "chatgpt-courses:account-event";
type Message = { kind: AccountEvent; nonce: string };
function message(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "kind" in value && "nonce" in value
    && ["signed-in", "signed-out", "session-reset"].includes(String(value.kind)) && typeof value.nonce === "string";
}
export function publishAccountEvent(kind: AccountEvent): void {
  if (typeof window === "undefined") return;
  const value: Message = { kind, nonce: crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(eventName, { detail: value }));
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* No session token or private data is stored here. */ }
}
export function subscribeAccountEvents(listener: (kind: AccountEvent) => void): () => void {
  let last = "";
  function accept(value: unknown) {
    if (!message(value) || value.nonce === last) return;
    last = value.nonce;
    if (value.kind === "signed-out" || value.kind === "session-reset") void purgePersonalBrowserCaches().then(() => listener(value.kind));
    else listener(value.kind);
  }
  const local = (event: Event) => accept((event as CustomEvent<unknown>).detail);
  const storage = (event: StorageEvent) => { if (event.key === storageKey && event.newValue) { try { accept(JSON.parse(event.newValue)); } catch { /* Invalid notifications never change identity. */ } } };
  window.addEventListener(eventName, local); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(eventName, local); window.removeEventListener("storage", storage); };
}
