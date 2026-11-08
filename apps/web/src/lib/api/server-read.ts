import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import { isProblem } from "./client";
import { isAuthUser, isPreferences, preferencesEtagMatches } from "./auth-validation";
import type { AuthUser, Preferences } from "./generated/types.gen";
import type { AuthResult } from "./auth-client";

async function readPrivate<T>(path: "/auth/me" | "/me/preferences", decode: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session) return { ok: false, error: { kind: "http", status: 401 } };
  if (!/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), {
      method: "GET", headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` },
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
    const etag = response.headers.get("ETag");
    if (path === "/me/preferences" && (!isPreferences(value) || !preferencesEtagMatches(value, etag))) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: true, data: value, status: response.status, ...(etag ? { etag } : {}) };
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}

export function readCurrentUser(): Promise<AuthResult<AuthUser>> { return readPrivate("/auth/me", isAuthUser); }
export function readPreferences(): Promise<AuthResult<Preferences>> { return readPrivate("/me/preferences", isPreferences); }
