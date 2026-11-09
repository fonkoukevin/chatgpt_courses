import "server-only";
import { getServerConfig } from "../config/server";
import type { Locale } from "../i18n/locales";
import type { AuthResult } from "./auth-client";
import { isProblem } from "./client";
import type { ResourceCard, SearchCatalogueData } from "./generated/types.gen";
import { isCataloguePage, isCatalogueFacets, isResourceDetail } from "./public-validation";
import { isPublicActivityContext, isPublicPublicationPage } from "./public-routes-validation";
import { matchingResource } from "./resource-http";

export type CatalogueQuery = SearchCatalogueData["query"];
type PublicKind = ResourceCard["kind"];

async function read<T>(path: string, decode: (value: unknown) => value is T): Promise<AuthResult<T>> {
  try {
    const config = getServerConfig();
    // Public HTML must be independent of the visitor's session. Never copy
    // cookies, authorization or incoming forwarding headers into this request.
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), {
      method: "GET", headers: { Accept: "application/json, application/problem+json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    let value: unknown;
    try { value = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (!response.ok) {
      if (mediaType !== "application/problem+json" || !isProblem(value, response.status)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
      return { ok: false, error: { kind: [502, 503, 504].includes(response.status) ? "unavailable" : "http", status: response.status, problem: value } };
    }
    if (response.status !== 200 || mediaType !== "application/json" || !decode(value)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: true, data: value, status: response.status };
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}

export function readCatalogue(query: CatalogueQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return read(`/catalog?${params}`, isCataloguePage);
}
export function readCatalogueFacets(locale: Locale) { return read(`/catalog/facets?locale=${locale}`, isCatalogueFacets); }
export function readResource(resourceId: string, locale: Locale) { return read(`/catalog/resources/${encodeURIComponent(resourceId)}?locale=${locale}`, isResourceDetail); }
export function readResourceVersion(resourceId: string, versionId: string, locale: Locale) {
  return read(`/catalog/resources/${encodeURIComponent(resourceId)}/versions/${encodeURIComponent(versionId)}?locale=${locale}`, isResourceDetail);
}
export function readResourceBySlug(kind: PublicKind, slug: string, locale: Locale) {
  return read(`/catalog/by-slug/${kind}/${encodeURIComponent(slug)}?locale=${locale}`, isResourceDetail);
}
export function readPublications(locale: Locale, page = 0, pageSize = 100) {
  return read(`/catalog/publications?${new URLSearchParams({ locale, page: String(page), pageSize: String(pageSize) })}`, matchingResource(isPublicPublicationPage, value => value.page === page && value.pageSize === pageSize && value.items.every(item => item.locale === locale)));
}
export function readPublicActivityContext(courseId: string, courseVersionId: string, activityId: string, activityVersionId: string, locale: Locale) {
  return read(`/catalog/resources/${encodeURIComponent(courseId)}/versions/${encodeURIComponent(courseVersionId)}/activities/${encodeURIComponent(activityId)}/versions/${encodeURIComponent(activityVersionId)}?locale=${locale}`, matchingResource(isPublicActivityContext, value => value.courseResourceId === courseId && value.courseVersionId === courseVersionId && value.activityResourceId === activityId && value.activityVersionId === activityVersionId && value.locale === locale));
}
