import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AuthResult } from "@/lib/api/auth-client";
import type { CurriculumNode, ResourceCard, ResourceDetail } from "@/lib/api/generated/types.gen";
import { isUuid } from "@/lib/api/cms-validation";
import { readCatalogue, readCatalogueFacets, readResourceBySlug, readResourceVersion } from "@/lib/api/public-server";
import { getServerConfig } from "@/lib/config/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getPublicPageDictionary } from "@/lib/i18n/public-pages";
import { parseCatalogueQuery, safeCatalogueReturnTo, singleParameter, type PublicParameters } from "@/lib/public/query";
import { activityDiscoveryHref, catalogueHref, courseActivityHref, publicCatalogueHref, resourceHref, type LanguageLinks } from "@/lib/public/routes";
import { PublicHome } from "./home";
import { PublicCatalogue } from "./catalogue";
import { PublicCourse } from "./course";
import { PublicGuide } from "./guide";
import { PublicActivity } from "./activity";
import { PublicUnavailable } from "./unavailable";
import { PublicMethodSource } from "@/components/methods/source";
import { readLearningDashboard, readSavedLearningActivity } from "@/lib/api/learning-server";

export type PublicPageProps = { params: Promise<{ locale: string; slug?: string; courseSlug?: string; activitySlug?: string }>; searchParams: Promise<PublicParameters> };
export function forLocale<T>(page: (props: PublicPageProps) => Promise<T>, expected: Locale) {
  return async function LocalizedPage(props: PublicPageProps): Promise<T> { if ((await props.params).locale !== expected) notFound(); return page(props); };
}
function localeFrom(value: string): Locale { if (!isLocale(value)) notFound(); return value; }
function slugFrom(value: string | undefined): string { if (!value || value.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) notFound(); return value; }
function defaultLanguages(query?: Parameters<typeof catalogueHref>[1]): LanguageLinks {
  return { fr: { href: query ? catalogueHref("fr", { ...query, locale: "fr", page: 0 }) : "/fr", available: true },
    en: { href: query ? catalogueHref("en", { ...query, locale: "en", page: 0 }) : "/en", available: true } };
}
function resourceLanguages(value: ResourceDetail, returnTo: string, discovery = false): LanguageLinks {
  const links = {} as LanguageLinks;
  for (const locale of ["fr", "en"] as const) {
    const translated = value.languages.find((item) => item.locale === locale);
    const available = translated?.status === "PUBLISHED" && Boolean(translated.slug);
    let href = discovery ? activityDiscoveryHref(locale, value.resourceId, value.versionId, returnTo)
      : available && translated?.slug && value.kind !== "MODULE" ? resourceHref({ ...value, kind: value.kind, locale, slug: translated.slug }, returnTo)
        : catalogueHref(locale, { locale, type: value.kind === "MODULE" ? undefined : value.kind, goal: value.metadata.goalCodes[0] });
    if (!discovery && available) { const target = new URL(href, "https://courses.invalid"); target.searchParams.set("version", value.versionId); href = target.pathname + target.search; }
    links[locale] = { available, href };
  }
  return links;
}
function apiNotFound<T>(result: AuthResult<T>): AuthResult<T> {
  if (!result.ok && result.error.kind === "http" && result.error.status === 404) notFound();
  return result;
}
function nodesOf(nodes: CurriculumNode[]): CurriculumNode[] { return nodes.flatMap((node) => [node, ...nodesOf(node.children)]); }
function programmeLinks(locale: Locale, course: ResourceDetail, returnTo: string): Record<string, string> {
  if (!course.slug) return {};
  return Object.fromEntries(nodesOf(course.curriculum).filter((node) => node.kind === "ACTIVITY" && node.availability === "PUBLISHED" && node.slug)
    .map((node) => [node.versionId, courseActivityHref(locale, course.slug!, node.slug!, node.resourceId, node.versionId, course.versionId, returnTo)]));
}
function seo(locale: Locale, title: string, description: string, path: string, languages?: LanguageLinks): Metadata {
  const config = getServerConfig();
  const canonical = new URL(path, config.publicOrigin).toString();
  const equivalents = languages ? Object.fromEntries(Object.entries(languages).filter(([, link]) => link.available).map(([language, link]) => { const target = new URL(link.href, config.publicOrigin); target.searchParams.delete("returnTo"); return [language, target.toString()]; })) : undefined;
  return { title: `${title} | ChatGPT Courses`, description, metadataBase: new URL(config.publicOrigin),
    alternates: { canonical, ...(equivalents ? { languages: equivalents } : {}) },
    robots: { index: false, follow: false }, openGraph: { type: "website", title, description, url: canonical, siteName: "ChatGPT Courses" } };
}

