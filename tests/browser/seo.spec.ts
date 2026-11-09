import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { PublicPublicationPage } from "../../apps/web/src/lib/api/generated/types.gen";
import { publicResourcePath } from "../../apps/web/src/lib/public/seo-policy";
import { createPublicFixture, publishPublicContent, type PublicFixture } from "./public-content-fixture";
import { createContent, currentContent, type RecordedContent } from "./editorial-api";
import { editorialContent } from "./editorial-content";
import { csrfHeaders, loginEditor } from "./editorial-fixture";
import { nameProfile } from "./account-fixture";
import { controlApi } from "./control";
import { seoProbeObservations, startSeoServer } from "./seo-server";

test.describe.configure({ mode: "serial" });
let owner: APIRequestContext, other: APIRequestContext, fixture: PublicFixture, onlyFr: RecordedContent, draft: RecordedContent;
const checks: { name: string; passed: boolean }[] = [];
const mark = (name: string, value: boolean) => { checks.push({ name, passed: value }); expect(value, name).toBe(true); };
const syntheticOrigin = "https://courses.invalid";
const ownerName = `SEO-owner-${randomUUID()}`, otherName = `SEO-other-${randomUUID()}`;

test.beforeAll(async ({ playwright }) => {
  owner = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  other = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  fixture = await createPublicFixture(owner);
  await nameProfile(owner, fixture.editor.userId, ownerName);
  const second = await loginEditor(other); await nameProfile(other, second.id, otherName);
  const command = editorialContent("fr"); command.kind = "GUIDE"; command.slug = `p16-seo-fr-only-${randomUUID()}`; command.title = "P16 · guide disponible en français uniquement";
  onlyFr = await publishPublicContent(owner, await createContent(owner, command));
  command.slug = `p16-seo-draft-${randomUUID()}`; command.title = "P16 · brouillon privé non publiable";
  draft = await createContent(owner, command);
});

test.afterAll(async () => {
  await owner?.dispose(); await other?.dispose();
  writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, "seo-checks.json"), JSON.stringify({ verifiedAt: new Date().toISOString(),
    scope: "Local production/staging configuration probes on loopback against isolated TEST Spring/PostgreSQL; no deployment or search-engine validation", syntheticPublicOrigin: syntheticOrigin,
    checks, secondaryServers: seoProbeObservations, allRecordedChecksPassed: checks.length > 0 && checks.every(check => check.passed),
    allSecondaryServersStopped: seoProbeObservations.every(server => server.stopped), secretsPrinted: false, rawPrivateHtmlExported: false }, null, 2) + "\n");
});

