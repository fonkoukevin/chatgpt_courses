import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/locales";
import { getCmsDictionary } from "@/lib/i18n/cms";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${getCmsDictionary(locale).title} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default function AdminRouteLayout({ children }: { children: ReactNode }) { return children; }
