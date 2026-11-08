import { clearCsrfToken, getCsrfToken, type AuthResult } from "./auth-client";
import type { MethodFields, MethodFromTemplate, MethodView } from "./generated/types.gen";
import { isUuid } from "./cms-validation";
import { isMethodPage, isMethodSourceUpdate, isMethodTemplate, isMethodView } from "./methods-validation";
import { decodeMethodsResponse } from "./methods-response";
import type { Locale } from "../i18n/locales";

export type MethodQuery = { q?: string; category?: string; page?: number; pageSize?: number };
export function methodPath(id: string, suffix: "" | "/duplicates" | "/source-update" = "") {
  if (!isUuid(id)) throw new Error("Invalid personal method identifier.");
  return `/me/methods/${id}${suffix}`;
}
export function methodQueryString(query: MethodQuery) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "page", "pageSize"] as const) if (query[key] !== undefined && query[key] !== "") params.set(key, String(query[key]));
  return params.toString();
}
export function methodTemplatePath(resourceId: string, versionId: string, locale: Locale) {
  if (!isUuid(resourceId) || !isUuid(versionId)) throw new Error("Invalid method source identifier.");
  return `/method-templates/${resourceId}/versions/${versionId}?locale=${locale}`;
}
async function request<T>(path: string, decode: ((value: unknown) => value is T) | null, init: RequestInit = {}, status = 200): Promise<AuthResult<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    return await decodeMethodsResponse(await fetch(`/api/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json, application/problem+json", ...init.headers } }), decode, status);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
async function mutate<T>(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, accountContext: string,
  decode: ((value: unknown) => value is T) | null, etag?: string, status = 200): Promise<AuthResult<T>> {
  if (!isUuid(accountContext)) throw new Error("An expected account is required for a personal method mutation.");
  const token = await getCsrfToken();
  if (!token.ok) return token;
  const result = await request(path, decode, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}), [token.data.headerName]: token.data.token,
    "X-Account-Context": accountContext, ...(etag ? { "If-Match": etag } : {}),
  } }, status);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) { clearCsrfToken(); await getCsrfToken(); }
  return result;
}
export const listMethods = (query: MethodQuery = {}) => request(`/me/methods?${methodQueryString(query)}`, isMethodPage);
export const getMethod = (id: string) => request(methodPath(id), isMethodView);
export const getMethodSourceUpdate = (id: string) => request(methodPath(id, "/source-update"), isMethodSourceUpdate);
export const getMethodTemplate = (resourceId: string, versionId: string, locale: Locale) => request(methodTemplatePath(resourceId, versionId, locale), isMethodTemplate);
export const createMethod = (fields: MethodFields, accountContext: string): Promise<AuthResult<MethodView>> => mutate("/me/methods", "POST", { fields }, accountContext, isMethodView, undefined, 201);
export const createMethodFromTemplate = (source: Omit<MethodFromTemplate, "fields">, fields: MethodFields, accountContext: string): Promise<AuthResult<MethodView>> => mutate("/me/methods/from-template", "POST", { ...source, fields }, accountContext, isMethodView, undefined, 201);
export const updateMethod = (id: string, etag: string, fields: MethodFields, accountContext: string): Promise<AuthResult<MethodView>> => mutate(methodPath(id), "PATCH", { fields }, accountContext, isMethodView, etag);
export const duplicateMethod = (id: string, etag: string, accountContext: string): Promise<AuthResult<MethodView>> => mutate(methodPath(id, "/duplicates"), "POST", undefined, accountContext, isMethodView, etag, 201);
export const deleteMethod = (id: string, etag: string, accountContext: string): Promise<AuthResult<void>> => mutate(methodPath(id), "DELETE", undefined, accountContext, null, etag, 204);