test("P16 SEO · HTML serveur FR/EN, réciprocité, sitemap frais, alias et vraies 404", async ({ page }) => {
  const server = await startSeoServer("production");
  try {
    const pair = fixture.resources.guide;
    const canonical = (locale: "fr" | "en") => syntheticOrigin + publicResourcePath("GUIDE", locale, pair[locale].value.slug);
    for (const locale of ["fr", "en"] as const) {
      const path = publicResourcePath("GUIDE", locale, pair[locale].value.slug);
      const response = await fetch(server.origin + path, { headers: { "User-Agent": "facebookexternalhit/1.1" } });
      const html = await response.text();
      mark(`${locale}: HTTP200 and indexable header`, response.status === 200 && !response.headers.get("x-robots-tag")?.includes("noindex"));
      mark(`${locale}: rendered lang and exact title`, html.includes(`<html lang="${locale}"`) && html.includes(pair[locale].value.title));
      mark(`${locale}: canonical and reciprocal equivalents in server head`, html.split("</head>")[0].includes(`rel="canonical" href="${canonical(locale)}"`) && ["fr", "en"].every(language => html.split("</head>")[0].includes(`hrefLang="${language}" href="${canonical(language as "fr" | "en")}"`)));
      await page.goto(server.origin + path);
      await expect(page.locator("h1")).toHaveText(pair[locale].value.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", pair[locale].value.summary);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
      const breadcrumb = await page.locator('script[type="application/ld+json"]').textContent();
      const data = JSON.parse(breadcrumb!) as { "@type": string; itemListElement: { position: number; name: string; item: string }[] };
      mark(`${locale}: real BreadcrumbList with matching visible trail`, data["@type"] === "BreadcrumbList" && data.itemListElement.length === 3 && data.itemListElement[2].item === canonical(locale) && data.itemListElement[2].name === pair[locale].value.title && await page.getByRole("navigation", { name: locale === "fr" ? "Fil d’Ariane" : "Breadcrumb", exact: true }).isVisible());
      await page.setViewportSize({ width: locale === "fr" ? 1440 : 390, height: 1000 });
      mark(`${locale}: public SEO page fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-seo-published-guide.png`), fullPage: true, animations: "disabled" });
    }
    const filtered = await fetch(`${server.origin}/fr/catalogue?q=brief`); const filteredHtml = await filtered.text();
    mark("filtered catalogue noindex and clean canonical", filtered.headers.get("x-robots-tag")?.includes("noindex") === true && filteredHtml.includes(`rel="canonical" href="${syntheticOrigin}/fr/catalogue"`));
    const unknown = await fetch(`${server.origin}/fr/guides/not-a-real-${randomUUID()}`);
    mark("unknown public slug is actual404", unknown.status === 404);
    const before = await currentContent(owner, pair.fr.value.id), newSlug = `p16-renamed-${randomUUID()}`;
    const renamed = await owner.patch(`/api/v1/admin/contents/${before.value.id}/slug`, { headers: { ...await csrfHeaders(owner), "X-Account-Context": fixture.editor.userId, "If-Match": before.etag }, data: { slug: newSlug, reason: "Explicit disposable P16 SEO rename" } });
    mark("rename persisted HTTP200", renamed.status() === 200);
    const oldPath = publicResourcePath("GUIDE", "fr", pair.fr.value.slug), newPath = publicResourcePath("GUIDE", "fr", newSlug);
    const old = await fetch(`${server.origin}${oldPath}?version=${pair.fr.value.versionId}`, { redirect: "manual", headers: { "User-Agent": "facebookexternalhit/1.1" } });
    mark("old slug308 preserves pinned version", old.status === 308 && old.headers.get("location") === `${newPath}?version=${pair.fr.value.versionId}`);
    const sitemap = await fetch(`${server.origin}/sitemap.xml`); const xml = await sitemap.text();
    mark("sitemap actual XML and no stale caching", sitemap.status === 200 && sitemap.headers.get("content-type")?.startsWith("application/xml") === true && sitemap.headers.get("cache-control")?.includes("no-store") === true);
    mark("sitemap includes new canonical and removes old slug", xml.includes(`<loc>${syntheticOrigin}${newPath}</loc>`) && !xml.includes(`<loc>${canonical("fr")}</loc>`));
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    mark("sitemap contains actual canonical URL entries", locations.length > 0);
    mark("sitemap excludes private and query URLs", locations.every(url => !/\/admin\/|\/compte|\/account|\/orders|\/commandes|\?/.test(url)));
    mark("sitemap excludes draft and missing EN translation", !xml.includes(draft.value.slug) && xml.includes(onlyFr.value.slug) && !xml.includes(`/en/guides/${onlyFr.value.slug}`));
    const publications = await owner.get("/api/v1/catalog/publications?locale=fr&pageSize=100"); const feed = await publications.json() as PublicPublicationPage;
    const publication = feed.items.find(item => item.resourceId === pair.fr.value.resourceId)!;
    mark("sitemap lastmod equals actual publication event", publication.publishedAt !== null && xml.includes(`<loc>${syntheticOrigin}${newPath}</loc><lastmod>${publication.publishedAt}</lastmod>`));
    const renamedHtml = await (await fetch(server.origin + newPath)).text();
    mark("renamed canonical and EN reciprocal now target replacement", renamedHtml.includes(`rel="canonical" href="${syntheticOrigin}${newPath}"`) && (await (await fetch(server.origin + publicResourcePath("GUIDE", "en", pair.en.value.slug))).text()).includes(`hrefLang="fr" href="${syntheticOrigin}${newPath}"`));
    const robots = await (await fetch(`${server.origin}/robots.txt`)).text();
    mark("production robots references HTTPS sitemap", robots.includes(`Sitemap: ${syntheticOrigin}/sitemap.xml`) && robots.includes("Allow: /fr") && robots.includes("Allow: /en"));
  } finally { await server.stop(); }
});

