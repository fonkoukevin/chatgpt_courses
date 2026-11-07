export type ApiError =
  | { kind: "http"; status: number }
  | { kind: "unavailable"; status?: number }
  | { kind: "invalid-response"; status: number };

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requestJson<T>(
  path: `/system/${string}`,
  decode: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = globalThis.setTimeout(abort, 35000);
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: "GET",
      headers: { Accept: "application/json, application/problem+json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      let problem: unknown;
      try {
        problem = await response.json();
      } catch {
        problem = null;
      }
      const unavailable = response.status === 503 || response.status === 504 || (
        isRecord(problem) && ["API_UNAVAILABLE", "API_CONFIGURATION_ERROR"].includes(String(problem.code))
      );
      return {
        ok: false,
        error: unavailable ? { kind: "unavailable", status: response.status } : { kind: "http", status: response.status },
      };
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: { kind: "invalid-response", status: response.status } };
    }
    if (!decode(data)) {
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

// Handwritten P01 contract. P03 will replace it with the verified OpenAPI client.
export type SystemHealth = { status: "UP" };

function isSystemHealth(value: unknown): value is SystemHealth {
  return isRecord(value) && value.status === "UP";
}

export function checkSystemHealth(signal?: AbortSignal): Promise<ApiResult<SystemHealth>> {
  return requestJson("/system/health", isSystemHealth, signal);
}

export function requestUnknownSystemEndpoint(signal?: AbortSignal): Promise<ApiResult<SystemHealth>> {
  // Deliberately calls a real missing route: the server's HTTP status is preserved.
  return requestJson("/system/unknown", isSystemHealth, signal);
}
