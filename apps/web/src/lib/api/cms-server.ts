import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { AuthResult } from "./auth-client";
import { contentPath, contentQueryString, type ContentQuery } from "./cms-client";
import { decodeCmsResponse } from "./cms-response";
import { isContentPage, isContentView, isDependencies, isReadiness } from "./cms-validation";

async function read<T>(path: string, decode: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), {
      method: "GET", headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    return await decodeCmsResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export function readContents(query: ContentQuery) { return read(`/admin/contents?${contentQueryString(query)}`, isContentPage); }
export function readContent(id: string, preview = false) { return read(contentPath(id, preview ? "/preview" : ""), isContentView); }
export function readContentReadiness(id: string) { return read(contentPath(id, "/readiness"), isReadiness); }
export function readContentDependencies(id: string) { return read(contentPath(id, "/dependencies"), isDependencies); }
