"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, ConfirmationDialog, Link, StatusMessage } from "@/components/ui";
import { AvailabilityNotice, BackToCatalogue, PublicApiError, PublicShell, TranslationAvailability, type DetailProps } from "@/components/public/parts";
import { PublicDocumentBody, ResourceTools } from "@/components/public/document";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { getMemberResource } from "@/lib/api/member-content-client";
import { enrollCourse, getLearningActivity, getLearningDashboard, visitActivity } from "@/lib/api/learning-client";
import type { LearningActivity as ActivityData, PublicDocument, ResourceDetail } from "@/lib/api/generated/types.gen";
import { localeName, type Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { getPublicDictionary } from "@/lib/i18n/public";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { getWorkshopDictionary } from "@/lib/i18n/workshop";
import { projectCategories, projectCriterionKeys } from "@/lib/projects/schema";
import { useLearningAccount } from "@/lib/learning/account";
import { activityDiscoveryHref } from "@/lib/public/routes";
import { safeCatalogueReturnTo } from "@/lib/public/query";
import { ActivityNotes } from "./notes";
import { AccountNotice, LearningError } from "./parts";
import { ActivityNavigation, ActivityProgramme, type ActivityProgrammeContext } from "./programme";
import { ActivityProgress } from "./progress";
import { ActivityQuiz, QuizHistory } from "./quiz";
import { StartProjectAction } from "@/components/projects/preparation";
import { LearningMedia } from "./media";
import { ActivityPracticeDraft } from "./practice-draft";

export type LearningActivityProps = DetailProps & { programme?: ActivityProgrammeContext };

function Practice({ locale, contentLocale, document }: { locale: Locale; contentLocale: Locale; document: PublicDocument }) {
  const t = getLearningDictionary(locale), projects = getProjectsDictionary(locale), workshop = getWorkshopDictionary(locale);
  const id = useId(), [checked, setChecked] = useState<string[]>([]);
  const categoryLabels = { fidelity: projects.categoryFidelity, scope: projects.categoryScope, budget: projects.categoryBudget, schedule: projects.categorySchedule, presentation: projects.categoryPresentation };
  const criteria = document.rubric.map((criterion, index) => ({ criterion, index, category: projectCriterionKeys.includes(criterion.key) ? projectCategories.find(category => criterion.key.startsWith(`${category}-`)) : undefined }));
  const groups = [...projectCategories.map(category => ({ key: category, title: categoryLabels[category], items: criteria.filter(item => item.category === category) })), { key: "other", title: workshop.otherCriteria, items: criteria.filter(item => item.category === undefined) }].filter(group => group.items.length > 0);
  if (!document.rubric.length) return null;
  return <section className="space-y-5" data-workshop-checklist><h3 className="text-xl font-semibold">{t.checklist}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t.checklistNotice}</p><div className="space-y-6">{groups.map(group => <fieldset key={group.key} className="space-y-3 rounded-input border border-border p-4 sm:p-5"><legend className="px-2 text-sm font-semibold">{group.title}</legend>{group.items.map(({ criterion, index }) => <Checkbox key={criterion.key} id={`${id}-criterion-${index}`} label={<span lang={contentLocale}>{criterion.label}</span>} checked={checked.includes(criterion.key)} onCheckedChange={value => setChecked(current => value ? [...current, criterion.key] : current.filter(key => key !== criterion.key))} />)}</fieldset>)}</div></section>;
}

