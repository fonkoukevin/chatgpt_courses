import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthCheck } from "@/components/health-check";
import { getServerConfig } from "@/lib/config/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, locales } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FoundationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const config = getServerConfig();
  if (config.environment !== "local" && config.environment !== "test") notFound();
  const dictionary = getDictionary(locale);

  return (
    <div className="page-shell">
      <header className="site-header">
        <Link className="wordmark" href={`/${locale}`}>ChatGPT Courses<span className="wordmark-dot" aria-hidden="true">.</span></Link>
        <nav aria-label={dictionary.localeNavigation} className="language-switch">
          {locales.map((language) => (
            <Link key={language} href={`/${language}`} hrefLang={language} lang={language} aria-current={language === locale ? "page" : undefined}>
              {language === "fr" ? "Français" : "English"}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="introduction" aria-labelledby="page-title">
          <span className="environment-label">{dictionary.environment}</span>
          <p className="eyebrow">{dictionary.eyebrow}</p>
          <h1 id="page-title">{dictionary.title}</h1>
          <p className="introduction-copy">{dictionary.introduction}</p>
        </section>
        <HealthCheck dictionary={dictionary} />
        <div className="foundation-notes">
          <section aria-labelledby="scope-title"><h2 id="scope-title">{dictionary.scopeTitle}</h2><p>{dictionary.scopeBody}</p></section>
          <section aria-labelledby="next-title"><h2 id="next-title">{dictionary.nextTitle}</h2><p>{dictionary.nextBody}</p></section>
        </div>
      </main>
      <footer className="site-footer"><p>{dictionary.footer}</p></footer>
    </div>
  );
}
