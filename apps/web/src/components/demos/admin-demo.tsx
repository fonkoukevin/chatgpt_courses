"use client";

import { useRef, useState } from "react";
import { Eye, FileText, ListFilter } from "lucide-react";
import { AdminLayout } from "@/components/layouts";
import { Badge, Button, FormField, SearchField, Select, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { contentFixtures, type EditorialState } from "./fixtures";

export function AdminDemo({ locale }: { locale: Locale }) {
  const { admin: text } = getShowcaseDictionary(locale);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<EditorialState | "all">("all");
  const [selectedId, setSelectedId] = useState(contentFixtures[0].id);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const needle = query.trim().toLocaleLowerCase(locale);
  const filtered = contentFixtures.filter((item) => (state === "all" || item.state === state)
    && `${item.title[locale]} ${item.id}`.toLocaleLowerCase(locale).includes(needle));
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const reset = () => { setQuery(""); setState("all"); };
  return <div data-showcase-fixture="admin"><AdminLayout locale={locale}>
    <p className="mb-6 rounded-input border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">{text.notice}</p>
    <section aria-labelledby="admin-filter-title" className="mb-6 rounded-panel border border-border bg-surface p-4 sm:p-6">
      <h2 id="admin-filter-title" className="mb-4 flex items-center gap-2 text-base font-semibold"><ListFilter size={19} aria-hidden="true" />{text.filterTitle}</h2>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <SearchField id="content-search" label={text.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPlaceholder} />
        <FormField id="content-state" label={text.status}><Select id="content-state" value={state} onChange={(event) => setState(event.target.value as EditorialState | "all")} options={[{ value: "all", label: text.allStatuses }, ...(["draft", "review", "ready", "archived"] as const).map((value) => ({ value, label: text[value] }))]} /></FormField>
      </div>
    </section>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="content-library-title" className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-5 sm:px-6"><h2 id="content-library-title" className="text-base font-semibold">{text.tableTitle}</h2><p role="status" className="text-[0.8125rem] text-muted-foreground">{filtered.length} {filtered.length === 1 ? text.result : text.results}</p></div>
        {filtered.length ? <div className="overflow-x-auto"><Table>
          <TableCaption>{text.tableCaption}</TableCaption>
          <TableHeader><TableRow><TableHead scope="col">{text.name}</TableHead><TableHead scope="col" className="hidden md:table-cell">{text.type}</TableHead><TableHead scope="col" className="hidden sm:table-cell">{text.language}</TableHead><TableHead scope="col" className="hidden sm:table-cell">{text.state}</TableHead><TableHead scope="col"><span className="sr-only">{text.action}</span></TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((item) => <TableRow key={item.id} className={selected?.id === item.id ? "bg-brand-soft/40" : undefined}>
            <TableCell className="max-w-64 break-words"><span className="text-sm font-medium">{item.title[locale]}</span><span className="mt-1 hidden text-[0.8125rem] text-muted-foreground lg:block">{item.id}</span><span className="mt-2 block sm:hidden"><span className="sr-only">{text.state} : </span><Badge tone={item.state === "review" ? "warning" : "neutral"} className="whitespace-nowrap">{text[item.state]}</Badge></span></TableCell>
            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{text[item.type]}</TableCell>
            <TableCell className="hidden text-sm sm:table-cell">FR · EN</TableCell>
            <TableCell className="hidden sm:table-cell"><Badge tone={item.state === "review" ? "warning" : "neutral"} className="whitespace-nowrap">{text[item.state]}</Badge></TableCell>
            <TableCell><Button variant="ghost" size="icon" aria-label={`${text.view} : ${item.title[locale]}`} aria-controls="content-detail" onClick={() => { setSelectedId(item.id); requestAnimationFrame(() => detailTitle.current?.focus()); }}><Eye size={18} aria-hidden="true" /></Button></TableCell>
          </TableRow>)}</TableBody>
        </Table></div> : <div className="space-y-4 p-6 text-center sm:p-8"><FileText size={26} aria-hidden="true" className="mx-auto text-muted-foreground" /><h3 className="text-lg font-semibold">{text.empty}</h3><p className="text-sm text-muted-foreground">{text.emptyBody}</p><Button variant="secondary" onClick={reset}>{text.reset}</Button></div>}
      </section>
      <section id="content-detail" aria-labelledby="content-detail-title" className="min-w-0 rounded-panel border border-border bg-surface-subtle p-5">
        <h2 ref={detailTitle} id="content-detail-title" tabIndex={-1} className="rounded-input text-base font-semibold">{text.detailTitle}</h2>
        {selected ? <div className="mt-5 space-y-5"><h3 className="text-lg font-semibold leading-snug">{selected.title[locale]}</h3><dl className="space-y-4 text-sm"><div><dt className="text-[0.8125rem] text-muted-foreground">{text.identifier}</dt><dd className="mt-1 break-words font-mono text-[0.8125rem]">{selected.id}</dd></div><div><dt className="text-[0.8125rem] text-muted-foreground">{text.editorialState}</dt><dd className="mt-1">{text[selected.state]}</dd></div><div><dt className="text-[0.8125rem] text-muted-foreground">{text.translationState}</dt><dd className="mt-1">{text.translated}</dd></div><div><dt className="text-[0.8125rem] text-muted-foreground">{text.revision}</dt><dd className="mt-1">{selected.revision}</dd></div></dl><div className="border-t border-border pt-4"><h3 className="text-sm font-semibold">{text.readiness}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text.readinessBody}</p></div><div className="border-t border-border pt-4"><h3 className="text-sm font-semibold">{text.commercial}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text.commercialBody}</p></div></div> : <p className="mt-4 text-sm text-muted-foreground">{text.selectHint}</p>}
      </section>
    </div>
  </AdminLayout></div>;
}
