"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/layouts";
import { Badge, Button, Checkbox, ConfirmationDialog, Dialog, EmptyState, FormField, Input, Link, Pagination, SearchField, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import { contentQueryString, type ContentQuery } from "@/lib/api/cms-client";
import type { ContentPage, CreateContent } from "@/lib/api/generated/types.gen";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { CreateContentForm } from "./create-form";
import { cmsNavigation, CmsError, formatCmsInstant } from "./parts";

export function ContentCatalogue({ locale, initial, query, permissions }: { locale: Locale; initial: AuthResult<ContentPage>; query: ContentQuery; permissions: string[] }) {
  const text = getCmsDictionary(locale); const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false); const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateContent | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(Boolean(query.needsUpdate));
  const select = (values: Record<string, string>) => [{ value: "", label: text.all }, ...Object.entries(values).map(([value, label]) => ({ value, label }))];
  useEffect(() => {
    if (!createDraft) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(text.unsavedLeave)) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [createDraft, text.unsavedLeave]);
  return <AdminLayout locale={locale} title={text.title} description={text.introduction} product={cmsNavigation(locale)}>
    {permissions.includes("content.write") && <div className="mb-6"><Dialog open={createOpen} onOpenChange={(open) => { if (!creating) setCreateOpen(open); }} title={text.create} description={text.versionHelp} closeLabel={text.close} className="max-w-3xl" trigger={<Button>{text.create}</Button>}>
      <CreateContentForm locale={locale} initialDraft={createDraft} onDraftChange={setCreateDraft} onBusyChange={setCreating} onCreated={(content) => { setCreateDraft(null); setCreateOpen(false); router.push(cmsPath(locale, content.id)); router.refresh(); }} />
      {createDraft && !creating && <div className="mt-5"><ConfirmationDialog title={text.discardDraft} description={text.unsavedLeave} confirmLabel={text.confirm} cancelLabel={text.cancel} trigger={<Button variant="ghost">{text.discardDraft}</Button>} onConfirm={() => { setCreateDraft(null); setCreateOpen(false); }} /></div>}
    </Dialog></div>}
    <form method="get" action={cmsPath(locale)} onSubmit={() => setSubmitting(true)} aria-busy={submitting} id="cms-filters" className="mb-7 space-y-5 rounded-panel border border-border bg-surface p-4 sm:p-6">
      <SearchField id="cms-search" name="q" label={text.search} hint={text.searchHint} defaultValue={query.q ?? ""} maxLength={240} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <FormField id="cms-filter-kind" label={text.type}><Select name="kind" defaultValue={query.kind ?? ""} options={select(text.kind)} /></FormField>
        <FormField id="cms-filter-state" label={text.status}><Select name="state" defaultValue={query.state ?? ""} options={select(text.state)} /></FormField>
        <FormField id="cms-filter-locale" label={text.language}><Select name="locale" defaultValue={query.locale ?? ""} options={[{ value: "", label: text.all }, { value: "fr", label: "Français" }, { value: "en", label: "English" }]} /></FormField>
        <FormField id="cms-filter-course" label={text.course}><Input name="courseId" defaultValue={query.courseId ?? ""} /></FormField>
        <FormField id="cms-filter-date" label={text.verifiedBefore}><Input name="verifiedBefore" type="date" defaultValue={query.verifiedBefore?.slice(0, 10) ?? ""} /></FormField>
      </div>
      <Checkbox id="cms-filter-stale" label={text.needsUpdate} checked={needsUpdate} onCheckedChange={(value) => setNeedsUpdate(value === true)} />
      {needsUpdate && <input type="hidden" name="needsUpdate" value="true" />}
      <input type="hidden" name="size" value={query.size ?? 20} />
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" busy={submitting} loadingLabel={text.loading}>{text.filter}</Button><Link href={cmsPath(locale)} prefetch={false}>{text.clearFilters}</Link></div>
    </form>
    {!initial.ok ? <CmsError error={initial.error} locale={locale} returnTo={cmsPath(locale)} retry={() => router.refresh()} />
      : initial.data.items.length === 0 ? <EmptyState title={text.emptyTitle} description={text.emptyBody} />
        : <div className="space-y-5"><p role="status" className="text-sm text-muted-foreground">{initial.data.total === 1 ? text.totalOne : text.total.replace("{n}", String(initial.data.total))}</p>
          <Table><TableHeader><TableRow><TableHead>{text.contentTitle}</TableHead><TableHead className="hidden sm:table-cell">{text.type}</TableHead><TableHead className="hidden sm:table-cell">{text.language}</TableHead><TableHead className="hidden md:table-cell">{text.version}</TableHead><TableHead className="hidden xl:table-cell">{text.lastReview}</TableHead><TableHead>{text.edit}</TableHead></TableRow></TableHeader>
            <TableBody>{initial.data.items.map((item) => <TableRow key={item.id}><TableCell className="min-w-32 sm:min-w-40"><Link href={cmsPath(locale, item.id)} prefetch={false} className="break-words font-medium">{item.title}</Link><div className="mt-2"><Badge tone={item.state === "PUBLISHED" ? "success" : item.state === "STALE" ? "warning" : "neutral"}>{text.state[item.state]}</Badge></div><p className="mt-2 text-sm text-muted-foreground sm:hidden">{text.kind[item.kind]} · {item.locale.toUpperCase()}</p></TableCell>
              <TableCell className="hidden sm:table-cell">{text.kind[item.kind]}</TableCell><TableCell className="hidden sm:table-cell">{item.locale.toUpperCase()}</TableCell><TableCell className="hidden md:table-cell">{item.versionNumber}</TableCell><TableCell className="hidden xl:table-cell">{formatCmsInstant(item.verifiedAt, locale)}</TableCell><TableCell><Link href={cmsPath(locale, item.id)} prefetch={false}>{text.edit}</Link></TableCell></TableRow>)}</TableBody></Table>
          <Pagination page={initial.data.page + 1} totalPages={Math.max(1, Math.ceil(initial.data.total / initial.data.size))} label={text.pagination} previousLabel={text.previous} nextLabel={text.next} pageLabel={text.page} hrefForPage={(page) => `${cmsPath(locale)}?${contentQueryString({ ...query, page: page - 1 })}`} />
        </div>}
  </AdminLayout>;
}
