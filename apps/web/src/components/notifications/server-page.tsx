import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readNotifications } from "@/lib/api/notifications-server";
import { authHref } from "@/lib/auth/routes";
import { getNotificationsDictionary } from "@/lib/i18n/notifications";
import { isLocale } from "@/lib/i18n/locales";
import { notificationsHref, notificationsPath, safeNotificationsDestination, type NotificationListQuery } from "@/lib/notifications/routes";
import { NotificationsPage, NotificationsShell } from "./page";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function notificationsMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return { title: `${getNotificationsDictionary(locale).title} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export async function NotificationsServerPage({ params, searchParams }: Props) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  const t = getNotificationsDictionary(locale), input = await searchParams;
  const raw = new URLSearchParams(); for (const [key, value] of Object.entries(input)) { if (Array.isArray(value)) notFound(); if (value !== undefined) raw.set(key, value); }
  const valid = safeNotificationsDestination(notificationsPath(locale) + (raw.size ? `?${raw}` : ""), locale);
  const query: NotificationListQuery = { status: (raw.get("status") || undefined) as NotificationListQuery["status"], page: Number(raw.get("page") ?? 0), pageSize: Number(raw.get("pageSize") ?? 20) };
  const user = await readCurrentUser();
  if (!user.ok && user.error.kind === "http" && user.error.status === 401) redirect(authHref(locale, "sign-in", valid ? notificationsHref(locale, query) : notificationsPath(locale), "required"));
  if (!user.ok) return <NotificationsShell locale={locale}><StatusMessage tone="danger">{t.unavailable}</StatusMessage></NotificationsShell>;
  if (!user.data.permissions.includes("notifications.read")) return <NotificationsShell locale={locale}><StatusMessage tone="danger">{t.forbidden}</StatusMessage></NotificationsShell>;
  if (!valid) return <NotificationsShell locale={locale}><StatusMessage tone="danger">{t.invalidFilters}</StatusMessage><Link href={notificationsPath(locale)} prefetch={false}>{t.clear}</Link></NotificationsShell>;
  return <NotificationsPage key={`${user.data.id}:${valid}`} locale={locale} initial={await readNotifications(query)} query={query} expectedAccountId={user.data.id} permissions={user.data.permissions} />;
}
