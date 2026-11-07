import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/locales";
import "../globals.css";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { robots: { index: false, follow: false } };
  const dictionary = getDictionary(locale);
  return {
    title: dictionary.pageTitle,
    description: dictionary.description,
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <RootDocument locale={locale}>{children}</RootDocument>;
}
