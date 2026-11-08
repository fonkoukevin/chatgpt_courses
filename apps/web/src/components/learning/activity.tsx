"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, ConfirmationDialog, StatusMessage } from "@/components/ui";
import { AvailabilityNotice, BackToCatalogue, DetailHeading, PublicApiError, PublicShell, TranslationAvailability, type DetailProps } from "@/components/public/parts";
import { PublicDocumentBody, ResourceTools } from "@/components/public/document";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { enrollCourse, getLearningActivity, getLearningDashboard, visitActivity } from "@/lib/api/learning-client";
import type { LearningActivity as ActivityData, PublicDocument, ResourceDetail } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { getPublicDictionary } from "@/lib/i18n/public";
import { useLearningAccount } from "@/lib/learning/account";
import { activityDiscoveryHref } from "@/lib/public/routes";
import { safeCatalogueReturnTo } from "@/lib/public/query";
import { ActivityNotes } from "./notes";
import { AccountNotice, LearningError } from "./parts";
import { ActivityNavigation, ActivityProgramme, type ActivityProgrammeContext } from "./programme";
import { ActivityProgress } from "./progress";
import { ActivityQuiz, QuizHistory } from "./quiz";
import { StartProjectAction } from "@/components/projects/preparation";

export type LearningActivityProps = DetailProps & { programme?: ActivityProgrammeContext };

function Practice({ locale, document }: { locale: Locale; document: PublicDocument }) {
  const t = getLearningDictionary(locale), id = useId(), [checked, setChecked] = useState<string[]>([]);
  return <div className="space-y-8"><section className="space-y-4 rounded-panel border border-brand/20 bg-brand-soft p-5 sm:p-6"><h2 className="text-2xl font-semibold">{t.practice}</h2><p className="whitespace-pre-wrap break-words leading-relaxed">{document.exerciseInstructions || t.noExercise}</p></section>
    {document.rubric.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.checklist}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.checklistNotice}</p><div className="space-y-3">{document.rubric.map((criterion, index) => <Checkbox key={criterion.key} id={`${id}-criterion-${index}`} label={criterion.label} checked={checked.includes(criterion.key)} onCheckedChange={(value) => setChecked((current) => value ? [...current, criterion.key] : current.filter((key) => key !== criterion.key))} />)}</div></section>}
  </div>;
}

