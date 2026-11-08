import type { Locale } from "../i18n/locales";

export function learningPath(locale: Locale, enrollmentId?: string): string {
  const path = locale === "fr" ? "/fr/espace/apprentissage" : "/en/my/learning";
  if (enrollmentId === undefined) return path;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId)) throw new Error("Invalid learning enrollment identifier.");
  return `${path}/${enrollmentId}`;
}

export function learningLanguages(enrollmentId?: string): Record<Locale, string> {
  return { fr: learningPath("fr", enrollmentId), en: learningPath("en", enrollmentId) };
}

export function learningEnrollmentPath(locale: Locale, enrollmentId: string): string {
  return learningPath(locale, enrollmentId);
}

export function learningEnrollmentLanguages(enrollmentId: string): Record<Locale, string> {
  return learningLanguages(enrollmentId);
}
