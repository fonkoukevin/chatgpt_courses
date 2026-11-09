import "server-only";
import type { Metadata } from "next";
import { getServerConfig } from "../config/server";
import type { Locale } from "../i18n/locales";
import { absolutePublicUrl, localeIsIndexable } from "./seo-policy";
import type { LanguageLinks } from "./routes";

export function publicMetadata(locale: Locale, title: string, description: string, path: string, languages?: LanguageLinks, published = true): Metadata {
  const config = getServerConfig();
  const canonical = absolutePublicUrl(path, config.publicOrigin);
  const index = published && localeIsIndexable(config, locale);
  const equivalents = index && languages ? Object.fromEntries(Object.entries(languages)
    .filter(([language, link]) => link.available && localeIsIndexable(config, language as Locale))
    .map(([language, link]) => [language, absolutePublicUrl(link.href, config.publicOrigin)])) : undefined;
  return {
    title: `${title} | ChatGPT Courses`, description, metadataBase: new URL(config.publicOrigin),
    alternates: { canonical, languages: equivalents }, robots: { index, follow: index },
    openGraph: { type: "website", title, description, url: canonical, siteName: "ChatGPT Courses" },
    twitter: { card: "summary", title, description },
  };
}
