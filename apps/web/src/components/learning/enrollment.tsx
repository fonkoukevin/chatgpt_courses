"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, CardContent, CardHeader, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { EnrollmentView } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { getPublicDictionary } from "@/lib/i18n/public";
import { useLearningAccount } from "@/lib/learning/account";
import { learningLanguages, learningPath } from "@/lib/learning/routes";
import { activityDiscoveryHref } from "@/lib/public/routes";
import { AccountNotice, LearningError } from "./parts";
import { LearningShell } from "./shell";
import { attestationsHref } from "@/lib/account/routes";
import { getAccountDictionary } from "@/lib/i18n/account";

export function LearningEnrollment({ locale, initial, expectedAccountId }: { locale: Locale; initial: AuthResult<EnrollmentView>; expectedAccountId: string }) {
  const t = getLearningDictionary(locale), publicCopy = getPublicDictionary(locale), router = useRouter(), [pending, startTransition] = useTransition();
  const enrollmentId = initial.ok ? initial.data.summary.id : undefined, path = learningPath(locale, enrollmentId);
  const { state, boundary } = useLearningAccount(path, expectedAccountId);
  const frame = { locale, title: t.retainedWork, description: t.retainedDescription, languageLinks: learningLanguages(enrollmentId) };
  if (state.status !== "active") return <LearningShell {...frame}><AccountNotice locale={locale} state={state} boundary={boundary} returnTo={path} /></LearningShell>;
  if (!initial.ok) return <LearningShell {...frame}><LearningError locale={locale} error={initial.error} retry={() => startTransition(() => router.refresh())} />{pending && <p role="status">{t.loading}</p>}</LearningShell>;
  const { summary, activities } = initial.data;
  return <LearningShell {...frame}><div className="space-y-8"><Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">← {t.backLearning}</Link>
    <Link href={attestationsHref(locale, { enrollmentId: summary.id })} prefetch={false} className="inline-flex min-h-11 items-center">{getAccountDictionary(locale).attestations}</Link><section className="space-y-4"><h2 className="break-words text-2xl font-semibold">{summary.title}</h2><div className="flex flex-wrap gap-2"><Badge>{t.version} {summary.courseVersionNumber}</Badge><Badge tone={summary.accessStatus === "ACTIVE" ? "success" : "warning"}>{summary.accessStatus === "ACTIVE" ? t.active : summary.accessStatus === "PROTECTED" ? t.protected : t.contentUnavailable}</Badge></div>{summary.availability !== "PUBLISHED" && <StatusMessage tone="warning">{publicCopy[summary.availability]}</StatusMessage>}<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.snapshotNotice}</p></section>
    <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6" data-learning-progress="summary"><h2 className="text-xl font-semibold">{t.progressSummary}</h2><p className="text-sm text-muted-foreground">{summary.progress.totalActivities} {t.denominator}</p><dl className="space-y-3 text-sm">{[
      { label: t.read, count: summary.progress.readActivities }, { label: t.completed, count: summary.progress.completedActivities }, { label: t.quizPassed, count: summary.progress.quizPassedActivities },
    ].map(({ label, count }) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{label}</dt><dd className="font-medium tabular-nums">{count} / {summary.progress.totalActivities}</dd></div>)}</dl><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.distinctEvidence}</p></section>
    <section className="space-y-5"><h2 className="text-2xl font-semibold">{t.programme}</h2>{activities.length === 0 ? <StatusMessage>{t.snapshotEmpty}</StatusMessage> : <ol className="grid gap-4 md:grid-cols-2">{activities.map((activity, index) => <li key={`${activity.moduleVersionId}:${activity.activityVersionId}:${index}`} className="min-w-0"><Card className="h-full"><CardHeader><p className="text-sm text-muted-foreground">{t.activityPosition} {index + 1}</p><h3 className="break-words text-lg font-semibold">{activity.title}</h3><div className="flex flex-wrap gap-2"><Badge tone={activity.accessStatus === "ACTIVE" ? "success" : "warning"}>{activity.accessStatus === "ACTIVE" ? t.active : activity.accessStatus === "PROTECTED" ? t.protected : t.contentUnavailable}</Badge>{activity.availability !== "PUBLISHED" && <Badge tone="warning">{publicCopy[activity.availability]}</Badge>}</div></CardHeader><CardContent className="space-y-4"><ul className="space-y-2 text-sm"><li>{t.read} : {activity.progress.readAt ? t.yes : t.no}</li><li>{t.completed} : {activity.progress.completedAt ? t.yes : t.no}</li></ul><Link href={activityDiscoveryHref(locale, activity.activityId, activity.activityVersionId)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm font-medium">{t.retainedLink}</Link></CardContent></Card></li>)}</ol>}</section>
  </div></LearningShell>;
}
