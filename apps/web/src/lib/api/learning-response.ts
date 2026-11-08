import type { AuthResult } from "./auth-client";
import { isProblem } from "./client";
import { activityNoteEtag, activityProgressEtag, isActivityNoteView, isActivityProgressView } from "./learning-validation";

export async function decodeLearningResponse<T>(response: Response, decode: (value: unknown) => value is T, statuses = [200]): Promise<AuthResult<T>> {
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  let value: unknown;
  try { value = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  if (!response.ok) {
    if (mediaType !== "application/problem+json" || !isProblem(value, response.status)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
    return { ok: false, error: { kind: [502, 503, 504].includes(response.status) ? "unavailable" : "http", status: response.status, problem: value } };
  }
  if (!statuses.includes(response.status) || mediaType !== "application/json" || !decode(value)) return { ok: false, error: { kind: "invalid-response", status: response.status } };
  const etag = response.headers.get("ETag");
  if ((isActivityNoteView(value) && etag !== activityNoteEtag(value)) || (isActivityProgressView(value) && etag !== activityProgressEtag(value))) return { ok: false, error: { kind: "invalid-response", status: response.status } };
  return { ok: true, data: value, status: response.status, ...(etag ? { etag } : {}) };
}
