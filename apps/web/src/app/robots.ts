import type { MetadataRoute } from "next";
import { getServerConfig } from "@/lib/config/server";
import { absolutePublicUrl } from "@/lib/public/seo-policy";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const config = getServerConfig();
  if (config.environment !== "production" || !config.publishedLocales.length) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: config.publishedLocales.map(locale => `/${locale}`),
      disallow: ["/", "/api/", ...config.publishedLocales.flatMap(locale => ["admin", "dev", "compte", "account", "espace", "my", "commandes", "orders"].map(segment => `/${locale}/${segment}/`))] },
    sitemap: absolutePublicUrl("/sitemap.xml", config.publicOrigin),
  };
}
