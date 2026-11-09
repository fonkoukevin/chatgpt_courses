import "server-only";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminLayout } from "@/components/layouts";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readContents, readContent, readContentDependencies, readContentReadiness } from "@/lib/api/cms-server";
import type { ContentQuery } from "@/lib/api/cms-client";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref, authPath } from "@/lib/auth/routes";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import { getCmsPageDictionary } from "@/lib/i18n/cms-pages";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { ContentCatalogue } from "./catalogue";
import { ContentEditor } from "./editor";
import { ContentPreview } from "./preview";
import { CmsError } from "./parts";

type QueryParameters = Record<string, string | string[] | undefined>;
export type CmsPageProps = { params: Promise<{ locale: string; id?: string }>; searchParams: Promise<QueryParameters> };

function pageLocale(value: string): Locale { if (!isLocale(value)) notFound(); return value; }
function navigation(locale: Locale) {
  return { contentHref: cmsPath(locale), accountHref: authPath(locale, "account"), languageHrefs: { fr: cmsPath("fr"), en: cmsPath("en") }, navigationDescription: getCmsDictionary(locale).navigationDescription };
}
function StatusPage({ locale, children }: { locale: Locale; children: ReactNode }) {
  const text = getCmsDictionary(locale);
  return <AdminLayout locale={locale} title={text.title} description={text.introduction} product={navigation(locale)}>{children}</AdminLayout>;
}
async function guard(locale: Locale, destination: string) {
  const user = await readCurrentUser();
  if (!user.ok && user.error.kind === "http" && user.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required"));
  return user;
}

// Parse only the filters supported by the actual contract. In particular, a
// calendar day is converted explicitly to UTC, never to the host's time zone.
function parseQuery(input: QueryParameters): ContentQuery | null {
  const values: Record<string, string | undefined> = {};
  for (const key of ["q", "kind", "state", "locale", "courseId", "verifiedBefore", "needsUpdate", "page", "size"]) {
    if (Array.isArray(input[key])) return null;
    values[key] = typeof input[key] === "string" && input[key] !== "" ? input[key] : undefined;
  }
  const page = values.page ?? "0", size = values.size ?? "20";
  if (!/^\d+$/.test(page) || Number(page) > 1_000_000 || !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 100) return null;
  if ((values.q?.length ?? 0) > 240 || (values.courseId && !isUuid(values.courseId))) return null;
  if (values.kind && !["COURSE", "MODULE", "ACTIVITY", "GUIDE", "METHOD_TEMPLATE"].includes(values.kind)) return null;
  if (values.state && !["DRAFT", "TO_REVIEW", "READY", "PUBLISHED", "STALE", "ARCHIVED"].includes(values.state)) return null;
  if (values.locale && !["fr", "en"].includes(values.locale)) return null;
  if (values.needsUpdate && !["true", "false"].includes(values.needsUpdate)) return null;
  let verifiedBefore: string | undefined;
  if (values.verifiedBefore) {
    const raw = values.verifiedBefore;
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)?$/.test(raw) || !Number.isFinite(Date.parse(raw))) return null;
    verifiedBefore = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw).toISOString();
    if (verifiedBefore.slice(0, 10) !== raw.slice(0, 10)) return null;
  }
  return { q: values.q, kind: values.kind as ContentQuery["kind"], state: values.state as ContentQuery["state"],
    locale: values.locale as ContentQuery["locale"], courseId: values.courseId, verifiedBefore,
    needsUpdate: values.needsUpdate === undefined ? undefined : values.needsUpdate === "true", page: Number(page), size: Number(size) };
}

export async function CataloguePage({ params, searchParams }: CmsPageProps) {
  const locale = pageLocale((await params).locale), destination = cmsPath(locale);
  const user = await guard(locale, destination);
  if (!user.ok) return <StatusPage locale={locale}><CmsError error={user.error} locale={locale} returnTo={destination} /><Link href={destination} prefetch={false}>{getCmsPageDictionary(locale).retry}</Link></StatusPage>;
  if (!user.data.permissions.includes("content.read")) return <StatusPage locale={locale}><StatusMessage tone="danger">{getCmsDictionary(locale).forbidden}</StatusMessage></StatusPage>;
  const query = parseQuery(await searchParams);
  if (!query) return <StatusPage locale={locale}><StatusMessage tone="danger">{getCmsPageDictionary(locale).invalidFilters}</StatusMessage><Link href={destination} prefetch={false}>{getCmsDictionary(locale).clearFilters}</Link></StatusPage>;
  return <ContentCatalogue key={JSON.stringify(query)} locale={locale} initial={await readContents(query)} query={query} permissions={user.data.permissions} />;
}
export async function EditorPage({ params }: CmsPageProps) {
  const route = await params, locale = pageLocale(route.locale);
  if (!isUuid(route.id)) notFound();
  const destination = cmsPath(locale, route.id), user = await guard(locale, destination);
  if (!user.ok) return <StatusPage locale={locale}><CmsError error={user.error} locale={locale} returnTo={destination} /><Link href={destination} prefetch={false}>{getCmsPageDictionary(locale).retry}</Link></StatusPage>;
  if (!user.data.permissions.includes("content.read")) return <StatusPage locale={locale}><StatusMessage tone="danger">{getCmsDictionary(locale).forbidden}</StatusMessage></StatusPage>;
  const initial = await readContent(route.id);
  if (!initial.ok) return <ContentEditor locale={locale} expectedAccountId={user.data.id} initial={initial} initialReadiness={initial} initialDependencies={initial} permissions={user.data.permissions} />;
  const [initialReadiness, initialDependencies] = await Promise.all([readContentReadiness(route.id), readContentDependencies(route.id)]);
  return <ContentEditor key={route.id} locale={locale} expectedAccountId={user.data.id} initial={initial} initialReadiness={initialReadiness} initialDependencies={initialDependencies} permissions={user.data.permissions} />;
}
export async function PreviewPage({ params }: CmsPageProps) {
  const route = await params, locale = pageLocale(route.locale);
  if (!isUuid(route.id)) notFound();
  const destination = cmsPath(locale, route.id, "preview"), user = await guard(locale, destination);
  if (!user.ok) return <StatusPage locale={locale}><CmsError error={user.error} locale={locale} returnTo={destination} /><Link href={destination} prefetch={false}>{getCmsPageDictionary(locale).retry}</Link></StatusPage>;
  if (!user.data.permissions.includes("content.read")) return <StatusPage locale={locale}><StatusMessage tone="danger">{getCmsDictionary(locale).forbidden}</StatusMessage></StatusPage>;
  return <ContentPreview locale={locale} initial={await readContent(route.id, true)} permissions={user.data.permissions} />;
}
