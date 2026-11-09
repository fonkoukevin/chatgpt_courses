import { isAttestationContentType } from "@/lib/api/attestations-validation";
import { createHash, randomUUID } from "node:crypto";
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
  const mediaStream = ["GET", "HEAD"].includes(request.method) && path.length === 3 && path[0] === "media"
    && /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(path[1]) && path[2] === "stream";
  const attestationDocument = request.method === "GET" && path.length === 4 && path[0] === "me" && path[1] === "attestations"
    && /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(path[2]) && path[3] === "document";
  const stripeWebhook = request.method === "POST" && path.length === 2 && path[0] === "webhooks" && path[1] === "stripe";
  const metricsCsv = request.method === "GET" && path.length === 3 && path[0] === "admin" && path[1] === "metrics" && path[2] === "export";
  const headers = new Headers({ Accept: mediaStream ? "video/mp4, application/problem+json" : attestationDocument ? "text/html, application/problem+json" : metricsCsv ? "text/csv, application/problem+json" : "application/json, application/problem+json" });
  if (mediaStream && request.headers.has("range")) headers.set("Range", request.headers.get("range")!);
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation && ((request.headers.has("origin") && request.headers.get("origin") !== config.publicOrigin)
      || request.headers.get("sec-fetch-site") === "cross-site")) {
    return problem(403, "INVALID_REQUEST_ORIGIN", instance);
  }
  for (const name of stripeWebhook ? ["content-type", "stripe-signature"] : ["content-type", "x-csrf-token", "if-match", "idempotency-key", "x-account-context"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const session = request.headers.get("cookie")?.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith("SESSION="));
  if (session && !stripeWebhook) headers.set("Cookie", session);

  let headersTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = mutation ? await boundedBody(request) : null;
    const controller = new AbortController();
    // A stream keeps the client's cancellation signal after its headers arrive.
    // The ordinary metadata deadline must not cut a long video after its headers.
    if (mediaStream) headersTimer = setTimeout(() => controller.abort(), config.apiTimeoutMs);
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: body as BodyInit | null,
      cache: "no-store",
      redirect: "manual",
      signal: mediaStream ? AbortSignal.any([request.signal, controller.signal]) : AbortSignal.timeout(config.apiTimeoutMs),
    });
    if (headersTimer) clearTimeout(headersTimer);
    // Redirects never relay session cookies to another host or expose internal URLs.
    if (upstream.status >= 300 && upstream.status < 400) {
      return problem(502, "API_INVALID_RESPONSE", instance);
    }
    const responseHeaders = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    for (const name of ["content-type", "etag", "retry-after", "allow"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith("SESSION=")) responseHeaders.append("Set-Cookie", cookie);
    }
    if (metricsCsv && upstream.ok) {
      const length = upstream.headers.get("content-length"), disposition = upstream.headers.get("content-disposition"), sha256 = upstream.headers.get("x-content-sha256");
      if (upstream.status !== 200 || !/^text\/csv(?:;\s*charset=UTF-8)?$/i.test(upstream.headers.get("content-type") ?? "")
        || !length || !/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 1048576 || !upstream.body
        || !disposition || !/^attachment; filename="operations-metrics-[0-9]{8}-[0-9]{8}\.csv"$/.test(disposition)
        || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) { await upstream.body?.cancel(); return problem(502, "API_INVALID_RESPONSE", instance); }
      const reader = upstream.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > Number(length)) { await reader.cancel(); return problem(502, "API_INVALID_RESPONSE", instance); } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      if (size !== Number(length)) return problem(502, "API_INVALID_RESPONSE", instance);
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (createHash("sha256").update(bytes).digest("hex") !== sha256) return problem(502, "API_INVALID_RESPONSE", instance);
      responseHeaders.set("Content-Length", length); responseHeaders.set("Content-Disposition", disposition); responseHeaders.set("X-Content-SHA256", sha256);
      // Next owns transport framing and may remove Content-Length. This size is
      // the verified decoded CSV size and survives transport compression/chunking.
      responseHeaders.set("X-Content-Size", String(bytes.byteLength));
      responseHeaders.set("Cache-Control", "private, no-store, no-transform");
      responseHeaders.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; sandbox");
      return new Response(bytes, { status: 200, headers: responseHeaders });
    }
    if (attestationDocument && upstream.ok) {
      const length = upstream.headers.get("content-length"), disposition = upstream.headers.get("content-disposition"), sha256 = upstream.headers.get("x-content-sha256");
      if (upstream.status !== 200 || !isAttestationContentType(upstream.headers.get("content-type"))
        || !length || !/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 262144 || !upstream.body
        || disposition !== `attachment; filename="attestation-${path[2]}.html"` || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
        await upstream.body?.cancel(); return problem(502, "API_INVALID_RESPONSE", instance);
      }
      // Bound the streamed bytes before returning any successful download headers.
      const reader = upstream.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > Number(length)) { await reader.cancel(); return problem(502, "API_INVALID_RESPONSE", instance); } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      if (size !== Number(length)) return problem(502, "API_INVALID_RESPONSE", instance);
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      responseHeaders.set("Content-Length", length); responseHeaders.set("Content-Disposition", disposition); responseHeaders.set("X-Content-SHA256", sha256);
      responseHeaders.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox");
      return new Response(bytes, { status: 200, headers: responseHeaders });
    }
    if (mediaStream) {
      for (const name of ["accept-ranges", "content-range", "content-disposition"]) {
        const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value);
      }
      if ([200, 206].includes(upstream.status)) {
        const length = upstream.headers.get("content-length");
        if (upstream.headers.get("content-type")?.split(";")[0].trim() !== "video/mp4" || !length
          || !/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 128 * 1024 * 1024) {
          await upstream.body?.cancel(); return problem(502, "API_INVALID_RESPONSE", instance);
        }
        responseHeaders.set("Content-Length", length);
        return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
      }
    }
    // Read the P01 JSON payload before sending headers, so a body timeout also
    // becomes a structured gateway error instead of a misleading HTTP 200.
    const responseBody = request.method === "HEAD" || upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RangeError && error.message === "body-limit") return problem(413, "REQUEST_TOO_LARGE", instance);
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return problem(timedOut ? 504 : 502, "API_UNAVAILABLE", instance);
  } finally {
    if (headersTimer) clearTimeout(headersTimer);
  }
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
