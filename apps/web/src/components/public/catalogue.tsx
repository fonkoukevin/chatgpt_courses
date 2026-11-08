"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, FormField, Input, Link, Pagination, Select, Sheet, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { CatalogueFacets, CataloguePage, FacetOption } from "@/lib/api/generated/types.gen";
import type { CatalogueQuery } from "@/lib/api/public-client";
import type { Locale } from "@/lib/i18n/locales";
import { getPublicDictionary } from "@/lib/i18n/public";
import { catalogueHref, publicCatalogueHref, type LanguageLinks } from "@/lib/public/routes";
import { PublicApiError, PublicShell, ResourceCards } from "./parts";

type FilterKey = "q" | "type" | "goal" | "level" | "locale" | "access";
function selectedFilterLabel(locale: Locale, key: FilterKey, value: string, unknownLabel?: string): string {
  if (key === "q") return value;
  const t = getPublicDictionary(locale);
  const known: Record<Exclude<FilterKey, "q">, Record<string, string>> = {
    type: { COURSE: t.COURSE, ACTIVITY: t.ACTIVITY, GUIDE: t.GUIDE, METHOD_TEMPLATE: t.METHOD_TEMPLATE },
    goal: t.goalLabels,
    level: { BEGINNER: t.BEGINNER, INTERMEDIATE: t.INTERMEDIATE, ADVANCED: t.ADVANCED },
    access: { FREE: t.FREE, PROTECTED: t.PROTECTED },
    locale: t.languageNames,
  };
  return Object.hasOwn(known[key], value) ? known[key][value] : unknownLabel ?? t.unavailableFilter;
}

function FilterForm({ locale, query, facets }: { locale: Locale; query: CatalogueQuery; facets: CatalogueFacets }) {
  const id = useId(); const t = getPublicDictionary(locale);
  const fields: Array<{ key: "type" | "goal" | "level" | "locale" | "access"; label: string; options: FacetOption[] }> = [
    { key: "type", label: t.type, options: facets.types }, { key: "goal", label: t.goal, options: facets.goals }, { key: "level", label: t.level, options: facets.levels }, { key: "locale", label: t.contentLanguage, options: facets.locales }, { key: "access", label: t.access, options: facets.accesses },
  ];
  return <form action={publicCatalogueHref(locale)} method="get" className="grid gap-5" key={JSON.stringify(query)}>
    {query.q && <input type="hidden" name="q" value={query.q} />}<input type="hidden" name="pageSize" value={query.pageSize ?? 20} />
    {fields.map((field) => { const selected = query[field.key]; const options = field.options.filter((option) => option.count > 0); return <FormField key={field.key} id={`${id}-${field.key}`} label={field.label}><Select name={field.key} defaultValue={selected ?? ""}>
      {field.key !== "locale" && <option value="">{t.all}</option>}{selected && !options.some((option) => option.code === selected) && <option value={selected}>{selectedFilterLabel(locale, field.key, selected)} · {t.unavailableFilter}</option>}{!selected && field.key === "locale" && <option value={locale}>{t.languageNames[locale]}</option>}{options.map((option) => <option key={option.code} value={option.code}>{selectedFilterLabel(locale, field.key, option.code, option.label)} ({option.count})</option>)}
    </Select></FormField>; })}
    <FormField id={`${id}-sort`} label={t.sort}><Select name="sort" defaultValue={query.sort ?? "TITLE"} options={[{ value: "TITLE", label: t.titleSort }, { value: "RECENT", label: t.recentSort }]} /></FormField><Button type="submit">{t.apply}</Button><Link href={publicCatalogueHref(locale)} className="inline-flex min-h-11 items-center justify-center text-sm">{t.reset}</Link>
  </form>;
}
export function PublicCatalogue({ locale, result, facets, query, languageLinks }: { locale: Locale; result: AuthResult<CataloguePage>; facets: AuthResult<CatalogueFacets>; query: CatalogueQuery; languageLinks: LanguageLinks }) {
  const t = getPublicDictionary(locale); const id = useId(); const [filtersOpen, setFiltersOpen] = useState(false); const currentHref = catalogueHref(locale, query);
  const active = (["q", "type", "goal", "level", "locale", "access"] as const).filter((key) => query[key] && (key !== "locale" || query.locale !== locale));
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><header className="max-w-3xl space-y-3"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.catalogue}</h1><p className="text-lg leading-relaxed text-muted-foreground">{t.resourcesLead}</p></header>
    <form action={publicCatalogueHref(locale)} method="get" className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end" key={`search-${currentHref}`}>
      {Object.entries(query).filter(([key, value]) => key !== "q" && key !== "page" && value !== undefined).map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)}
      <FormField id={`${id}-search`} label={t.search} className="flex-1"><Input type="search" name="q" maxLength={240} defaultValue={query.q ?? ""} placeholder={t.searchHint} /></FormField><Button type="submit">{t.searchAction}</Button>
    </form>
    {active.length > 0 && <nav aria-label={t.activeFilters}><ul className="flex flex-wrap gap-2">{active.map((key) => { const value = String(query[key]); const label = selectedFilterLabel(locale, key, value); return <li key={key} className="max-w-full"><Link href={catalogueHref(locale, key === "locale" ? { ...query, locale, page: 0 } : { ...query, [key]: undefined, page: 0 })} aria-label={`${t.removeFilter} : ${label}`} className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-input border border-border bg-surface-subtle px-3 py-2 text-sm no-underline hover:border-brand"><span className="break-words">{label}</span><span aria-hidden="true" className="shrink-0">×</span></Link></li>; })}</ul></nav>}
    <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)]"><aside className="hidden rounded-panel border border-border bg-surface p-5 lg:block"><h2 className="mb-5 text-lg font-semibold">{t.filters}</h2>{facets.ok ? <FilterForm locale={locale} facets={facets.data} query={query} /> : <PublicApiError locale={locale} result={facets} />}</aside>
      <div className="min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3">{result.ok && <p role="status" className="text-sm text-muted-foreground">{result.data.total} {result.data.total === 1 ? t.countOne : t.countMany}</p>}<div className="lg:hidden"><Sheet title={t.filters} description={t.filterDescription} closeLabel={t.close} open={filtersOpen} onOpenChange={setFiltersOpen} trigger={<Button variant="secondary"><SlidersHorizontal size={17} aria-hidden="true" />{t.filters}{active.length > 0 ? ` (${active.length})` : ""}</Button>}>{facets.ok ? <FilterForm locale={locale} facets={facets.data} query={query} /> : <PublicApiError locale={locale} result={facets} />}</Sheet></div></div>
      {!result.ok ? <PublicApiError locale={locale} result={result} /> : <>{result.data.items.length ? <ResourceCards locale={locale} resources={result.data.items} returnTo={currentHref} /> : <div className="space-y-4"><StatusMessage title={t.emptyTitle}>{t.emptyDescription}</StatusMessage><Link href={publicCatalogueHref(locale)} className="inline-flex min-h-11 items-center">{t.reset}</Link></div>}
        {result.data.total > 0 && result.data.page < Math.ceil(result.data.total / result.data.pageSize) && <Pagination page={result.data.page + 1} totalPages={Math.ceil(result.data.total / result.data.pageSize)} label={t.pagination} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.pageLabel} hrefForPage={(page) => catalogueHref(locale, { ...query, page: page - 1 })} />}</>}
      </div>
    </div>
  </div></PublicShell>;
}
