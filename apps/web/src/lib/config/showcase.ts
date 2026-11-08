import "server-only";
import { notFound } from "next/navigation";
import { getServerConfig } from "@/lib/config/server";
import { isLocale } from "@/lib/i18n/locales";

/** Called by every showcase page as well as its layout: a layout is not an authorization boundary. */
export async function requireShowcase(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { environment } = getServerConfig();
  if (environment !== "local" && environment !== "test") notFound();
  return locale;
}
