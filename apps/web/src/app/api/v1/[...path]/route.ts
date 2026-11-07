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
};

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
  const session = request.headers.get("cookie")?.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith("SESSION="));
  if (session) headers.set("Cookie", session);

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    // Redirects never relay session cookies to another host or expose internal URLs.
    if (upstream.status >= 300 && upstream.status < 400) {
      return problem(502, "API_INVALID_RESPONSE", instance);
    }
    const responseHeaders = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "etag", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith("SESSION=")) responseHeaders.append("Set-Cookie", cookie);
    }
    // Read the P01 JSON payload before sending headers, so a body timeout also
    // becomes a structured gateway error instead of a misleading HTTP 200.
    const body = request.method === "HEAD" || upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return problem(timedOut ? 504 : 502, "API_UNAVAILABLE", instance);
  }
}

// P01 only needs reads. Session mutations and their CSRF forwarding come in P04.
export { proxy as GET, proxy as HEAD };
