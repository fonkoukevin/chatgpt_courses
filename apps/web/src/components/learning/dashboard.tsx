"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { LearningDashboard as DashboardData } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { getPublicDictionary } from "@/lib/i18n/public";
import { useLearningAccount } from "@/lib/learning/account";
import { learningEnrollmentPath, learningPath } from "@/lib/learning/routes";
import { methodsPath } from "@/lib/methods/routes";
import { projectsPath } from "@/lib/projects/routes";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { catalogueHref, courseActivityHref, publicCatalogueHref, resourceHref } from "@/lib/public/routes";
import { AccountNotice, LearningError, learningDate } from "./parts";
import { LearningShell } from "./shell";
import { RecentProjects } from "./recent-projects";

export function LearningDashboard({ locale, initial, expectedAccountId }: { locale: Locale; initial: AuthResult<DashboardData>; expectedAccountId: string }) {
  const t = getLearningDictionary(locale), publicCopy = getPublicDictionary(locale), router = useRouter(), [pending, startTransition] = useTransition();
  const { state, boundary } = useLearningAccount(learningPath(locale), expectedAccountId);
  if (state.status !== "active") return <LearningShell locale={locale}><AccountNotice locale={locale} state={state} boundary={boundary} returnTo={learningPath(locale)} /></LearningShell>;
  if (!initial.ok) return <LearningShell locale={locale}><LearningError locale={locale} error={initial.error} retry={() => startTransition(() => router.refresh())} />{pending && <p role="status">{t.loading}</p>}</LearningShell>;
  const { resume, enrollments, recentMethods, recentMethodsAvailability } = initial.data;
  return <LearningShell locale={locale}><div className="space-y-10">
    {resume ? <section className="space-y-4 rounded-panel border border-brand/20 bg-brand-soft p-5 sm:p-6"><h2 className="text-2xl font-semibold">{t.resume}</h2><p className="break-words text-lg font-medium">{resume.title}</p><Button asChild><Link href={courseActivityHref(resume.locale, resume.courseSlug, resume.activitySlug, resume.activityId, resume.activityVersionId, resume.courseVersionId)} prefetch={false} className="no-underline">{t.resume}<ArrowRight size={18} aria-hidden="true" /></Link></Button></section>
      : enrollments.length > 0 ? <StatusMessage>{t.noResume}</StatusMessage> : <EmptyState title={t.emptyTitle} description={t.emptyDescription}><div className="flex flex-wrap gap-4"><Link href={catalogueHref(locale, { locale, type: "ACTIVITY", access: "FREE" })}>{t.discover}</Link><Link href={publicCatalogueHref(locale)}>{t.catalogue}</Link></div></EmptyState>}
    {enrollments.length > 0 && <section className="space-y-5"><h2 className="text-2xl font-semibold">{t.courses}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.distinctEvidence}</p><div className="grid gap-4 xl:grid-cols-2">{enrollments.map((enrollment) => <Card key={enrollment.id}><CardHeader><div className="flex flex-wrap gap-2"><Badge>{t.version} {enrollment.courseVersionNumber}</Badge><Badge tone={enrollment.accessStatus === "ACTIVE" ? "success" : "warning"}>{enrollment.accessStatus === "ACTIVE" ? t.active : enrollment.accessStatus === "PROTECTED" ? t.protected : t.contentUnavailable}</Badge></div><h3 className="break-words text-xl font-semibold">{enrollment.title}</h3>{enrollment.availability !== "PUBLISHED" && <p className="text-sm text-warning">{publicCopy[enrollment.availability]}</p>}</CardHeader><CardContent className="space-y-4"><div data-learning-progress="summary" className="space-y-3"><h4 className="text-sm font-semibold">{t.progressSummary}</h4><p className="text-sm text-muted-foreground">{enrollment.progress.totalActivities} {t.denominator}</p><dl className="space-y-2 text-sm">{[
      { label: t.read, count: enrollment.progress.readActivities }, { label: t.completed, count: enrollment.progress.completedActivities }, { label: t.quizPassed, count: enrollment.progress.quizPassedActivities },
    ].map((fact) => <div key={fact.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{fact.label}</dt><dd className="font-medium tabular-nums">{fact.count} / {enrollment.progress.totalActivities}</dd></div>)}</dl></div><p className="text-sm text-muted-foreground">{getProjectsDictionary(locale).stateHelp}</p><Link href={projectsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{getProjectsDictionary(locale).projects}</Link><div className="flex flex-wrap gap-x-5 gap-y-2">{enrollment.courseSlug && enrollment.availability === "PUBLISHED" && <Link href={resourceHref({ kind: "COURSE", locale, slug: enrollment.courseSlug, resourceId: enrollment.courseResourceId, versionId: enrollment.courseVersionId })} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{publicCopy.open}</Link>}<Link href={learningEnrollmentPath(locale, enrollment.id)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.retainedWork}</Link></div></CardContent></Card>)}</div><p className="text-sm text-muted-foreground">{t.recentCourses}</p></section>}
    <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{t.recentMethods}</h2>{recentMethodsAvailability === "AVAILABLE" && <Link href={methodsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.allMethods}</Link>}</div>{recentMethodsAvailability !== "AVAILABLE" ? <StatusMessage>{t.methodsForbidden}</StatusMessage> : recentMethods.length === 0 ? <p className="text-sm text-muted-foreground">{t.noMethods}</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recentMethods.map((method) => <Card key={method.id}><CardHeader><div className="flex flex-wrap gap-2"><Badge>{method.locale.toUpperCase()}</Badge>{method.category && <Badge>{method.category}</Badge>}</div><h3 className="break-words text-lg font-semibold"><Link href={methodsPath(locale, method.id)} prefetch={false}>{method.title}</Link></h3></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t.updated} {learningDate(method.updatedAt, locale)}</p></CardContent></Card>)}</div>}</section>
    <RecentProjects locale={locale} account={state} boundary={boundary} />
  </div></LearningShell>;
}
