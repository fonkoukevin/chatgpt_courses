import type { Locale } from "../i18n/locales";

export type PublicKind = "COURSE" | "GUIDE" | "METHOD_TEMPLATE";
export type IndexingConfiguration = { environment: string; publicOrigin: string; publishedLocales: readonly Locale[] };

export function localeIsIndexable(config: IndexingConfiguration, locale: Locale): boolean {
  return config.environment === "production" && config.publishedLocales.includes(locale);
}

export function publicResourcePath(kind: PublicKind, locale: Locale, slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) throw new Error("Invalid public slug");
  const segment = kind === "COURSE" ? locale === "fr" ? "parcours" : "courses" : kind === "GUIDE" ? "guides" : locale === "fr" ? "methodes" : "methods";
  return `/${locale}/${segment}/${slug}`;
}

export function absolutePublicUrl(path: string, publicOrigin: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) throw new Error("Invalid internal public path");
  const target = new URL(path, publicOrigin);
  if (target.origin !== new URL(publicOrigin).origin || target.username || target.password || target.hash) throw new Error("Invalid public URL");
  return target.toString();
}

// This is a conservative route classification, never an authorization check.
// Publication availability is checked separately by page metadata and Spring.
export function isPublicIndexingPath(pathname: string, search: string, config: IndexingConfiguration): boolean {
  const locale = pathname.split("/")[1];
  if (locale !== "fr" && locale !== "en" || !localeIsIndexable(config, locale)) return false;
  if (search && new RegExp(`^/${locale}/(?:${locale === "fr" ? "catalogue|offres" : "catalog|offers"})$`).test(pathname)) return false;
  return new RegExp(`^/${locale}(?:/(?:${locale === "fr" ? "catalogue|parcours|methodes|offres" : "catalog|courses|methods|offers"}|guides)(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?)?$`).test(pathname);
}