test("P16 SEO · une seule langue publiée, racine307 et absence de cache privé entre comptes", async () => {
  const server = await startSeoServer("production", "fr");
  try {
    const root = await fetch(server.origin, { redirect: "manual", headers: { "Accept-Language": "en-US,en;q=0.9" } });
    mark("root uses configurable temporary307 without IP/browser override", root.status === 307 && root.headers.get("location") === "/fr");
    const english = await fetch(`${server.origin}/en`); const html = await english.text();
    mark("unlaunched EN stays accessible but nonindexable and without hreflang", english.status === 200 && english.headers.get("x-robots-tag")?.includes("noindex") === true && !html.includes('rel="alternate"'));
    const xml = await (await fetch(`${server.origin}/sitemap.xml`)).text(); mark("sitemap only includes configured FR", xml.includes(`${syntheticOrigin}/fr`) && !xml.includes(`${syntheticOrigin}/en`));
    const a = await owner.get(`${server.origin}/fr/compte`), b = await other.get(`${server.origin}/fr/compte`);
    const bodyA = await a.text(), bodyB = await b.text();
    mark("SSR account remains no-store/noindex", [a, b].every(response => response.status() === 200 && /private/.test(response.headers()["cache-control"] ?? "") && /no-store/.test(response.headers()["cache-control"] ?? "") && /noindex/.test(response.headers()["x-robots-tag"] ?? "")));
    mark("same SSR account URL never crosses profile data", bodyA.includes(ownerName) && !bodyA.includes(otherName) && bodyB.includes(otherName) && !bodyB.includes(ownerName));
    const anonymous = await fetch(`${server.origin}/fr/compte`, { redirect: "manual" });
    mark("anonymous private route redirects to identity with noindex", anonymous.status === 307 && /\/fr\/connexion/.test(anonymous.headers.get("location") ?? "") && /noindex/.test(anonymous.headers.get("x-robots-tag") ?? ""));
  } finally { await server.stop(); }
});

test("P16 SEO · recette fermée sans configuration et contrôle effectif pages/API/assets", async () => {
  let server = await startSeoServer("staging", "fr,en", true);
  try { const response = await fetch(`${server.origin}/fr`); mark("staging missing perimeter credentials fails closed503", response.status === 503); }
  finally { await server.stop(); }
  server = await startSeoServer("staging");
  try {
    const unauthorized = await fetch(`${server.origin}/fr`), wrong = await fetch(`${server.origin}/fr`, { headers: { Authorization: "Basic aW52YWxpZDppbnZhbGlk" } });
    mark("staging actual401 challenge without/with wrong credentials", unauthorized.status === 401 && wrong.status === 401 && unauthorized.headers.has("www-authenticate"));
    const headers = { Authorization: server.authorization };
    const allowed = await fetch(`${server.origin}/fr`, { headers }); const html = await allowed.text();
    mark("staging authorized200 remains noindex/no-store", allowed.status === 200 && allowed.headers.get("x-robots-tag")?.includes("noindex") === true && allowed.headers.get("cache-control")?.includes("no-store") === true && !html.includes('rel="alternate"'));
    const apiDenied = await fetch(`${server.origin}/api/v1/system/health`), apiAllowed = await fetch(`${server.origin}/api/v1/system/health`, { headers });
    mark("staging perimeter also gates public API", apiDenied.status === 401 && apiAllowed.status === 200);
    const css = html.match(/href="([^\"]*\/_next\/static\/[^\"]+\.css[^\"]*)"/)?.[1]?.replaceAll("&amp;", "&"); mark("staging real CSS referenced", Boolean(css));
    const assetDenied = await fetch(server.origin + css!), assetAllowed = await fetch(server.origin + css!, { headers });
    mark("staging perimeter gates actual static assets", assetDenied.status === 401 && assetAllowed.status === 200);
    mark("staging authorized assets stay outside shared cache", assetAllowed.headers.get("cache-control")?.includes("no-store") === true && assetAllowed.headers.get("cache-control")?.includes("private") === true);
    const unsigned = await fetch(`${server.origin}/api/v1/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const webhookProblem = await unsigned.json() as { code?: string };
    mark("exact machine webhook reaches Spring and remains closed while Stripe is disabled", unsigned.status === 503 && webhookProblem.code === "PAYMENT_NOT_CONFIGURED");
    for (const [path, method] of [["/api/v1/webhooks/stripe", "GET"], ["/api/v1/webhooks/stripe/extra", "POST"]]) mark(`no broad webhook bypass ${method}`, (await fetch(server.origin + path, { method })).status === 401);
    const xml = await (await fetch(`${server.origin}/sitemap.xml`, { headers })).text(); const robots = await (await fetch(`${server.origin}/robots.txt`, { headers })).text();
    mark("staging sitemap empty and robots deny all", !xml.includes("<loc>") && robots.includes("Disallow: /"));
  } finally { await server.stop(); }
});

test("P16 SEO · une panne API ne produit pas de sitemap vide réussi", async () => {
  const server = await startSeoServer("production");
  try {
    await controlApi("stop-api");
    try { const result = await fetch(`${server.origin}/sitemap.xml`); mark("sitemap unavailable503 instead of success with empty content", result.status === 503 && (await result.text()) === ""); }
    finally { await controlApi("start-api"); }
    mark("sitemap recovers only after actual API restart", (await fetch(`${server.origin}/sitemap.xml`)).status === 200);
  } finally { await server.stop(); }
});
