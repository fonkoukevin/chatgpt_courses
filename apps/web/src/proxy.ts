import { NextResponse, type NextRequest } from "next/server";
import { getServerConfig } from "./lib/config/server";
import { stagingCredentialsMatch } from "./lib/config/staging";
import { isPublicIndexingPath } from "./lib/public/seo-policy";

export function proxy(request: NextRequest) {
  const site = getServerConfig();
  // This one signed machine endpoint has its own mandatory access check in
  // Spring. No browser route or broader webhook prefix bypasses the perimeter.
  const signedWebhook = request.method === "POST" && request.nextUrl.pathname === "/api/v1/webhooks/stripe";
  if (site.environment === "staging" && !signedWebhook) {
    try {
      if (!stagingCredentialsMatch(request.headers.get("authorization"))) return new NextResponse(null, {
        status: 401, headers: { "WWW-Authenticate": 'Basic realm="Courses staging", charset="UTF-8"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    } catch {
      return new NextResponse(null, { status: 503, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
  }
  const response = NextResponse.next();
  if (!isPublicIndexingPath(request.nextUrl.pathname, request.nextUrl.search, site)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (site.environment === "staging") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Vary", "Authorization");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = { matcher: "/:path*" };
