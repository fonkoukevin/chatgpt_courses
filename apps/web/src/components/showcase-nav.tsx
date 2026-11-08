"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getGalleryCopy } from "@/lib/i18n/gallery";
import type { Locale } from "@/lib/i18n/locales";

export function ShowcaseNav({ locale }: { locale: Locale }) {
  const copy = getGalleryCopy(locale);
  const pathname = usePathname();
  return (
    <aside className="border-b border-border bg-surface-subtle px-4 py-3 text-sm">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 font-semibold text-brand"><FlaskConical size={18} aria-hidden="true" />{copy.environment}</span>
        <nav aria-label={copy.nav} className="flex flex-wrap gap-1">
          {(Object.keys(copy.links) as Array<keyof typeof copy.links>).map((route) => {
            const href = `/${locale}/dev/${route}`;
            const active = pathname === href;
            return <Link key={route} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-input px-3 no-underline ${active ? "bg-brand-soft font-semibold text-brand" : "text-muted-foreground hover:bg-surface-hover"}`}>{copy.links[route]}</Link>;
          })}
        </nav>
        <Link href={`/${locale}/dev/foundations`} className="inline-flex min-h-11 items-center text-link underline lg:ml-auto">{copy.foundations}</Link>
      </div>
      <p className="mx-auto mt-1 max-w-[var(--content-max)] text-[0.8125rem] text-muted-foreground">{copy.disclaimer}</p>
    </aside>
  );
}
