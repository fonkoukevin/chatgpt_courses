import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readLearningDashboard, readEnrollment } from "@/lib/api/learning-server";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { getLearningDictionary } from "@/lib/i18n/learning";
import type { Locale } from "@/lib/i18n/locales";
import { learningPath, learningEnrollmentPath } from "@/lib/learning/routes";
import { LearningDashboard } from "./dashboard";
import { LearningShell } from "./shell";
import { LearningEnrollment } from "./enrollment";

export function learningMetadata(locale: Locale): Metadata {
  return { title: `${getLearningDictionary(locale).dashboardTitle} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export function learningDashboardPage(expected: Locale) {
  return async function Page({ params }: { params: Promise<{ locale: string }> }) {
    if ((await params).locale !== expected) notFound();
    const user = await readCurrentUser();
    if (!user.ok && user.error.kind === "http" && user.error.status === 401) redirect(authHref(expected, "sign-in", learningPath(expected), "required"));
    if (!user.ok) {
      const t = getLearningDictionary(expected);
      return <LearningShell locale={expected}><StatusMessage tone="danger">{t.unavailable}</StatusMessage><Link href={learningPath(expected)} prefetch={false} className="mt-4 inline-flex min-h-11 items-center">{t.retry}</Link></LearningShell>;
    }
    return <LearningDashboard key={user.data.id} locale={expected} initial={await readLearningDashboard(expected)} expectedAccountId={user.data.id} />;
  };
}
export const learningEnrollmentMetadata = learningMetadata;
export function learningEnrollmentPage(expected: Locale) {
  return async function Page({ params }: { params: Promise<{ locale: string; enrollmentId: string }> }) {
    const route = await params;
    if (route.locale !== expected || !isUuid(route.enrollmentId)) notFound();
    const user = await readCurrentUser();
    if (!user.ok && user.error.kind === "http" && user.error.status === 401) redirect(authHref(expected, "sign-in", learningEnrollmentPath(expected, route.enrollmentId), "required"));
    if (!user.ok) {
      const t = getLearningDictionary(expected);
      return <LearningShell locale={expected}><StatusMessage tone="danger">{t.unavailable}</StatusMessage><Link href={learningEnrollmentPath(expected, route.enrollmentId)} prefetch={false} className="mt-4 inline-flex min-h-11 items-center">{t.retry}</Link></LearningShell>;
    }
    const initial = await readEnrollment(route.enrollmentId, expected);
    if (!initial.ok && initial.error.kind === "http" && initial.error.status === 404) notFound();
    return <LearningEnrollment key={`${user.data.id}:${route.enrollmentId}`} locale={expected} initial={initial} expectedAccountId={user.data.id} />;
  };
}
