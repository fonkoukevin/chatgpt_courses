import type { Locale } from "../i18n/locales";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const controls = (value: string) => Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function methodsPath(locale: Locale, id?: string): string {
  const base = locale === "fr" ? "/fr/espace/methodes" : "/en/my/methods";
  if (id === undefined) return base;
  if (id === "new") return `${base}/${locale === "fr" ? "nouvelle" : "new"}`;
  if (!uuid.test(id)) throw new Error("Invalid personal method identifier.");
  return `${base}/${id}`;
}
export function methodsNewHref(locale: Locale, draftId?: string): string {
  if (!draftId) return methodsPath(locale, "new");
  if (!uuid.test(draftId)) throw new Error("Invalid temporary method identifier.");
  return `${methodsPath(locale, "new")}?${new URLSearchParams({ draft: draftId })}`;
}
export function methodsHref(locale: Locale, query: { q?: string; category?: string; page?: number; pageSize?: number } = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return methodsPath(locale) + (params.size ? `?${params}` : "");
}

type Destination = { locale: Locale; id?: string; query: URLSearchParams };
function methodDestination(value: unknown): Destination | null {
  if (typeof value !== "string" || value.length > 2000 || !value.startsWith("/") || value.startsWith("//") || /[\\#]/.test(value) || controls(value)) return null;
  try {
    const url = new URL(value, "https://courses.invalid");
    if (url.origin !== "https://courses.invalid" || url.pathname !== value.split("?", 1)[0]) return null;
    const match = /^\/(fr\/espace\/methodes|en\/my\/methods)(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) return null;
    const locale: Locale = match[1].startsWith("fr/") ? "fr" : "en";
    const leaf = match[2], isNew = leaf === (locale === "fr" ? "nouvelle" : "new");
    if (leaf && !isNew && !uuid.test(leaf)) return null;
    const seen = new Set<string>();
    for (const [key, item] of url.searchParams) {
      if (seen.has(key) || controls(item)) return null;
      seen.add(key);
      if (isNew) { if (key !== "draft" || !uuid.test(item)) return null; }
      else if (leaf) return null;
      else if (key === "q") { if (item.length > 240) return null; }
      else if (key === "category") { if (item.length > 80) return null; }
      else if (key === "page") { if (!/^\d+$/.test(item) || Number(item) > 1_000_000) return null; }
      else if (key === "pageSize") { if (!/^\d+$/.test(item) || Number(item) < 1 || Number(item) > 100) return null; }
      else return null;
    }
    return { locale, id: isNew ? "new" : leaf, query: url.searchParams };
  } catch { return null; }
}
export function safeMethodsDestination(value: unknown, expectedLocale: Locale): string | null {
  const destination = methodDestination(value);
  if (!destination || destination.locale !== expectedLocale) return null;
  return methodsPath(expectedLocale, destination.id) + (destination.query.size ? `?${destination.query}` : "");
}
export function translateMethodsDestination(value: unknown, locale: Locale): string | null {
  const destination = methodDestination(value);
  return destination ? methodsPath(locale, destination.id) + (destination.query.size ? `?${destination.query}` : "") : null;
}
