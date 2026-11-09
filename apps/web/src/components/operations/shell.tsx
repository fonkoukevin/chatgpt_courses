"use client";
import type { ReactNode } from "react";
import { AdminLayout, type ProductAdminLink, type ProductAdminPage } from "@/components/layouts/admin-layout";
import { accountPath } from "@/lib/account/routes";
import { cmsPath } from "@/lib/cms/routes";
import { getOperationsDictionary } from "@/lib/i18n/operations";
import type { Locale } from "@/lib/i18n/locales";
import { adminOffersLanguages, operationsLanguages, type OperationsSection } from "@/lib/operations/routes";
import { operationsNavigation } from "@/lib/operations/navigation";

export function OperationsShell({ locale, section = "dashboard", resourceId, title, description, navigation, permissions = [], languageLinks, children }: {
  locale: Locale; section?: OperationsSection | "offers"; resourceId?: string; title?: string; description?: string;
  navigation?: ProductAdminLink[]; permissions?: readonly string[]; languageLinks?: Record<Locale, string>; children: ReactNode;
}) {
  const t = getOperationsDictionary(locale), labels: Record<OperationsSection | "offers", string> = { dashboard: t.dashboard, orders: t.orders, offers: t.offers, support: t.support, "content-cases": t.contentCases, metrics: t.metrics, audit: t.audit, incidents: t.incidents };
  return <AdminLayout locale={locale} title={title ?? labels[section]} description={description ?? t.description} product={{ contentHref: cmsPath(locale), accountHref: accountPath(locale), languageHrefs: languageLinks ?? (section === "offers" ? adminOffersLanguages(resourceId) : operationsLanguages(section, resourceId)), navigationDescription: t.navigation, current: labels[section], active: section as ProductAdminPage, additionalLinks: navigation ?? operationsNavigation(locale, permissions) }}>{children}</AdminLayout>;
}