export async function PublicHomePage({ params }: PublicPageProps) {
  const locale = localeFrom((await params).locale);
  const [catalogue, facets, featuredActivityResult] = await Promise.all([
    readCatalogue({ locale, pageSize: 6, sort: "RECENT" }), readCatalogueFacets(locale),
    readCatalogue({ locale, type: "ACTIVITY", access: "FREE", pageSize: 1, sort: "TITLE" }),
  ]);
  const faqCard = catalogue.ok ? catalogue.data.items.find((item) => item.kind === "COURSE")
    ?? catalogue.data.items.find((item) => item.kind === "GUIDE") ?? catalogue.data.items[0] : undefined;
  const faqResource = faqCard ? await readResourceVersion(faqCard.resourceId, faqCard.versionId, locale) : undefined;
  const faq = faqResource?.ok && faqResource.data.availability === "PUBLISHED" ? faqResource.data.metadata.faq : [];
  const faqSource = faqCard && faq.length > 0 ? { title: faqCard.title, href: resourceHref(faqCard) } : undefined;
  return <PublicHome locale={locale} catalogue={catalogue} facets={facets} featuredActivityResult={featuredActivityResult} languageLinks={defaultLanguages()} faq={faq} faqSource={faqSource} />;
}
export async function homeMetadata({ params }: PublicPageProps): Promise<Metadata> {
  const locale = localeFrom((await params).locale), copy = getPublicPageDictionary(locale);
  return seo(locale, copy.homeTitle, copy.homeDescription, `/${locale}`, defaultLanguages());
}

export async function PublicCataloguePage({ params, searchParams }: PublicPageProps) {
  const locale = localeFrom((await params).locale), input = await searchParams;
  const query = parseCatalogueQuery(locale, input), selected = singleParameter(input.activity);
  if (!query) { const copy = getPublicPageDictionary(locale); return <PublicUnavailable locale={locale} languageLinks={defaultLanguages({ locale })} title={copy.invalidTitle} description={copy.invalidDescription} returnTo={publicCatalogueHref(locale)} />; }
  if (selected !== undefined) {
    const version = singleParameter(input.version);
    if (!isUuid(selected) || !isUuid(version)) notFound();
    const result = apiNotFound(await readResourceVersion(selected, version, query.locale));
    if (result.ok && result.data.kind !== "ACTIVITY") notFound();
    const returnTo = safeCatalogueReturnTo(singleParameter(input.returnTo), locale);
    return <PublicActivity locale={locale} result={result} languageLinks={result.ok ? resourceLanguages(result.data, returnTo, true) : defaultLanguages(query)} returnTo={returnTo} />;
  }
  const [result, facets] = await Promise.all([readCatalogue(query), readCatalogueFacets(query.locale)]);
  return <PublicCatalogue key={JSON.stringify(query)} locale={locale} result={result} facets={facets} query={query} languageLinks={defaultLanguages(query)} />;
}
export async function catalogueMetadata({ params, searchParams }: PublicPageProps): Promise<Metadata> {
  const locale = localeFrom((await params).locale), input = await searchParams, query = parseCatalogueQuery(locale, input);
  const copy = getPublicPageDictionary(locale), selected = singleParameter(input.activity), version = singleParameter(input.version);
  if (isUuid(selected) && isUuid(version)) {
    const result = await readResourceVersion(selected, version, query?.locale ?? locale);
    if (result.ok && result.data.title) {
      const canonical = new URL(activityDiscoveryHref(locale, selected, version), "https://courses.invalid");
      if (query && query.locale !== locale) canonical.searchParams.set("locale", query.locale);
      return seo(locale, result.data.title, result.data.summary ?? copy.catalogueDescription, canonical.pathname + canonical.search);
    }
  }
  return seo(locale, copy.catalogueTitle, copy.catalogueDescription, query ? catalogueHref(locale, query) : publicCatalogueHref(locale), defaultLanguages(query ?? { locale }));
}

