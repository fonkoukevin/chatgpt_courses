import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { Locale } from "../i18n/locales";
import type { AuthResult } from "./auth-client";
import { methodPath, methodQueryString, methodTemplatePath, type MethodQuery } from "./methods-client";
import { decodeMethodsResponse } from "./methods-response";
import { isMethodPage, isMethodSourceUpdate, isMethodTemplate, isMethodView } from "./methods-validation";

async function read<T>(path: string, decode: (value: unknown) => value is T, personal = true): Promise<AuthResult<T>> {
  const session = personal ? (await cookies()).get("SESSION")?.value : undefined;
  if (personal && (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session))) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), {
      method: "GET", headers: { Accept: "application/json, application/problem+json", ...(session ? { Cookie: `SESSION=${session}` } : {}) },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    return await decodeMethodsResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readMethods = (query: MethodQuery) => read(`/me/methods?${methodQueryString(query)}`, isMethodPage);
export const readMethod = (id: string) => read(methodPath(id), isMethodView);
export const readMethodSourceUpdate = (id: string) => read(methodPath(id, "/source-update"), isMethodSourceUpdate);
// Until a real entitlement reader exists, this public page never forwards a
// session to make a premium definition appear available.
export const readMethodTemplate = (resourceId: string, versionId: string, locale: Locale) => read(methodTemplatePath(resourceId, versionId, locale), isMethodTemplate, false);
