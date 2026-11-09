import { getServerConfig } from "@/lib/config/server";
import { readPublications } from "@/lib/api/public-server";
import { readOffers } from "@/lib/api/commerce-server";
import { offersPath } from "@/lib/commerce/routes";
import { publicCatalogueHref } from "@/lib/public/routes";
import { absolutePublicUrl, publicResourcePath } from "@/lib/public/seo-policy";

export const dynamic = "force-dynamic";
const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export async function GET() {
  const config = getServerConfig();
  const entries = new Map<string, string | null>();
  const deadline = Date.now() + 30_000;
  const add = (path: string, publishedAt: string | null = null) => {
    const url = absolutePublicUrl(path, config.publicOrigin);
    if (entries.has(url) || entries.size >= 50_000) throw new Error("Sitemap bounds or duplicate URL");
    entries.set(url, publishedAt);
  };
  try {
    if (config.environment === "production") for (const locale of config.publishedLocales) {
      add(`/${locale}`); add(publicCatalogueHref(locale)); add(offersPath(locale));
      let total: number | undefined;
      for (let page = 0; ; page++) {
        if (Date.now() > deadline || page >= 500) throw new Error("Sitemap deadline or size");
        const result = await readPublications(locale, page, 100);
        if (!result.ok || result.data.page !== page || result.data.pageSize !== 100 || result.data.items.some(item => item.locale !== locale)) throw new Error("Publications unavailable");
        total ??= result.data.total;
        if (result.data.total !== total || total > 50_000) throw new Error("Publication set changed or too large");
        for (const item of result.data.items) add(publicResourcePath(item.kind, locale, item.slug), item.publishedAt);
        if ((page + 1) * 100 >= total) break;
        if (result.data.items.length !== 100) throw new Error("Incomplete publication page");
      }
      total = undefined;
      for (let page = 0; ; page++) {
        if (Date.now() > deadline || page >= 500) throw new Error("Sitemap deadline or size");
        const result = await readOffers(locale, page, 100);
        if (!result.ok) throw new Error("Offers unavailable");
        total ??= result.data.total;
        if (result.data.total !== total || total > 50_000) throw new Error("Offer set changed or too large");
        for (const item of result.data.items) if (item.state === "ACTIVE" && item.translationAvailable && item.title) add(offersPath(locale, item.id));
        if ((page + 1) * 100 >= total) break;
        if (result.data.items.length !== 100) throw new Error("Incomplete offer page");
      }
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + [...entries].map(([url, modified]) => `<url><loc>${escapeXml(url)}</loc>${modified ? `<lastmod>${escapeXml(modified)}</lastmod>` : ""}</url>`).join("\n") + "\n</urlset>\n";
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    // An outage never becomes a successful empty/partial sitemap.
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