async function resourcePageData(props: PublicPageProps, kind: Exclude<ResourceCard["kind"], "ACTIVITY">) {
  const route = await props.params, locale = localeFrom(route.locale), slug = slugFrom(route.slug), input = await props.searchParams;
  let result = apiNotFound(await readResourceBySlug(kind, slug, locale));
  const version = singleParameter(input.version);
  if (version !== undefined) {
    if (!isUuid(version)) notFound();
    if (result.ok) result = apiNotFound(await readResourceVersion(result.data.resourceId, version, locale));
  }
  if (result.ok && result.data.kind !== kind) notFound();
  const returnTo = safeCatalogueReturnTo(singleParameter(input.returnTo), locale);
  return { locale, slug, result, returnTo, languageLinks: result.ok ? resourceLanguages(result.data, returnTo) : defaultLanguages({ locale, type: kind }) };
}
export async function PublicCoursePage(props: PublicPageProps) {
  const data = await resourcePageData(props, "COURSE");
  return <PublicCourse {...data} activityHrefs={data.result.ok ? programmeLinks(data.locale, data.result.data, data.returnTo) : {}} />;
}
export async function PublicGuidePage(props: PublicPageProps) { return <PublicGuide {...await resourcePageData(props, "GUIDE")} />; }
export async function PublicMethodPage(props: PublicPageProps) { return <PublicMethodSource {...await resourcePageData(props, "METHOD_TEMPLATE")} />; }
export function detailMetadata(kind: Exclude<ResourceCard["kind"], "ACTIVITY">) {
  return async function generateMetadata(props: PublicPageProps): Promise<Metadata> {
    const data = await resourcePageData(props, kind), copy = getPublicPageDictionary(data.locale);
    const value = data.result.ok ? data.result.data : null;
    const segment = kind === "COURSE" ? data.locale === "fr" ? "parcours" : "courses" : kind === "GUIDE" ? "guides" : data.locale === "fr" ? "methodes" : "methods";
    const version = singleParameter((await props.searchParams).version);
    return seo(data.locale, value?.title ?? copy.unavailableTitle, value?.summary ?? copy.unavailableDescription,
      `/${data.locale}/${segment}/${data.slug}${isUuid(version) ? `?version=${version}` : ""}`, data.languageLinks);
  };
}

