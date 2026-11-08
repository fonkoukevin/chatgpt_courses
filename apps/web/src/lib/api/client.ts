import { getSystemHealth } from "./generated/sdk.gen";
import type { FieldError, Problem, SystemHealth } from "./generated/types.gen";

export type { Problem, SystemHealth } from "./generated/types.gen";

export type ApiError =
  | { kind: "http"; status: number; problem?: Problem }
  | { kind: "unavailable"; status?: number; problem?: Problem }
  | { kind: "invalid-response"; status: number };

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError };

type Reply = { response?: Response; error?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && onlyKeys(value, ["field", "code", "message"])
    && nonEmpty(value.field) && nonEmpty(value.message)
    && typeof value.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(value.code);
}

function isProblem(value: unknown, status: number): value is Problem {
  return isRecord(value)
    && onlyKeys(value, ["type", "title", "status", "detail", "instance", "code", "traceId", "fieldErrors"])
    && value.type === "about:blank" && nonEmpty(value.title) && nonEmpty(value.detail)
    && value.status === status && status >= 400 && status <= 599
    && typeof value.instance === "string" && value.instance.startsWith("/")
    && !value.instance.includes("?") && !value.instance.includes("#")
    && typeof value.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(value.code)
    && typeof value.traceId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.traceId)
    && (value.fieldErrors === undefined || (
      Array.isArray(value.fieldErrors) && value.fieldErrors.length > 0 && value.fieldErrors.every(isFieldError)
    ));
}

function isSystemHealth(value: unknown): value is SystemHealth {
  return isRecord(value) && onlyKeys(value, ["status"]) && value.status === "UP";
}

function mediaType(response: Response): string {
  return response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function requestJson(
  operation: (signal: AbortSignal) => Promise<Reply>,
  signal?: AbortSignal,
): Promise<ApiResult<SystemHealth>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = globalThis.setTimeout(abort, 35000);
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    if (controller.signal.aborted) return { ok: false, error: { kind: "unavailable" } };
    const reply = await operation(controller.signal);
    const response = reply.response;
    if (!response) return { ok: false, error: { kind: "unavailable" } };
    if (controller.signal.aborted || (reply.error instanceof Error && !(reply.error instanceof SyntaxError))) {
      return { ok: false, error: { kind: "unavailable", status: response.status } };
    }
    if (!response.ok) {
      const problem = response.bodyUsed ? reply.error : await readJson(response);
      if (mediaType(response) !== "application/problem+json" || !isProblem(problem, response.status)) {
        return { ok: false, error: { kind: "invalid-response", status: response.status } };
      }
      const unavailable = response.status === 503 || response.status === 504
        || ["API_UNAVAILABLE", "API_CONFIGURATION_ERROR"].includes(problem.code);
      return { ok: false, error: {
        kind: unavailable ? "unavailable" : "http", status: response.status, problem,
      } };
    }
    const data = await readJson(response);
    if (response.status !== 200 || mediaType(response) !== "application/json" || !isSystemHealth(data)) {
      return { ok: false, error: { kind: "invalid-response", status: response.status } };
    }
    return { ok: true, data, status: response.status };
  } catch {
    return { ok: false, error: { kind: "unavailable" } };
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function checkSystemHealth(signal?: AbortSignal): Promise<ApiResult<SystemHealth>> {
  return requestJson(async (requestSignal) => {
    // Browser-only boundary: no internal origin, secret or configurable remote
    // destination enters this client. Server reads use the trusted server proxy.
    if (typeof location === "undefined") throw new Error("Browser origin required.");
    return getSystemHealth({
      baseUrl: `${location.origin}/api/v1`,
      headers: { Accept: "application/json, application/problem+json" },
      credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: requestSignal,
      // Generated types do not validate network data. Stream mode leaves a
      // successful body untouched for the runtime decoder above.
      parseAs: "stream", responseStyle: "fields", throwOnError: false,
    });
  }, signal);
}

export function requestUnknownSystemEndpoint(signal?: AbortSignal): Promise<ApiResult<SystemHealth>> {
  // This diagnostic deliberately calls an absent route. It must not become a
  // successful or fictitious operation in OpenAPI or in the generated SDK.
  return requestJson(async (requestSignal) => ({
    response: await fetch("/api/v1/system/unknown", {
      method: "GET", headers: { Accept: "application/json, application/problem+json" },
      credentials: "same-origin", cache: "no-store", redirect: "error", signal: requestSignal,
    }),
  }), signal);
}
