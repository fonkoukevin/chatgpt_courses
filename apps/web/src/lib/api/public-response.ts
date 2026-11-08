import type { AuthResult } from "./auth-client";
import { isProblem } from "./client";

export async function decodePublicResponse<T>(response: Response, validate: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  let value: unknown;
  try { value = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  if (!response.ok) {
    if (mediaType !== "application/problem+json" || !isProblem(value, response.status)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: false, error: { kind: [502, 503, 504].includes(response.status) ? "unavailable" : "http", status: response.status, problem: value } };
  }
  if (response.status !== 200 || mediaType !== "application/json" || !validate(value)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
  return { ok: true, data: value, status: response.status };
}
