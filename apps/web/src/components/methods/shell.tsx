"use client";

import type { ReactNode } from "react";
import { LearnerLayout } from "@/components/layouts";
import type { Locale } from "@/lib/i18n/locales";
import { methodsPath } from "@/lib/methods/routes";

export function MethodShell({ locale, title, description, languageLinks, children }: { locale: Locale; title?: string; description?: string; languageLinks?: Record<Locale, string>; children: ReactNode }) {
  return <LearnerLayout locale={locale} title={title} description={description} product={{ languageLinks: languageLinks ?? { fr: methodsPath("fr"), en: methodsPath("en") } }}>{children}</LearnerLayout>;
}
