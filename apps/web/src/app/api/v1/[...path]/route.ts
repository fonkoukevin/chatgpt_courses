import { randomUUID } from "node:crypto";
import { getServerConfig } from "@/lib/config/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

const problemDetails: Record<string, string> = {
  INVALID_API_PATH: "The requested API path is not supported.",
  API_CONFIGURATION_ERROR: "The API connection is not configured correctly.",
  API_INVALID_RESPONSE: "The API returned an unexpected response.",
  API_UNAVAILABLE: "The API connection could not be completed. Please try again.",
  INVALID_REQUEST_ORIGIN: "This request origin is not allowed.",
  REQUEST_TOO_LARGE: "The request body is too large.",
};

const MAX_BODY_BYTES = 64 * 1024;

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new RangeError("body-limit");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("body-limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}

function problem(status: number, code: string, instance: string): Response {
  const traceId = randomUUID();
  return Response.json(
    {
      type: "about:blank",
      title: "API request failed",
      status,
      detail: problemDetails[code],
      instance,
      code,
      traceId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Trace-Id": traceId,
      },
    },
  );
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  // Omit query parameters: they may contain information that must not be echoed.
  const instance = new URL(request.url).pathname;
  const { path } = await context.params;
  if (!path.length || path.some((part) => !/^[a-zA-Z0-9._~-]+$/.test(part) || part === "." || part === "..")) {
    return problem(400, "INVALID_API_PATH", instance);
  }
  let config;
  try {
    config = getServerConfig();
  } catch {
    return problem(503, "API_CONFIGURATION_ERROR", instance);
  }
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}`, config.apiInternalOrigin);
  url.search = new URL(request.url).search;
  const headers = new Headers({ Accept: "application/json, application/problem+json" });
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation && ((request.headers.has("origin") && request.headers.get("origin") !== config.publicOrigin)
      || request.headers.get("sec-fetch-site") === "cross-site")) {
    return problem(403, "INVALID_REQUEST_ORIGIN", instance);
  }
  for (const name of ["content-type", "x-csrf-token", "if-match", "idempotency-key", "x-account-context"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const session = request.headers.get("cookie")?.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith("SESSION="));
  if (session) headers.set("Cookie", session);

  try {
    const body = mutation ? await boundedBody(request) : null;
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: body as BodyInit | null,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    // Redirects never relay session cookies to another host or expose internal URLs.
    if (upstream.status >= 300 && upstream.status < 400) {
      return problem(502, "API_INVALID_RESPONSE", instance);
    }
    const responseHeaders = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "etag", "retry-after", "allow"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith("SESSION=")) responseHeaders.append("Set-Cookie", cookie);
    }
    // Read the P01 JSON payload before sending headers, so a body timeout also
    // becomes a structured gateway error instead of a misleading HTTP 200.
    const responseBody = request.method === "HEAD" || upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RangeError && error.message === "body-limit") return problem(413, "REQUEST_TOO_LARGE", instance);
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return problem(timedOut ? 504 : 502, "API_UNAVAILABLE", instance);
  }
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
