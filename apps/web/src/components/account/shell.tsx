"use client";
import type { ReactNode } from "react";
import { LearnerLayout } from "@/components/layouts";
import { Link } from "@/components/ui";
import { accountLanguages, accountSectionPath, type AccountSection } from "@/lib/account/routes";
import { getAccountDictionary } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";

export function AccountShell({ locale, section = "home", resourceId, title, description, languageLinks, children }: { locale: Locale; section?: AccountSection; resourceId?: string; title?: string; description?: string; languageLinks?: Record<Locale, string>; children: ReactNode }) {
  const t = getAccountDictionary(locale), labels = { home: t.title, attestations: t.attestations, help: t.help, data: t.data };
  return <LearnerLayout locale={locale} title={title ?? labels[section]} description={description} product={{ active: section === "help" ? "help" : "account", languageLinks: languageLinks ?? accountLanguages(section, resourceId) }}>
    <div className="space-y-8"><nav aria-label={t.navigation} className="flex flex-wrap gap-2 border-b border-border pb-4">{(["home", "attestations", "help", "data"] as const).map(value => <Link key={value} href={accountSectionPath(locale, value)} prefetch={false} variant="nav" aria-current={section === value ? "page" : undefined} className="max-w-full whitespace-normal">{labels[value]}</Link>)}</nav>{children}</div>
  </LearnerLayout>;
}
