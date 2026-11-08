import type { Locale } from "../i18n/locales";
import { isUuid } from "./cms-validation";
import { isCatalogueFacets, isCataloguePage, isResourceDetail } from "./public-validation";
import { decodePublicResponse } from "./public-response";
import type { SearchCatalogueData } from "./generated/types.gen";
import type { AuthResult } from "./auth-client";

export type CatalogueQuery = SearchCatalogueData["query"];
export function catalogueQueryString(query: CatalogueQuery): string {
  const params = new URLSearchParams();
  for (const key of ["locale", "q", "type", "goal", "level", "access", "page", "pageSize", "sort"] as const) {
    const value = query[key]; if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}
export const cataloguePath = (query: CatalogueQuery) => `/catalog?${catalogueQueryString(query)}`;
export const catalogueFacetsPath = (locale: Locale) => `/catalog/facets?locale=${locale}`;
export function resourcePath(id: string, locale: Locale) {
  if (!isUuid(id)) throw new Error("Invalid resource identity.");
  return `/catalog/resources/${id}?locale=${locale}`;
}
export function resourceVersionPath(id: string, versionId: string, locale: Locale) {
  if (!isUuid(id) || !isUuid(versionId)) throw new Error("Invalid resource version.");
  return `/catalog/resources/${id}/versions/${versionId}?locale=${locale}`;
}
export function resourceSlugPath(kind: string, slug: string, locale: Locale) {
  if (!["COURSE", "ACTIVITY", "GUIDE", "METHOD_TEMPLATE"].includes(kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) throw new Error("Invalid resource slug.");
  return `/catalog/by-slug/${kind}/${encodeURIComponent(slug)}?locale=${locale}`;
}
async function read<T>(path: string, validate: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    return await decodePublicResponse(await fetch(`/api/v1${path}`, { cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal, headers: { Accept: "application/json, application/problem+json" } }), validate);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timeout); }
}
export const searchCatalogue = (query: CatalogueQuery) => read(cataloguePath(query), isCataloguePage);
export const getCatalogueFacets = (locale: Locale) => read(catalogueFacetsPath(locale), isCatalogueFacets);
export const getCatalogueResource = (id: string, locale: Locale) => read(resourcePath(id, locale), isResourceDetail);
export const getCatalogueResourceVersion = (id: string, versionId: string, locale: Locale) => read(resourceVersionPath(id, versionId, locale), isResourceDetail);
export const getCatalogueResourceBySlug = (kind: string, slug: string, locale: Locale) => read(resourceSlugPath(kind, slug, locale), isResourceDetail);
