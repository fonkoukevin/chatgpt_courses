"use client";

import { useId, useState } from "react";
import { BookOpen } from "lucide-react";
import { Badge, Button, Sheet, StatusMessage } from "@/components/ui";
import { PublicDocumentBody } from "@/components/public/document";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectContext, ResourceDetail } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { ProjectError } from "./parts";

export function ProjectBriefContent({ locale, resource }: { locale: Locale; resource: ResourceDetail | null }) {
  const t = getProjectsDictionary(locale), id = useId();
  if (!resource?.document) return <StatusMessage tone="warning">{t.sourceUnavailable}</StatusMessage>;
  return <div className="min-w-0 space-y-5" lang={locale}><div className="flex flex-wrap gap-2"><Badge>{resource.locale.toUpperCase()}</Badge><Badge>{t.sourceVersion} {resource.versionNumber}</Badge></div><h3 className="break-words text-lg font-semibold" lang={resource.locale}>{resource.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed" lang={resource.locale}>{resource.document.objective}</p><div lang={resource.locale}><PublicDocumentBody locale={locale} document={resource.document} prefix={`project-brief-${id}`} /></div><section className="space-y-3"><h3 className="text-lg font-semibold">{t.instructions}</h3><p className="whitespace-pre-wrap break-words leading-relaxed" lang={resource.locale}>{resource.document.exerciseInstructions}</p></section></div>;
}

export function ProjectContextPanel({ locale, result, pending, retry }: { locale: Locale; result: AuthResult<ProjectContext> | null; pending?: boolean; retry: () => void }) {
  const t = getProjectsDictionary(locale);
  if (pending && !result) return <p role="status">{t.loading}</p>;
  if (!result) return <Button variant="secondary" onClick={retry}>{t.retry}</Button>;
  if (!result.ok) return <ProjectError locale={locale} error={result.error} retry={retry} />;
  return <div className="space-y-4">{result.data.sourceChanged && <StatusMessage tone="warning">{t.sourceChanged}</StatusMessage>}<ProjectBriefContent locale={locale} resource={result.data.resource} /></div>;
}

export function ProjectBriefPanel({ locale, result, pending, retry, resource }: { locale: Locale; result: AuthResult<ProjectContext> | null; pending?: boolean; retry: () => void; resource?: ResourceDetail | null }) {
  const t = getProjectsDictionary(locale), [open, setOpen] = useState(false);
  const content = resource !== undefined ? <ProjectBriefContent locale={locale} resource={resource} /> : <ProjectContextPanel locale={locale} result={result} pending={pending} retry={retry} />;
  return <><div className="xl:hidden"><Sheet open={open} onOpenChange={setOpen} title={t.brief} description={t.briefDescription} closeLabel={t.close} side="right" trigger={<Button variant="secondary" className="max-w-full whitespace-normal"><BookOpen size={18} aria-hidden="true" />{t.openBrief}</Button>}>{content}</Sheet></div><aside className="hidden min-w-0 space-y-4 xl:block"><h2 className="text-xl font-semibold">{t.brief}</h2><div className="max-h-[75vh] overflow-y-auto pr-2">{content}</div></aside></>;
}