function ActivityContent({ locale, resource, languageLinks, returnTo, programme }: Omit<LearningActivityProps, "result"> & { resource: ResourceDetail }) {
  const t = getLearningDictionary(locale), publicCopy = getPublicDictionary(locale);
  const selfHref = programme?.activityHrefs[resource.versionId] ?? activityDiscoveryHref(resource.locale, resource.resourceId, resource.versionId, safeCatalogueReturnTo(returnTo, resource.locale));
  const { state: account, boundary } = useLearningAccount(selfHref);
  const [privateActivity, setPrivateActivity] = useState<AuthResult<ActivityData> | null>(null), [lookupDone, setLookupDone] = useState(!programme), [lookupError, setLookupError] = useState<ApiError | null>(null);
  const [enrolling, setEnrolling] = useState(false), [enrolled, setEnrolled] = useState(false), [unconfirmed, setUnconfirmed] = useState(false), [visitError, setVisitError] = useState<ApiError | null>(null), [historyRefresh, setHistoryRefresh] = useState(0);
  const request = useRef(0), lock = useRef(false), visited = useRef("");
  const acceptActivity = useCallback((result: AuthResult<ActivityData>) => {
    if (result.ok && (result.data.activityId !== resource.resourceId || result.data.activityVersionId !== resource.versionId)) setPrivateActivity({ ok: false, error: { kind: "invalid-response", status: 200 } });
    else setPrivateActivity(result);
    setLookupDone(true); if (!result.ok) boundary.fail(result.error);
  }, [resource.resourceId, resource.versionId, boundary]);
  useEffect(() => {
    if (account.status !== "active" || !programme) return;
    const scope = boundary.capture(), sequence = ++request.current; let active = true;
    void getLearningDashboard(resource.locale).then(async (dashboard) => {
      if (!active || !boundary.isCurrent(scope) || sequence !== request.current) return;
      if (!dashboard.ok) { setLookupError(dashboard.error); setLookupDone(true); boundary.fail(dashboard.error); return; }
      const enrollment = dashboard.data.enrollments.find((item) => item.courseVersionId === programme.course.versionId);
      if (!enrollment) { setLookupDone(true); setPrivateActivity(null); setLookupError(null); return; }
      const result = await getLearningActivity(enrollment.id, resource.resourceId, resource.versionId, resource.locale);
      if (active && boundary.isCurrent(scope) && sequence === request.current) { acceptActivity(result); setLookupError(null); }
    });
    return () => { active = false; };
  }, [account.status, boundary, programme, resource.locale, resource.resourceId, resource.versionId, acceptActivity]);
  const activity = privateActivity?.ok ? privateActivity.data : null;
  const contextBlocked = Boolean(activity && (activity.accessStatus !== "ACTIVE" || activity.availability !== "PUBLISHED"));
  const publicAvailable = resource.availability === "PUBLISHED" && resource.access === "FREE" && resource.document !== null;
  const contentAvailable = publicAvailable && !contextBlocked;
  const revisionChanged = Boolean(activity && activity.resource.revisionId !== resource.revisionId);
  const enrolledAvailable = Boolean(activity && !contextBlocked);
  const recordVisit = useCallback(async (value: ActivityData) => {
    if (account.status !== "active" || !account.accountId || value.accessStatus !== "ACTIVE" || value.availability !== "PUBLISHED") return;
    const scope = boundary.capture();
    const result = await visitActivity(value.enrollmentId, { activityId: resource.resourceId, activityVersionId: resource.versionId, locale: resource.locale }, account.accountId);
    if (boundary.isCurrent(scope)) { setVisitError(result.ok ? null : result.error); if (!result.ok) boundary.fail(result.error); }
  }, [account.status, account.accountId, boundary, resource.resourceId, resource.versionId, resource.locale]);
  useEffect(() => {
    if (!activity || account.status !== "active" || activity.accessStatus !== "ACTIVE" || activity.availability !== "PUBLISHED") return;
    const key = `${activity.enrollmentId}:${activity.activityVersionId}:${boundary.capture()}`;
    if (visited.current === key) return;
    visited.current = key; void recordVisit(activity);
  }, [activity, account.status, boundary, recordVisit]);
  async function refreshActivity() {
    if (!activity || account.status !== "active") return;
    const scope = boundary.capture(), sequence = ++request.current;
    const result = await getLearningActivity(activity.enrollmentId, resource.resourceId, resource.versionId, resource.locale);
    if (boundary.isCurrent(scope) && sequence === request.current) acceptActivity(result);
  }
  async function retryLookup() {
    if (!programme || account.status !== "active" || lock.current) return;
    const scope = boundary.capture(), sequence = ++request.current;
    const dashboard = await getLearningDashboard(resource.locale);
    if (!boundary.isCurrent(scope) || sequence !== request.current) return;
    if (!dashboard.ok) { setLookupError(dashboard.error); boundary.fail(dashboard.error); return; }
    const enrollment = dashboard.data.enrollments.find((item) => item.courseVersionId === programme.course.versionId);
    setLookupError(null); if (!enrollment) { setLookupDone(true); return; }
    const result = await getLearningActivity(enrollment.id, resource.resourceId, resource.versionId, resource.locale);
    if (boundary.isCurrent(scope) && sequence === request.current) acceptActivity(result);
  }
  async function enroll() {
    if (!programme || !account.accountId || account.status !== "active" || lock.current) return;
    lock.current = true; setEnrolling(true); setLookupError(null); setUnconfirmed(false); const scope = boundary.capture(), sequence = ++request.current;
    try {
      const result = await enrollCourse({ courseResourceId: programme.course.resourceId, courseVersionId: programme.course.versionId, locale: resource.locale }, account.accountId);
      if (!boundary.isCurrent(scope) || sequence !== request.current) { setUnconfirmed(true); return; }
      if (!result.ok) { setLookupError(result.error); boundary.fail(result.error); return; }
      setEnrolled(true);
      const detail = await getLearningActivity(result.data.summary.id, resource.resourceId, resource.versionId, resource.locale);
      if (boundary.isCurrent(scope) && sequence === request.current) acceptActivity(detail);
    } finally { lock.current = false; setEnrolling(false); }
  }
  return <div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} />
    {resource.availability !== "PUBLISHED" ? <AvailabilityNotice locale={locale} resource={resource} /> : <DetailHeading locale={locale} resource={resource} />}
    <TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} />
    <div className={`grid items-start gap-8 ${programme ? "lg:grid-cols-[260px_minmax(0,1fr)]" : ""}`}>
      {programme && <ActivityProgramme locale={locale} programme={programme} currentVersionId={resource.versionId} />}
      <div className="min-w-0 max-w-3xl space-y-8">
        {contextBlocked && <StatusMessage tone="warning">{activity?.accessStatus === "PROTECTED" ? t.protected : activity?.availability === "MISSING_TRANSLATION" ? t.translationMissing : t.contentUnavailable}</StatusMessage>}
        {revisionChanged && <div className="space-y-3"><StatusMessage tone="warning">{t.quizVersionChanged}</StatusMessage><ConfirmationDialog title={t.reloadActivity} description={t.reloadActivityDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.reloadActivity}</Button>} onConfirm={() => window.location.reload()} /></div>}
        {contentAvailable && resource.document ? <>
          <section className="space-y-3"><h2 className="text-2xl font-semibold">{t.objective}</h2><p className="whitespace-pre-wrap break-words leading-relaxed">{resource.document.objective}</p><h3 className="pt-2 text-lg font-semibold">{t.expectedResult}</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{resource.document.expectedResult}</p>{resource.document.prerequisites.length > 0 && <><h3 className="pt-2 text-lg font-semibold">{t.prerequisites}</h3><ul className="list-disc space-y-2 pl-5">{resource.document.prerequisites.map((item, index) => <li key={index} className="break-words text-sm leading-relaxed">{item}</li>)}</ul></>}</section>
          {resource.document.media.length === 0 && <p className="text-sm leading-relaxed text-muted-foreground">{t.noVideo}</p>}<PublicDocumentBody locale={locale} document={resource.document} prefix="activity" />
          <Practice key={`practice:${resource.versionId}:${resource.locale}`} locale={locale} document={resource.document} />
        </> : resource.availability === "PUBLISHED" && !contextBlocked && <StatusMessage>{resource.access === "PROTECTED" ? publicCopy.protectedBody : publicCopy.missingInfo}</StatusMessage>}
        <AccountNotice locale={locale} state={account} boundary={boundary} returnTo={selfHref} />
        {account.status === "active" && programme && (!lookupDone ? <p role="status">{t.loading}</p> : <div className="space-y-4">{lookupError && <LearningError locale={locale} error={lookupError} retry={() => void retryLookup()} />}{privateActivity && !privateActivity.ok && <LearningError locale={locale} error={privateActivity.error} retry={() => void retryLookup()} />}{!activity && !lookupError && !privateActivity && contentAvailable && <Button busy={enrolling} loadingLabel={t.startingCourse} onClick={() => void enroll()}>{t.startCourse}</Button>}{enrolled && <StatusMessage tone="success">{t.enrolled}</StatusMessage>}</div>)}
        {unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}{visitError && <LearningError locale={locale} error={visitError} retry={activity ? () => void recordVisit(activity) : undefined} />}
        {activity && <ActivityProgress key={`progress:${activity.progress.id}`} locale={locale} contentLocale={resource.locale} initial={activity.progress} account={account} boundary={boundary} available={enrolledAvailable} />}
        {contentAvailable && resource.document?.projectPolicy && !revisionChanged && !enrolling && !(programme && account.status === "active" && !lookupDone) && <StartProjectAction key={`project:${resource.versionId}:${resource.locale}`} locale={locale} source={resource} account={account} boundary={boundary} enrollmentId={activity?.enrollmentId} />}
        {publicAvailable && <ActivityQuiz key={`quiz:${resource.versionId}:${resource.locale}`} locale={locale} resource={resource} account={account} boundary={boundary} enrollmentId={activity?.enrollmentId} overview={activity?.quiz} available={contentAvailable && !revisionChanged && (!activity || enrolledAvailable) && !enrolling && !(programme && account.status === "active" && !lookupDone)} onAttempt={() => { setHistoryRefresh((value) => value + 1); void refreshActivity(); }} />}
        {account.accountId && <ActivityNotes key={`notes:${account.accountId}:${resource.versionId}`} locale={locale} contentLocale={resource.locale} activityId={resource.resourceId} activityVersionId={resource.versionId} account={account} boundary={boundary} canCreate={contentAvailable} />}
        {account.accountId && <QuizHistory key={`history:${account.accountId}:${resource.versionId}`} locale={locale} activityVersionId={resource.versionId} account={account} boundary={boundary} refresh={historyRefresh} />}
        {contentAvailable && <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.resources}</h2><ResourceTools key={resource.revisionId} locale={locale} resource={resource} /></section>}
        {programme && <ActivityNavigation locale={locale} programme={programme} currentVersionId={resource.versionId} />}
      </div>
    </div>
  </div>;
}

export function LearningActivity({ locale, result, languageLinks, returnTo, programme }: LearningActivityProps) {
  if (result.ok && result.data.kind !== "ACTIVITY") return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} /><AvailabilityNotice locale={locale} resource={result.data} /><TranslationAvailability locale={locale} resource={result.data} languageLinks={languageLinks} /></div></PublicShell>;
  return <PublicShell locale={locale} languageLinks={languageLinks}>{!result.ok ? <div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} /><PublicApiError locale={locale} result={result} standalone /></div> : <ActivityContent key={`${result.data.resourceId}:${result.data.versionId}:${result.data.locale}`} locale={locale} resource={result.data} languageLinks={languageLinks} returnTo={returnTo} programme={programme} />}</PublicShell>;
}
