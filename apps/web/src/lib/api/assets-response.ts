import type { AuthResult } from "./auth-client";
import { isProblem } from "./client";

export async function decodeAssetResponse<T>(response: Response, decode: (value: unknown) => value is T, statuses = [200]): Promise<AuthResult<T>> {
  const media = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  let value: unknown;
  try { value = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  if (!response.ok) {
    if (media !== "application/problem+json" || !isProblem(value, response.status)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: false, error: { kind: [502, 503, 504].includes(response.status) ? "unavailable" : "http", status: response.status, problem: value } };
  }
  if (!statuses.includes(response.status) || media !== "application/json" || !decode(value)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
  const etag = response.headers.get("ETag");
  return { ok: true, data: value, status: response.status, ...(etag ? { etag } : {}) };
}
