"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Link, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { ResourceDetail } from "@/lib/api/generated/types.gen";
import { enrollCourse, getLearningDashboard } from "@/lib/api/learning-client";
import { getMemberResource } from "@/lib/api/member-content-client";
import { authHref } from "@/lib/auth/routes";
import { getMemberAccessDictionary } from "@/lib/i18n/member-access";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { programmeActivities } from "@/lib/learning/programme";
import { learningPath } from "@/lib/learning/routes";
import { entitlementsPath } from "@/lib/refunds/routes";
import { AccountNotice, LearningError } from "./parts";

type AccessCheck = {
  scope: number;
  target: string;
  available: boolean;
  enrollmentId: string | null;
  resumeHref: string | null;
  error: ApiError | null;
};
type StartFailure = { scope: number; target: string; error: ApiError; uncertain: boolean };

export function CourseMemberAccess({ locale, course, activityHrefs }: { locale: Locale; course: ResourceDetail; activityHrefs: Record<string, string> }) {
  const t = getMemberAccessDictionary(locale), router = useRouter(), first = useMemo(() => programmeActivities(course.curriculum).find(({ node }) => node.availability === "PUBLISHED" && activityHrefs[node.versionId]), [course.curriculum, activityHrefs]);
  const destination = first ? activityHrefs[first.node.versionId] : learningPath(locale), { state: account, boundary } = useLearningAccount(destination);
  const target = `${course.resourceId}:${course.versionId}:${course.locale}`;
  const [access, setAccess] = useState<AccessCheck | null>(null), [failure, setFailure] = useState<StartFailure | null>(null), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (account.status !== "active" || !first) return;
    const scope = boundary.capture(); let active = true;
    // A free preview does not establish access to its protected course.
    void Promise.all([getMemberResource(course.resourceId, course.versionId, course.locale), getLearningDashboard(course.locale)]).then(([member, dashboard]) => {
      if (!active || !boundary.isCurrent(scope)) return;
      const error = !member.ok && member.error.status !== 403 ? member.error : !dashboard.ok ? dashboard.error : null;
      const enrollment = dashboard.ok ? dashboard.data.enrollments.find((value) => value.courseResourceId === course.resourceId && value.courseVersionId === course.versionId) : undefined;
      const resume = dashboard.ok ? dashboard.data.resume : null;
      const matchingResume = enrollment && resume?.enrollmentId === enrollment.id && resume.courseResourceId === course.resourceId && resume.courseVersionId === course.versionId && resume.locale === course.locale;
      setAccess({
        scope, target,
        available: !error && member.ok && member.data.availability === "PUBLISHED" && member.data.document !== null && (!enrollment || enrollment.accessStatus === "ACTIVE" && enrollment.availability === "PUBLISHED"),
        enrollmentId: enrollment?.id ?? null,
        resumeHref: enrollment ? matchingResume && activityHrefs[resume.activityVersionId] || learningPath(locale, enrollment.id) : null,
        error,
      });
      // A denied course read is an access result; other failures must not enable enrollment.
      if (error) boundary.fail(error);
    });
    return () => { active = false; };
  }, [account.status, activityHrefs, boundary, course.locale, course.resourceId, course.versionId, first, locale, target]);
  const current = account.status === "active" && access?.scope === boundary.capture() && access.target === target ? access : null;
  const currentFailure = account.status === "active" && failure?.scope === boundary.capture() && failure.target === target ? failure : null;
  const error = currentFailure?.error ?? current?.error, uncertain = currentFailure?.uncertain ?? false;
  async function start() {
    if (lock.current || account.status !== "active" || !account.accountId || !current?.available || error) return;
    lock.current = true; setBusy(true); setFailure(null); const scope = boundary.capture();
    try {
      const result = await enrollCourse({ courseResourceId: course.resourceId, courseVersionId: course.versionId, locale: course.locale }, account.accountId);
      if (!boundary.isCurrent(scope)) return;
      if (!result.ok) { setFailure({ scope, target, error: result.error, uncertain: result.error.kind !== "http" }); boundary.fail(result.error); return; }
      router.push(destination);
    } finally { lock.current = false; setBusy(false); }
  }
  if (!first || course.availability !== "PUBLISHED") return null;
  return <section className="space-y-4" data-course-member-access><h3 className="text-lg font-semibold">{t.title}</h3>{account.status === "anonymous" ? <Link href={authHref(locale, "sign-in", destination)} prefetch={false} className="inline-flex min-h-11 items-center">{t.signIn}</Link> : account.status === "loading" || account.status === "active" && !current ? <p role="status">{t.checking}</p> : account.status !== "active" ? <AccountNotice locale={locale} state={account} boundary={boundary} returnTo={destination} /> : error ? null : current?.available ? current.enrollmentId ? <Link href={current.resumeHref!} prefetch={false} variant="button" className="max-w-full whitespace-normal">{t.resume}</Link> : <Button busy={busy} loadingLabel={t.starting} className="max-w-full whitespace-normal" onClick={() => void start()}>{t.start}</Button> : <><StatusMessage>{t.unavailable}</StatusMessage><Link href={entitlementsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.access}</Link></>}
    {error && <LearningError locale={locale} error={error} retry={() => void boundary.refresh()} />}{uncertain && <><StatusMessage tone="warning">{t.pending}</StatusMessage><Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.library}</Link></>}
  </section>;
}
