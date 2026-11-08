"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Link, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { ResourceDetail } from "@/lib/api/generated/types.gen";
import { enrollCourse, getLearningDashboard } from "@/lib/api/learning-client";
import { getMemberResource } from "@/lib/api/member-content-client";
import { authHref } from "@/lib/auth/routes";
import { offersPath } from "@/lib/commerce/routes";
import { getMemberAccessDictionary } from "@/lib/i18n/member-access";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { programmeActivities } from "@/lib/learning/programme";
import { learningPath } from "@/lib/learning/routes";
import { LearningError } from "./parts";

export function CourseMemberAccess({ locale, course, activityHrefs }: { locale: Locale; course: ResourceDetail; activityHrefs: Record<string, string> }) {
  const t = getMemberAccessDictionary(locale), router = useRouter(), first = useMemo(() => programmeActivities(course.curriculum).find(({ node }) => node.availability === "PUBLISHED" && activityHrefs[node.versionId]), [course.curriculum, activityHrefs]);
  const destination = first ? activityHrefs[first.node.versionId] : learningPath(locale), { state: account, boundary } = useLearningAccount(destination);
  const [access, setAccess] = useState<{ scope: number; available: boolean; enrollmentId: string | null } | null>(null), [error, setError] = useState<ApiError | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (account.status !== "active" || !first) return;
    const scope = boundary.capture(); let active = true;
    void Promise.all([getMemberResource(first.node.resourceId, first.node.versionId, course.locale), getLearningDashboard(course.locale)]).then(([member, dashboard]) => {
      if (!active || !boundary.isCurrent(scope)) return;
      setAccess({ scope, available: member.ok && member.data.availability === "PUBLISHED" && member.data.document !== null, enrollmentId: dashboard.ok ? dashboard.data.enrollments.find((value) => value.courseVersionId === course.versionId)?.id ?? null : null });
      // A denial of member content is a real unavailable access, not a session claim.
      if (!member.ok && member.error.status !== 403) { setError(member.error); boundary.fail(member.error); }
      else if (!dashboard.ok) { setError(dashboard.error); boundary.fail(dashboard.error); }
      else setError(null);
    });
    return () => { active = false; };
  }, [account.status, boundary, course.locale, course.versionId, first]);
  async function start() {
    if (lock.current || account.status !== "active" || !account.accountId || access?.scope !== boundary.capture() || !access.available) return;
    lock.current = true; setBusy(true); setError(null); const scope = boundary.capture();
    try {
      const result = await enrollCourse({ courseResourceId: course.resourceId, courseVersionId: course.versionId, locale: course.locale }, account.accountId);
      if (!boundary.isCurrent(scope)) { setUncertain(true); return; }
      if (!result.ok) { setError(result.error); boundary.fail(result.error); setUncertain(result.error.kind !== "http"); return; }
      router.push(destination);
    } finally { lock.current = false; setBusy(false); }
  }
  if (!first || course.availability !== "PUBLISHED") return null;
  const current = account.status === "active" && access?.scope === boundary.capture() ? access : null;
  return <section className="space-y-4" data-course-member-access><h3 className="text-lg font-semibold">{t.title}</h3>{account.status === "anonymous" ? <Link href={authHref(locale, "sign-in", destination)} prefetch={false} className="inline-flex min-h-11 items-center">{t.signIn}</Link> : account.status === "loading" || account.status === "active" && !current ? <p role="status">{t.checking}</p> : current?.available ? current.enrollmentId ? <Link href={destination} prefetch={false} variant="button" className="max-w-full whitespace-normal">{t.resume}</Link> : <Button busy={busy} loadingLabel={t.starting} className="max-w-full whitespace-normal" onClick={() => void start()}>{t.start}</Button> : <StatusMessage>{t.unavailable}</StatusMessage>}
    {error && <LearningError locale={locale} error={error} retry={() => void boundary.refresh()} />}{uncertain && <StatusMessage tone="warning">{t.pending}</StatusMessage>}<div className="flex flex-wrap gap-3"><Link href={offersPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.offers}</Link>{uncertain && <Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.library}</Link>}</div>
  </section>;
}
