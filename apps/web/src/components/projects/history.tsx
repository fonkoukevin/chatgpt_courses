"use client";
import { useEffect, useRef, useState } from "react";
import { Button, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectRevisionPage, ProjectRevisionView, ProjectRubricSnapshot, SelfAssessmentPage, SelfAssessmentView } from "@/lib/api/generated/types.gen";
import { getProjectRevision, getSelfAssessment, listProjectRevisions, listSelfAssessments } from "@/lib/api/projects-client";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { projectBodyText } from "@/lib/projects/fields";
import { EvaluationSummary } from "./assessment";
import { ProjectError, projectDate, projectStateLabel } from "./parts";

const words = {
  fr: { revision: "Consulter cette version", assessment: "Consulter cette autoévaluation", empty: "Aucun élément enregistré.", previous: "Page précédente", next: "Page suivante", page: "Page", readOnly: "Cette consultation ne remplace pas la production dans le formulaire.", refresh: "Actualiser l’historique" },
  en: { revision: "View this version", assessment: "View this self-assessment", empty: "Nothing saved yet.", previous: "Previous page", next: "Next page", page: "Page", readOnly: "Viewing this version does not replace the work in the form.", refresh: "Refresh history" },
};
function HistoryPager({ locale, page, pageSize, total, disabled, onPage }: { locale: Locale; page: number; pageSize: number; total: number; disabled: boolean; onPage: (page: number) => void }) {
  const w = words[locale];
  return <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={page === 0 || disabled} onClick={() => onPage(page - 1)}>{w.previous}</Button><span className="text-sm">{w.page} {page + 1}</span><Button variant="secondary" disabled={(page + 1) * pageSize >= total || disabled} onClick={() => onPage(page + 1)}>{w.next}</Button></div>;
}
export function ProjectHistory({ locale, projectId, currentRevisionId, rubric, account, boundary, refresh }: {
  locale: Locale; projectId: string; currentRevisionId: string; rubric: ProjectRubricSnapshot; account: LearningAccountState; boundary: LearningAccountBoundary; refresh: number;
}) {
  const t = getProjectsDictionary(locale), w = words[locale];
  const [pages, setPages] = useState({ revisions: 0, assessments: 0 }), [reload, setReload] = useState(0);
  const [revisions, setRevisions] = useState<AuthResult<ProjectRevisionPage> | null>(null), [assessments, setAssessments] = useState<AuthResult<SelfAssessmentPage> | null>(null);
  const [revision, setRevision] = useState<AuthResult<ProjectRevisionView> | null>(null), [assessment, setAssessment] = useState<AuthResult<SelfAssessmentView> | null>(null), [pending, setPending] = useState(false);
  const sequence = useRef(0), detail = useRef(0), displayed = useRef<HTMLElement>(null);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const request = ++sequence.current, scope = boundary.capture(), detailSequence = detail;
    void Promise.all([listProjectRevisions(projectId, pages.revisions), listSelfAssessments(projectId, pages.assessments)]).then(([nextRevisions, nextAssessments]) => {
      if (!active || request !== sequence.current || !boundary.isCurrent(scope)) return;
      setRevisions(nextRevisions); setAssessments(nextAssessments); setPending(false);
      if (!nextRevisions.ok) boundary.fail(nextRevisions.error); if (!nextAssessments.ok) boundary.fail(nextAssessments.error);
    });
    return () => { active = false; detailSequence.current++; };
  }, [account.status, boundary, pages, projectId, refresh, reload]);
  async function open(kind: "revision" | "assessment", id: string) {
    if (account.status !== "active") return;
    const request = ++detail.current, scope = boundary.capture(); setPending(true);
    if (kind === "revision") {
      const result = await getProjectRevision(projectId, id);
      if (request !== detail.current || !boundary.isCurrent(scope)) return;
      setRevision(result); setAssessment(null); if (!result.ok) boundary.fail(result.error);
    } else {
      const result = await getSelfAssessment(projectId, id);
      if (request !== detail.current || !boundary.isCurrent(scope)) return;
      setAssessment(result); setRevision(null); if (!result.ok) boundary.fail(result.error);
    }
    setPending(false); requestAnimationFrame(() => displayed.current?.focus());
  }
  return <section className="min-w-0 space-y-6"><h2 className="text-2xl font-semibold">{t.history}</h2><Button variant="secondary" disabled={account.status !== "active"} onClick={() => setReload((value) => value + 1)}>{w.refresh}</Button>
    <section className="space-y-4"><h3 className="text-xl font-semibold">{t.revisions}</h3>{!revisions ? <p role="status">{t.loading}</p> : !revisions.ok ? <ProjectError locale={locale} error={revisions.error} /> : <>{revisions.data.items.length === 0 && <p>{w.empty}</p>}<ul className="space-y-3">{revisions.data.items.map((item) => <li key={`revision:${item.id}`} className="space-y-2 rounded-input border border-border p-4"><p className="break-words font-medium" lang={item.locale}>{item.title}</p><p className="text-sm">{t.projectRevision} {item.revisionNumber} · {projectStateLabel(locale, item.stage)} · {projectDate(item.createdAt, locale)}</p><Button variant="secondary" disabled={pending || account.status !== "active"} onClick={() => void open("revision", item.id)}>{w.revision}</Button></li>)}</ul><HistoryPager locale={locale} {...revisions.data} disabled={account.status !== "active"} onPage={(page) => setPages((value) => ({ ...value, revisions: page }))} /></>}</section>
    <section className="space-y-4"><h3 className="text-xl font-semibold">{t.assessments}</h3>{!assessments ? <p role="status">{t.loading}</p> : !assessments.ok ? <ProjectError locale={locale} error={assessments.error} /> : <>{assessments.data.items.length === 0 && <p>{t.noAssessment}</p>}<ul className="space-y-3">{assessments.data.items.map((item) => <li key={`assessment:${item.id}`} className="space-y-2 rounded-input border border-border p-4"><p className="font-medium">{t.declaredScore} : {item.scorePoints}/{item.maxPoints}</p><p className="text-sm">{projectDate(item.evaluatedAt, locale)} · {item.needsRevision ? t.stateRevise : t.stateAssessed}</p>{item.projectRevisionId !== currentRevisionId && <p className="text-sm text-muted-foreground">{t.olderAssessment}</p>}<Button variant="secondary" disabled={pending || account.status !== "active"} onClick={() => void open("assessment", item.id)}>{w.assessment}</Button></li>)}</ul><HistoryPager locale={locale} {...assessments.data} disabled={account.status !== "active"} onPage={(page) => setPages((value) => ({ ...value, assessments: page }))} /></>}</section>
    <section ref={displayed} tabIndex={-1} className="space-y-4 rounded-input outline-none focus-visible:outline-2 focus-visible:outline-focus">{pending && <p role="status">{t.loading}</p>}{revision && (!revision.ok ? <ProjectError locale={locale} error={revision.error} /> : <><h3 className="text-xl font-semibold">{t.projectRevision} {revision.data.revisionNumber}</h3><StatusMessage>{w.readOnly}</StatusMessage><TextArea aria-label={`${t.projectRevision} ${revision.data.revisionNumber}`} lang={revision.data.fields.locale} readOnly rows={16} value={projectBodyText(revision.data.fields)} /></>)}{assessment && (!assessment.ok ? <ProjectError locale={locale} error={assessment.error} /> : <><EvaluationSummary locale={locale} value={assessment.data} currentRevisionId={currentRevisionId} /><details><summary className="min-h-11 cursor-pointer py-3 font-medium">{t.provenance}</summary><ul className="space-y-3 text-sm">{assessment.data.answers.map((answer) => <li key={answer.key} className="break-words">{rubric.criteria.find((criterion) => criterion.key === answer.key)?.label ?? answer.key} : {answer.satisfied ? "1 / 1" : "0 / 1"}{answer.comment && <p className="whitespace-pre-wrap">{answer.comment}</p>}</li>)}</ul></details></>)}</section>
  </section>;
}
