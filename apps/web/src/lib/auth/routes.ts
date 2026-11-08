import type { Locale } from "../i18n/locales";
import { safeMethodsDestination, translateMethodsDestination } from "../methods/routes";
import { safeLearningDestination, translateLearningDestination } from "../learning/destination";

export type AuthScreen = "sign-in" | "sign-up" | "recover" | "reset" | "account";
const paths = {
  fr: { "sign-in": "connexion", "sign-up": "inscription", recover: "recuperation", reset: "reinitialisation", account: "compte" },
  en: { "sign-in": "sign-in", "sign-up": "sign-up", recover: "reset", reset: "reset-password", account: "account" },
} as const;

export function authPath(locale: Locale, screen: AuthScreen): string {
  return `/${locale}/${paths[locale][screen]}`;
}

export function safeReturnTo(value: unknown, locale: Locale): string {
  const learning = safeLearningDestination(value, locale);
  if (learning) return learning;
  const method = safeMethodsDestination(value, locale);
  if (method) return method;
  const fallback = authPath(locale, "account");
  if (typeof value !== "string" || value.length > 200 || /[%\\?#\s]/.test(value)) return fallback;
  const allowed = new Set([
    `/${locale}`, fallback,
    ...["public", "learning", "admin", "components"].map((space) => `/${locale}/dev/${space}`),
  ]);
  const cms = new RegExp(`^/${locale}/admin/content(?:/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(?:edit|preview))?$`);
  return allowed.has(value) || cms.test(value) ? value : fallback;
}

export function translateReturnTo(value: unknown, locale: Locale): string {
  const learning = translateLearningDestination(value, locale);
  if (learning) return learning;
  const method = translateMethodsDestination(value, locale);
  if (method) return method;
  if (typeof value !== "string") return authPath(locale, "account");
  const source: Locale = value.startsWith("/fr/") || value === "/fr" ? "fr" : "en";
  const validated = safeReturnTo(value, source);
  if (validated === authPath(source, "account")) return authPath(locale, "account");
  return safeReturnTo(validated.replace(/^\/(fr|en)(?=\/|$)/, `/${locale}`), locale);
}

export function authHref(locale: Locale, screen: AuthScreen, returnTo?: unknown, notice?: "registered" | "reset" | "logged-out" | "required"): string {
  const query = new URLSearchParams();
  const destination = safeReturnTo(returnTo, locale);
  if (destination !== authPath(locale, "account")) query.set("returnTo", destination);
  if (notice) query.set("notice", notice);
  return `${authPath(locale, screen)}${query.size ? `?${query}` : ""}`;
}
