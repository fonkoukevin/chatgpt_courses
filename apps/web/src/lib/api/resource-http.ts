import { clearCsrfToken, getCsrfToken, type AuthResult } from "./auth-client";
import { isUuid } from "./cms-validation";
import { decodeAssetResponse } from "./assets-response";

export async function readResourceJson<T>(path: string, decode: (value: unknown) => value is T, init: RequestInit = {}, statuses = [200]): Promise<AuthResult<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try { return await decodeAssetResponse(await fetch(`/api/v1${path}`, { ...init, headers: { Accept: "application/json, application/problem+json", ...init.headers }, credentials: init.credentials ?? "same-origin", cache: "no-store", redirect: "error", signal: controller.signal }), decode, statuses); }
  catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
export async function mutateResourceJson<T>(path: string, body: unknown, accountContext: string | undefined, decode: (value: unknown) => value is T, statuses = [200], options: { method?: "POST" | "PUT"; etag?: string; idempotencyKey?: string } = {}): Promise<AuthResult<T>> {
  if (accountContext !== undefined && !isUuid(accountContext)) throw new Error("Invalid expected account identifier.");
  if (options.idempotencyKey !== undefined && !isUuid(options.idempotencyKey)) throw new Error("Invalid idempotency key.");
  const csrf = await getCsrfToken(); if (!csrf.ok) return csrf;
  const result = await readResourceJson(path, decode, { method: options.method ?? "POST", headers: { "Content-Type": "application/json", [csrf.data.headerName]: csrf.data.token, ...(accountContext ? { "X-Account-Context": accountContext } : {}), ...(options.etag ? { "If-Match": options.etag } : {}), ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }, statuses);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) { clearCsrfToken(); await getCsrfToken(); }
  return result;
}
export function resourceId(value: string): string { if (!isUuid(value)) throw new Error("Invalid resource identifier."); return value; }
export function resourcePagination(page: number, pageSize: number): string {
  if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid resource pagination.");
  return new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
}
export const matchingResource = <T>(guard: (value: unknown) => value is T, matches: (value: T) => boolean) => (value: unknown): value is T => guard(value) && matches(value);
