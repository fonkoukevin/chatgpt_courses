import { isProblem, type ApiError } from "./client";
import { isAuthUser, isCsrfToken, isPreferences, preferencesEtagMatches } from "./auth-validation";
import type { AuthUser, CsrfToken, Preferences, GetCsrfTokenData, RegisterData, LoginData, LogoutData, GetCurrentUserData, RequestPasswordResetData, ResetPasswordData, GetPreferencesData, UpdatePreferencesData } from "./generated/types.gen";
import { purgePersonalBrowserCaches } from "../auth/anonymous-draft";
import { publishAccountEvent } from "../auth/account-events";

export type { AuthUser, Preferences } from "./generated/types.gen";
export type AuthResult<T> = { ok: true; data: T; status: number; etag?: string } | { ok: false; error: ApiError };
type AuthPath = (GetCsrfTokenData | RegisterData | LoginData | LogoutData | GetCurrentUserData | RequestPasswordResetData | ResetPasswordData | GetPreferencesData | UpdatePreferencesData)["url"];
let csrf: CsrfToken | null = null;
let csrfRequest: Promise<AuthResult<CsrfToken>> | null = null;
let csrfGeneration = 0;

async function send<T>(path: AuthPath, init: RequestInit, expectedStatus: number, decode: ((value: unknown) => value is T) | null): Promise<AuthResult<T>> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...init, headers: { Accept: "application/json, application/problem+json", ...init.headers },
      credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
    });
    const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    if (!response.ok) {
      let problem: unknown;
      try { problem = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      if (mediaType !== "application/problem+json" || !isProblem(problem, response.status)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
      const unavailable = [503, 504].includes(response.status) || ["API_UNAVAILABLE", "API_CONFIGURATION_ERROR"].includes(problem.code);
      return { ok: false, error: { kind: unavailable ? "unavailable" : "http", status: response.status, problem } };
    }
    if (response.status !== expectedStatus) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    if (!decode) {
      if ((await response.text()) !== "") return { ok: false, error: { kind: "invalid-response", status: response.status } };
      return { ok: true, data: undefined as T, status: response.status };
    }
    let value: unknown;
    try { value = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (mediaType !== "application/json" || !decode(value)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    const etag = response.headers.get("ETag");
    if (path === "/me/preferences" && (!isPreferences(value) || !preferencesEtagMatches(value, etag))) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: true, data: value, status: response.status, ...(etag ? { etag } : {}) };
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { globalThis.clearTimeout(timer); }
}

export function clearCsrfToken(): void { csrf = null; csrfRequest = null; csrfGeneration++; }

export async function getCsrfToken(): Promise<AuthResult<CsrfToken>> {
  if (csrf) return { ok: true, data: csrf, status: 200 };
  if (csrfRequest) return csrfRequest;
  const generation = csrfGeneration;
  const request = send("/auth/csrf", { method: "GET" }, 200, isCsrfToken).then((result) => {
    if (result.ok && generation === csrfGeneration) csrf = result.data;
    return result;
  }).finally(() => { if (csrfRequest === request) csrfRequest = null; });
  csrfRequest = request;
  return request;
}

async function renewCsrf(): Promise<void> { clearCsrfToken(); await getCsrfToken(); }

async function mutate<T>(path: AuthPath, method: "POST" | "PATCH", body: string | undefined, contentType: string | undefined, status: number, decode: ((value: unknown) => value is T) | null, extraHeaders: Record<string, string> = {}): Promise<AuthResult<T>> {
  const token = await getCsrfToken();
  if (!token.ok) return token;
  const result = await send(path, { method, body, headers: {
    ...(contentType ? { "Content-Type": contentType } : {}), ...extraHeaders, [token.data.headerName]: token.data.token,
  } }, status, decode);
  // Refresh the token for a user's next deliberate attempt. Never repeat a
  // session mutation automatically after an ambiguous or rejected response.
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) await renewCsrf();
  return result;
}

export function registerAccount(body: RegisterData["body"]): Promise<AuthResult<AuthUser>> {
  return mutate("/auth/register", "POST", JSON.stringify(body), "application/json", 201, isAuthUser);
}
export async function signIn(email: string, password: string): Promise<AuthResult<AuthUser>> {
  const result = await mutate("/auth/login", "POST", new URLSearchParams({ email, password }).toString(), "application/x-www-form-urlencoded", 200, isAuthUser);
  if (result.ok) { await renewCsrf(); publishAccountEvent("signed-in"); }
  return result;
}
export async function signOut(): Promise<AuthResult<void>> {
  const result = await mutate<void>("/auth/logout", "POST", undefined, undefined, 204, null);
  if (result.ok) { await purgePersonalBrowserCaches(); await renewCsrf(); publishAccountEvent("signed-out"); }
  return result;
}
export function requestPasswordReset(body: RequestPasswordResetData["body"]): Promise<AuthResult<void>> {
  return mutate<void>("/auth/password-reset-requests", "POST", JSON.stringify(body), "application/json", 202, null);
}
export async function resetPassword(body: ResetPasswordData["body"]): Promise<AuthResult<void>> {
  const result = await mutate<void>("/auth/password-resets", "POST", JSON.stringify(body), "application/json", 204, null);
  if (result.ok) { await purgePersonalBrowserCaches(); await renewCsrf(); publishAccountEvent("session-reset"); }
  return result;
}
export async function getCurrentUser(): Promise<AuthResult<AuthUser>> {
  const result = await send("/auth/me", { method: "GET" }, 200, isAuthUser);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) await renewCsrf();
  return result;
}
export function updatePreferences(locale: Preferences["locale"], etag: string): Promise<AuthResult<Preferences>> {
  return mutate("/me/preferences", "PATCH", JSON.stringify({ locale }), "application/json", 200, isPreferences, { "If-Match": etag });
}
