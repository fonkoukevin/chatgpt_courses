import type { Locale } from "@/lib/i18n/locales";
import { localeName } from "@/lib/i18n/locales";
import { getPublicDictionary } from "@/lib/i18n/public";
import type { LanguageLinks } from "@/lib/public/routes";
import { Link, StatusMessage } from "@/components/ui";
import { BackToCatalogue, PublicShell } from "./parts";
import type { ResourceDetail } from "@/lib/api/generated/types.gen";
import { UnavailableLearningHistory, type UnavailableActivityReference } from "@/components/learning/unavailable-history";

export function PublicContextUnavailable({ locale, languageLinks, returnTo, availability, personal }: { locale: Locale; languageLinks: LanguageLinks; returnTo: string; availability?: Exclude<ResourceDetail["availability"], "PUBLISHED">; personal?: UnavailableActivityReference }) {
  const copy = getPublicDictionary(locale);
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-6 py-10 sm:py-16">
    <BackToCatalogue locale={locale} returnTo={returnTo} /><h1 className="text-3xl font-semibold tracking-tight">{copy.unavailableTitle}</h1>
    {availability && <StatusMessage tone="warning">{copy[availability]}</StatusMessage>}
    <StatusMessage tone="warning">{copy.courseContextUnavailable}</StatusMessage>
    <ul className="space-y-4">{(["fr", "en"] as const).map(language => <li key={language} className="space-y-2"><p className="font-medium" lang={language}>{localeName(language)}</p>
      {languageLinks[language].available && <Link href={languageLinks[language].href} hrefLang={language}>{copy.open}</Link>}
      {languageLinks[language].alternativeHref && <p><Link data-language-alternative={language} href={languageLinks[language].alternativeHref!} hrefLang={language}>{copy.openStandaloneActivity}</Link></p>}
    </li>)}</ul>
    {personal && <UnavailableLearningHistory locale={locale} {...personal} />}
  </div></PublicShell>;
}
