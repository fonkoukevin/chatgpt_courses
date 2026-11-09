import type { ProductAdminLink } from "@/components/layouts/admin-layout";
import type { Locale } from "../i18n/locales";
import { getOperationsDictionary } from "../i18n/operations";
import { getNotificationsDictionary } from "../i18n/notifications";
import { getRefundsDictionary } from "../i18n/refunds";
import { notificationsPath } from "../notifications/routes";
import { adminRefundsPath } from "../refunds/routes";
import { adminOffersPath, operationsPath } from "./routes";
export function operationsNavigation(locale: Locale, permissions: readonly string[]): ProductAdminLink[] {
  const t = getOperationsDictionary(locale);
  const entries: Array<ProductAdminLink & { permission: string }> = [
    { key: "dashboard", label: t.dashboard, href: operationsPath(locale), permission: "operations.read" },
    { key: "orders", label: t.orders, href: operationsPath(locale, "orders"), permission: "commerce.orders.admin.read" },
    { key: "offers", label: t.offers, href: adminOffersPath(locale), permission: "commerce.offers.read" },
    { key: "support", label: t.support, href: operationsPath(locale, "support"), permission: "support.admin.read" },
    { key: "content-cases", label: t.contentCases, href: operationsPath(locale, "content-cases"), permission: "content.cases.read" },
    { key: "incidents", label: t.incidents, href: operationsPath(locale, "incidents"), permission: "operations.incidents.read" },
    { key: "metrics", label: t.metrics, href: operationsPath(locale, "metrics"), permission: "operations.metrics.read" },
    { key: "audit", label: t.audit, href: operationsPath(locale, "audit"), permission: "operations.audit.read" },
    { key: "notifications", label: getNotificationsDictionary(locale).title, href: notificationsPath(locale), permission: "notifications.read" },
    { key: "refunds", label: getRefundsDictionary(locale).operatorTitle, href: adminRefundsPath(locale), permission: "refunds.admin.read" },
  ];
  return entries.filter(entry => permissions.includes(entry.permission)).map(({ key, label, href }) => ({ key, label, href }));
}