async function retainedActivity(course: ResourceDetail, activityId: string, activityVersionId: string, locale: Locale): Promise<AuthResult<ResourceDetail> | null> {
  // Only an owned, version-pinned enrollment can restore context after the
  // public tree has been withdrawn. This never grants a pedagogical right.
  const dashboard = await readLearningDashboard(locale);
  if (!dashboard.ok) return dashboard.error.status === 401 ? null : dashboard;
  const enrollment = dashboard.data.enrollments.find((entry) => entry.courseResourceId === course.resourceId && entry.courseVersionId === course.versionId);
  if (!enrollment) return null;
  const saved = await readSavedLearningActivity(enrollment.id, activityId, activityVersionId, locale);
  if (!saved.ok) return saved.error.status === 404 ? null : saved;
  return { ok: true, data: saved.data.resource, status: 200 };
}
async function activityData(props: PublicPageProps) {
  const route = await props.params, locale = localeFrom(route.locale), courseSlug = slugFrom(route.courseSlug), activitySlug = slugFrom(route.activitySlug), input = await props.searchParams;
  let course = apiNotFound(await readResourceBySlug("COURSE", courseSlug, locale));
  const parentVersion = singleParameter(input.courseVersion), resource = singleParameter(input.resource), version = singleParameter(input.version);
  const catalogueReturnTo = safeCatalogueReturnTo(singleParameter(input.returnTo), locale);
  if (parentVersion !== undefined && !isUuid(parentVersion)) notFound();
  if ((resource !== undefined && !isUuid(resource)) || (version !== undefined && !isUuid(version)) || ((resource === undefined) !== (version === undefined))) notFound();
  if (course.ok && parentVersion) course = apiNotFound(await readResourceVersion(course.data.resourceId, parentVersion, locale));
  if (!course.ok) return { locale, result: course, languageLinks: defaultLanguages({ locale, type: "ACTIVITY" }), returnTo: catalogueReturnTo, canonical: publicCatalogueHref(locale) };
  if (course.data.availability !== "PUBLISHED") {
    const saved = isUuid(resource) && isUuid(version) ? await retainedActivity(course.data, resource, version, locale) : null;
    return { locale, result: saved ?? course, languageLinks: saved?.ok ? resourceLanguages(saved.data, catalogueReturnTo, true) : resourceLanguages(course.data, catalogueReturnTo), returnTo: catalogueReturnTo,
      canonical: `/${locale}/${locale === "fr" ? "apprendre" : "learn"}/${courseSlug}/${activitySlug}?courseVersion=${course.data.versionId}` };
  }
  const child = nodesOf(course.data.curriculum).find((node) => node.kind === "ACTIVITY" && (resource ? node.resourceId === resource && node.versionId === version && (!node.slug || node.slug === activitySlug) : node.slug === activitySlug));
  if (!child) {
    const saved = isUuid(resource) && isUuid(version) ? await retainedActivity(course.data, resource, version, locale) : null;
    if (!saved) notFound();
    return { locale, result: saved, languageLinks: saved.ok ? resourceLanguages(saved.data, catalogueReturnTo, true) : defaultLanguages({ locale, type: "ACTIVITY" }), returnTo: catalogueReturnTo,
      canonical: courseActivityHref(locale, courseSlug, activitySlug, resource!, version!, course.data.versionId) };
  }
  const result = apiNotFound(await readResourceVersion(child.resourceId, child.versionId, locale));
  if (result.ok && result.data.kind !== "ACTIVITY") notFound();
  const back = `/${locale}/${locale === "fr" ? "parcours" : "courses"}/${courseSlug}?${new URLSearchParams({ version: course.data.versionId, returnTo: catalogueReturnTo })}`;
  const languageLinks = result.ok ? resourceLanguages(result.data, catalogueReturnTo, true) : defaultLanguages({ locale, type: "ACTIVITY" });
  if (result.ok) for (const target of ["fr", "en"] as const) {
    const parentLanguage = course.data.languages.find((item) => item.locale === target), childLanguage = result.data.languages.find((item) => item.locale === target);
    if (parentLanguage?.status === "PUBLISHED" && parentLanguage.slug && childLanguage?.status === "PUBLISHED" && childLanguage.slug) languageLinks[target] = { available: true, href: courseActivityHref(target, parentLanguage.slug, childLanguage.slug, child.resourceId, child.versionId, course.data.versionId, catalogueReturnTo) };
  }
  return { locale, result, languageLinks, returnTo: back, programme: { course: course.data, activityHrefs: programmeLinks(locale, course.data, catalogueReturnTo) }, canonical: courseActivityHref(locale, courseSlug, activitySlug, child.resourceId, child.versionId, course.data.versionId) };
}
export async function PublicActivityPage(props: PublicPageProps) { return <PublicActivity {...await activityData(props)} />; }
export async function activityMetadata(props: PublicPageProps): Promise<Metadata> {
  const data = await activityData(props), copy = getPublicPageDictionary(data.locale), value = data.result.ok ? data.result.data : null;
  return seo(data.locale, value?.title ?? copy.unavailableTitle, value?.summary ?? copy.unavailableDescription,
    data.canonical, data.languageLinks);
}
