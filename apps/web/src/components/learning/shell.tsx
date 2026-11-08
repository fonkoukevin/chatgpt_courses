"use client";

import type { ReactNode } from "react";
import { LearnerLayout } from "@/components/layouts";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { learningLanguages } from "@/lib/learning/routes";

export function LearningShell({ locale, children, languageLinks, title, description }: { locale: Locale; children: ReactNode; languageLinks?: Record<Locale, string>; title?: string; description?: string }) {
  const t = getLearningDictionary(locale);
  return <LearnerLayout locale={locale} title={title ?? t.dashboardTitle} description={description ?? t.dashboardDescription} product={{ active: "learning", languageLinks: languageLinks ?? learningLanguages() }}>{children}</LearnerLayout>;
}
