"use client";

import { Link } from "@/components/ui";
import { authHref } from "@/lib/auth/routes";
import { getLearningDictionary } from "@/lib/i18n/learning";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { learningPath } from "@/lib/learning/routes";
import { ActivityNotes } from "./notes";
import { AccountNotice } from "./parts";
import { QuizHistory } from "./quiz";

export type UnavailableActivityReference = { resourceId: string; versionId: string; contentLocale: Locale };

const copy = {
  fr: { help: "Retrouvez les notes et les tentatives déjà enregistrées pour cette activité. Votre travail personnel reste distinct de l’accès au contenu.",
    signIn: "Me connecter pour retrouver mon travail", anonymous: "La connexion permet de rechercher votre travail enregistré. Elle ne rétablit pas l’accès au contenu retiré." },
  en: { help: "Find the notes and attempts already saved for this activity. Your personal work remains separate from access to its content.",
    signIn: "Sign in to find my work", anonymous: "Signing in lets you look for your saved work. It does not restore access to withdrawn content." },
};

// This boundary receives identifiers only. Notes and history are loaded through
// their existing private, owner-scoped APIs; no pedagogical body is needed here.
export function UnavailableLearningHistory({ locale, resourceId, versionId, contentLocale }: UnavailableActivityReference & { locale: Locale }) {
  const t = getLearningDictionary(locale), text = copy[locale], destination = learningPath(locale);
  const { state: account, boundary } = useLearningAccount(destination);
  return <div className="space-y-6 border-t border-border pt-8" data-unavailable-learning-history>
    <div className="space-y-2"><h2 className="text-2xl font-semibold">{t.retainedWork}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{text.help}</p></div>
    {account.status === "anonymous" ? <div className="space-y-3"><p className="text-sm leading-relaxed">{text.anonymous}</p><Link href={authHref(locale, "sign-in", destination)} prefetch={false} className="inline-flex min-h-11 items-center">{text.signIn}</Link></div>
      : <AccountNotice locale={locale} state={account} boundary={boundary} returnTo={destination} />}
    {account.accountId && <>
      <ActivityNotes key={`notes:${account.accountId}:${resourceId}:${versionId}`} locale={locale} contentLocale={contentLocale} activityId={resourceId} activityVersionId={versionId} account={account} boundary={boundary} canCreate={false} />
      <QuizHistory key={`history:${account.accountId}:${resourceId}:${versionId}`} locale={locale} activityVersionId={versionId} account={account} boundary={boundary} />
    </>}
  </div>;
}
