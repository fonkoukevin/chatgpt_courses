import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";
import { getPublicPageDictionary } from "@/lib/i18n/public-pages";
import { isLocale } from "@/lib/i18n/locales";
import { getServerConfig } from "@/lib/config/server";
import { localeIsIndexable } from "@/lib/public/seo-policy";
import { readCatalogueFacets } from "@/lib/api/public-server";
import { readOffers } from "@/lib/api/commerce-server";
import { publicNavigationAvailability } from "@/lib/public/navigation";
import { PublicNavigationProvider } from "@/components/layouts/public-navigation";
import "../globals.css";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { robots: { index: false, follow: false } };
  const dictionary = getPublicPageDictionary(locale);
  const index = localeIsIndexable(getServerConfig(), locale);
  return {
    title: dictionary.brand,
    description: dictionary.homeDescription,
    robots: { index, follow: index },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [facets, offers] = await Promise.all([readCatalogueFacets(locale), readOffers(locale, 0, 1)]);
  return <RootDocument locale={locale}><PublicNavigationProvider value={publicNavigationAvailability(facets, offers)}>{children}</PublicNavigationProvider></RootDocument>;
}
