import type { Locale } from "../i18n/locales";
import type { ResourceCard } from "../api/generated/types.gen";
import type { CatalogueQuery } from "../api/public-client";
import { catalogueQueryString } from "../api/public-client";

export type LanguageLinks = Record<Locale, { href: string; available: boolean }>;
export const publicCatalogueHref = (locale: Locale) => locale === "fr" ? "/fr/catalogue" : "/en/catalog";
export function catalogueHref(locale: Locale, query?: CatalogueQuery): string {
  return `${publicCatalogueHref(locale)}${query ? `?${catalogueQueryString(query)}` : ""}`;
}
export function activityDiscoveryHref(locale: Locale, resourceId: string, versionId: string, returnTo?: string): string {
  const params = new URLSearchParams({ activity: resourceId, version: versionId });
  if (returnTo) params.set("returnTo", returnTo);
  return `${publicCatalogueHref(locale)}?${params}`;
}
export function courseActivityHref(locale: Locale, courseSlug: string, activitySlug: string, resourceId: string, versionId: string, courseVersionId: string, catalogueReturnTo?: string): string {
  const params = new URLSearchParams({ resource: resourceId, version: versionId, courseVersion: courseVersionId });
  if (catalogueReturnTo) params.set("returnTo", catalogueReturnTo);
  return `/${locale}/${locale === "fr" ? "apprendre" : "learn"}/${encodeURIComponent(courseSlug)}/${encodeURIComponent(activitySlug)}?${params}`;
}
export function resourceHref(card: Pick<ResourceCard, "locale" | "kind" | "slug" | "resourceId" | "versionId">, returnTo?: string): string {
  if (card.kind === "ACTIVITY") return activityDiscoveryHref(card.locale, card.resourceId, card.versionId, returnTo);
  const segment = card.kind === "COURSE" ? (card.locale === "fr" ? "parcours" : "courses") : card.kind === "GUIDE" ? "guides" : card.locale === "fr" ? "methodes" : "methods";
  const params = new URLSearchParams({ version: card.versionId });
  if (returnTo) params.set("returnTo", returnTo);
  return `/${card.locale}/${segment}/${encodeURIComponent(card.slug)}?${params}`;
}
