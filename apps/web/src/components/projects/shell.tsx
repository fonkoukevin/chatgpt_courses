"use client";

import type { ReactNode } from "react";
import { LearnerLayout } from "@/components/layouts";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { projectLanguages } from "@/lib/projects/routes";

export function ProjectShell({ locale, title, description, languageLinks, children }: { locale: Locale; title?: string; description?: string; languageLinks?: Record<Locale, string>; children: ReactNode }) {
  const t = getProjectsDictionary(locale);
  return <LearnerLayout locale={locale} title={title ?? t.projects} description={description ?? t.libraryDescription} product={{ active: "projects", languageLinks: languageLinks ?? projectLanguages() }}>{children}</LearnerLayout>;
}