function ActivityContent({ locale, resource, languageLinks, returnTo, programme }: Omit<LearningActivityProps, "result"> & { resource: ResourceDetail }) {
  const t = getLearningDictionary(locale), publicCopy = getPublicDictionary(locale), workshop = getWorkshopDictionary(locale);
  const selfHref = programme?.activityHrefs[resource.versionId] ?? activityDiscoveryHref(resource.locale, resource.resourceId, resource.versionId, safeCatalogueReturnTo(returnTo, resource.locale));
  const { state: account, boundary } = useLearningAccount(selfHref);
  const [privateActivity, setPrivateActivity] = useState<AuthResult<ActivityData> | null>(null), [lookupDone, setLookupDone] = useState(!programme), [lookupError, setLookupError] = useState<ApiError | null>(null);
  const [enrolling, setEnrolling] = useState(false), [enrolled, setEnrolled] = useState(false), [unconfirmed, setUnconfirmed] = useState(false), [visitError, setVisitError] = useState<ApiError | null>(null), [historyRefresh, setHistoryRefresh] = useState(0);
  const [activityScope, setActivityScope] = useState<number | null>(null), [member, setMember] = useState<{ scope: number; result: AuthResult<ResourceDetail> } | null>(null);
  const request = useRef(0), lock = useRef(false), visited = useRef("");
  const acceptActivity = useCallback((result: AuthResult<ActivityData>) => {
    if (result.ok && (result.data.activityId !== resource.resourceId || result.data.activityVersionId !== resource.versionId)) setPrivateActivity({ ok: false, error: { kind: "invalid-response", status: 200 } });
    else setPrivateActivity(result);
    setActivityScope(boundary.capture()); setLookupDone(true); if (!result.ok) boundary.fail(result.error);
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
  useEffect(() => {
    if (account.status !== "active" || resource.access !== "PROTECTED" || resource.availability !== "PUBLISHED") return;
    const scope = boundary.capture(); let active = true;
    void getMemberResource(resource.resourceId, resource.versionId, resource.locale).then((result) => {
      if (!active || !boundary.isCurrent(scope)) return;
      setMember({ scope, result }); if (!result.ok) boundary.fail(result.error);
    });
    return () => { active = false; };
  }, [account.status, boundary, resource.access, resource.availability, resource.resourceId, resource.versionId, resource.locale]);
  const activity = privateActivity?.ok ? privateActivity.data : null;
  const scopedActivity = account.status === "active" && activityScope === boundary.capture() ? activity : null;
  const scopedMember = account.status === "active" && member?.scope === boundary.capture() && member.result.ok ? member.result.data : null;
  const ownedResource = scopedActivity?.resource ?? scopedMember;
  const privateAvailable = Boolean(ownedResource?.document && ownedResource.availability === "PUBLISHED" && (!programme || lookupDone));
  const contentResource = privateAvailable && ownedResource ? ownedResource : resource;
  // Keep personal project/answer state mounted during account revalidation;
  // premium source material itself is rendered only in the active generation.
  const retainedResource = activity?.resource.document ? activity.resource : member?.result.ok && member.result.data.document ? member.result.data : resource;
  const contextBlocked = Boolean(scopedActivity && (scopedActivity.accessStatus !== "ACTIVE" || scopedActivity.availability !== "PUBLISHED"));
  const publicAvailable = resource.availability === "PUBLISHED" && resource.access === "FREE" && resource.document !== null;
  const contentAvailable = (publicAvailable || privateAvailable) && !contextBlocked;
  const revisionChanged = Boolean(scopedActivity && scopedActivity.resource.revisionId !== resource.revisionId);
  const enrolledAvailable = Boolean(scopedActivity && !contextBlocked);
  const recordVisit = useCallback(async (value: ActivityData) => {
    if (account.status !== "active" || !account.accountId || value.accessStatus !== "ACTIVE" || value.availability !== "PUBLISHED") return;
    const scope = boundary.capture();
    const result = await visitActivity(value.enrollmentId, { activityId: resource.resourceId, activityVersionId: resource.versionId, locale: resource.locale }, account.accountId);
    if (boundary.isCurrent(scope)) { setVisitError(result.ok ? null : result.error); if (!result.ok) boundary.fail(result.error); }
  }, [account.status, account.accountId, boundary, resource.resourceId, resource.versionId, resource.locale]);
  useEffect(() => {
    if (!scopedActivity || account.status !== "active" || scopedActivity.accessStatus !== "ACTIVE" || scopedActivity.availability !== "PUBLISHED") return;
    const key = `${scopedActivity.enrollmentId}:${scopedActivity.activityVersionId}:${boundary.capture()}`;
    if (visited.current === key) return;
    visited.current = key; void recordVisit(scopedActivity);
  }, [scopedActivity, account.status, boundary, recordVisit]);
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
  return <div data-learning-workshop className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} />
    {resource.availability !== "PUBLISHED" ? <AvailabilityNotice locale={locale} resource={resource} /> : <header className="max-w-4xl space-y-4"><h1 lang={resource.title ? resource.locale : locale} className="break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{resource.title ?? publicCopy.unavailableTitle}</h1>{resource.summary && <p lang={resource.locale} className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{resource.summary}</p>}</header>}
    <details className="rounded-input border border-border px-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{workshop.details}</summary><div className="space-y-4 pb-4 text-muted-foreground"><p>{publicCopy.version} {resource.versionNumber} · {localeName(resource.locale)}{resource.access ? ` · ${publicCopy[resource.access]}` : ""}</p><p>{resource.reviewedAt ? `${publicCopy.reviewed} ${new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(resource.reviewedAt))}` : publicCopy.reviewUnknown}</p><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} /></div></details>
    <div className={`grid items-start gap-8 ${programme ? "lg:grid-cols-[260px_minmax(0,1fr)]" : ""}`}>
      {programme && <ActivityProgramme locale={locale} programme={programme} currentVersionId={resource.versionId} />}
      <div className="min-w-0 max-w-3xl space-y-10">
        {contextBlocked && <StatusMessage tone="warning">{activity?.accessStatus === "PROTECTED" ? t.protected : activity?.availability === "MISSING_TRANSLATION" ? t.translationMissing : t.contentUnavailable}</StatusMessage>}
        {revisionChanged && <div className="space-y-3"><StatusMessage tone="warning">{t.quizVersionChanged}</StatusMessage><ConfirmationDialog title={t.reloadActivity} description={t.reloadActivityDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.reloadActivity}</Button>} onConfirm={() => window.location.reload()} /></div>}
        {account.status === "active" && member?.scope === boundary.capture() && !member.result.ok && <LearningError locale={locale} error={member.result.error} retry={() => void boundary.refresh()} />}
        {account.status !== "anonymous" && <AccountNotice locale={locale} state={account} boundary={boundary} returnTo={selfHref} />}
        {account.status === "active" && programme && (!lookupDone ? <p role="status">{t.loading}</p> : <div className="space-y-4">{lookupError && <LearningError locale={locale} error={lookupError} retry={() => void retryLookup()} />}{privateActivity && !privateActivity.ok && <LearningError locale={locale} error={privateActivity.error} retry={() => void retryLookup()} />}{!activity && !lookupError && !privateActivity && contentAvailable && <Button busy={enrolling} loadingLabel={t.startingCourse} onClick={() => void enroll()}>{t.startCourse}</Button>}{enrolled && <StatusMessage tone="success">{t.enrolled}</StatusMessage>}</div>)}
        {unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}{visitError && <LearningError locale={locale} error={visitError} retry={activity ? () => void recordVisit(activity) : undefined} />}
        <nav aria-label={workshop.navigation} data-workshop-navigation className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ key: "understand", label: workshop.understand }, { key: "produce", label: workshop.produce }, { key: "verify", label: workshop.verify }, { key: "reuse", label: workshop.reuse }].map((moment, index) => <Link key={moment.key} href={`#activity-${moment.key}`} className="flex min-h-11 items-center gap-2 rounded-input border border-border bg-surface-subtle px-3 py-3 text-sm font-medium no-underline hover:border-brand"><span aria-hidden="true" className="text-brand">{String(index + 1).padStart(2, "0")}</span>{moment.label}</Link>)}</nav>
        <section id="activity-understand" data-workshop-moment="understand" className="scroll-mt-6 space-y-6">
          <div className="space-y-2"><h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><span aria-hidden="true" className="text-base font-medium text-brand">01</span>{workshop.understand}</h2><p className="text-sm leading-relaxed text-muted-foreground">{workshop.understandHelp}</p></div>
          {contentAvailable && contentResource.document ? <>
            <section className="space-y-3 rounded-panel border border-border bg-surface-subtle p-5 sm:p-6"><h3 className="text-lg font-semibold">{t.objective}</h3><p lang={contentResource.locale} className="whitespace-pre-wrap break-words leading-relaxed">{contentResource.document.objective}</p><h3 className="pt-2 text-lg font-semibold">{t.expectedResult}</h3><p lang={contentResource.locale} className="whitespace-pre-wrap break-words leading-relaxed">{contentResource.document.expectedResult}</p>{contentResource.document.prerequisites.length > 0 && <><h3 className="pt-2 text-lg font-semibold">{t.prerequisites}</h3><ul lang={contentResource.locale} className="list-disc space-y-2 pl-5">{contentResource.document.prerequisites.map((item, index) => <li key={index} className="break-words text-sm leading-relaxed">{item}</li>)}</ul></>}</section>
            {contentResource.document.media.length === 0 && <p className="text-sm leading-relaxed text-muted-foreground">{t.noVideo}</p>}<PublicDocumentBody locale={locale} contentLocale={contentResource.locale} document={contentResource.document} prefix="activity" showMedia={false} />
          </> : resource.availability === "PUBLISHED" && !contextBlocked && <StatusMessage>{resource.access === "PROTECTED" ? publicCopy.protectedBody : publicCopy.missingInfo}</StatusMessage>}
        </section>
        <section id="activity-produce" data-workshop-moment="produce" className="scroll-mt-6 space-y-6 border-t border-border pt-8">
          <div className="space-y-2"><h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><span aria-hidden="true" className="text-base font-medium text-brand">02</span>{workshop.produce}</h2><p className="text-sm leading-relaxed text-muted-foreground">{workshop.produceHelp}</p></div>
          {contentAvailable && contentResource.document && <><section className="space-y-3 rounded-panel border border-brand/20 bg-brand-soft p-5 sm:p-6"><h3 className="text-xl font-semibold">{t.practice}</h3><p lang={contentResource.document.exerciseInstructions ? contentResource.locale : locale} className="whitespace-pre-wrap break-words leading-relaxed">{contentResource.document.exerciseInstructions || t.noExercise}</p></section><LearningMedia locale={locale} resource={contentResource} account={account} boundary={boundary} enrollmentId={activity?.enrollmentId} /><section className="space-y-3"><h3 className="text-lg font-semibold">{t.resources}</h3><ResourceTools key={contentResource.revisionId} locale={locale} resource={contentResource} /></section></>}
          {retainedResource.document?.projectPolicy && <StartProjectAction key={`project:${resource.versionId}:${resource.locale}`} locale={locale} source={retainedResource} sourceAllowed={contentAvailable && !revisionChanged && !enrolling} account={account} boundary={boundary} enrollmentId={scopedActivity?.enrollmentId} />}
          {retainedResource.document?.exerciseInstructions && !retainedResource.document.projectPolicy && <ActivityPracticeDraft key={`practice-draft:${resource.versionId}:${resource.locale}`} locale={locale} resource={retainedResource} account={account} boundary={boundary} available={contentAvailable && !revisionChanged && !enrolling} />}
          {account.status === "anonymous" && <AccountNotice locale={locale} state={account} boundary={boundary} returnTo={selfHref} />}
        </section>
        <section id="activity-verify" data-workshop-moment="verify" className="scroll-mt-6 space-y-8 border-t border-border pt-8">
          <div className="space-y-2"><h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><span aria-hidden="true" className="text-base font-medium text-brand">03</span>{workshop.verify}</h2><p className="text-sm leading-relaxed text-muted-foreground">{workshop.verifyHelp}</p></div>
          {contentAvailable && contentResource.document && <Practice key={`practice:${resource.versionId}:${resource.locale}`} locale={locale} contentLocale={contentResource.locale} document={contentResource.document} />}
          {retainedResource.document && <ActivityQuiz key={`quiz:${resource.versionId}:${resource.locale}`} locale={locale} resource={retainedResource} contentVisible={contentAvailable} account={account} boundary={boundary} enrollmentId={scopedActivity?.enrollmentId} overview={scopedActivity?.quiz} available={contentAvailable && !revisionChanged && (!activity || enrolledAvailable) && !enrolling && !(programme && account.status === "active" && !lookupDone)} onAttempt={() => { setHistoryRefresh((value) => value + 1); void refreshActivity(); }} />}
        </section>
        <section id="activity-reuse" data-workshop-moment="reuse" className="scroll-mt-6 space-y-8 border-t border-border pt-8">
          <div className="space-y-2"><h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><span aria-hidden="true" className="text-base font-medium text-brand">04</span>{workshop.reuse}</h2><p className="text-sm leading-relaxed text-muted-foreground">{workshop.reuseHelp}</p></div>
          {account.accountId && <ActivityNotes key={`notes:${account.accountId}:${resource.versionId}`} locale={locale} contentLocale={resource.locale} activityId={resource.resourceId} activityVersionId={resource.versionId} account={account} boundary={boundary} canCreate={contentAvailable} />}
          {account.accountId && <QuizHistory key={`history:${account.accountId}:${resource.versionId}`} locale={locale} activityVersionId={resource.versionId} account={account} boundary={boundary} refresh={historyRefresh} />}
          {activity && <ActivityProgress key={`progress:${activity.progress.id}`} locale={locale} contentLocale={resource.locale} initial={activity.progress} account={account} boundary={boundary} available={enrolledAvailable} />}
          {programme && <ActivityNavigation locale={locale} programme={programme} currentVersionId={resource.versionId} />}
        </section>
      </div>
    </div>
  </div>;
}

export function LearningActivity({ locale, result, languageLinks, returnTo, programme }: LearningActivityProps) {
  if (result.ok && result.data.kind !== "ACTIVITY") return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} /><AvailabilityNotice locale={locale} resource={result.data} /><TranslationAvailability locale={locale} resource={result.data} languageLinks={languageLinks} /></div></PublicShell>;
  return <PublicShell locale={locale} languageLinks={languageLinks}>{!result.ok ? <div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} /><PublicApiError locale={locale} result={result} standalone /></div> : <ActivityContent key={`${result.data.resourceId}:${result.data.versionId}:${result.data.locale}`} locale={locale} resource={result.data} languageLinks={languageLinks} returnTo={returnTo} programme={programme} />}</PublicShell>;
}
