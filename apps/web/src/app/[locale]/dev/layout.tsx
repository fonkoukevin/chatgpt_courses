import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ShowcaseNav } from "@/components/showcase-nav";
import { requireShowcase } from "@/lib/config/showcase";
import { getGalleryCopy } from "@/lib/i18n/gallery";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ShowcaseLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await requireShowcase(params);
  return <div className="showcase"><ShowcaseNav locale={locale} />{children}</div>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await requireShowcase(params);
  return { title: `${getGalleryCopy(locale).environment} · ChatGPT Courses`, robots: { index: false, follow: false } };
}
