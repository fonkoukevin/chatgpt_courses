"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, SearchField, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import { listContents } from "@/lib/api/cms-client";
import type { ContentPage } from "@/lib/api/generated/types.gen";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import { getCmsChildrenDictionary } from "@/lib/i18n/cms-children";
import type { Locale } from "@/lib/i18n/locales";
import { CmsError } from "./parts";

export type ChildVersionPickerProps = {
  locale: Locale;
  parentKind: "COURSE" | "MODULE";
  contentLocale: "fr" | "en";
  selected: string[];
  onAdd: (versionId: string) => void;
  /** Merge these labels with previously known pages; this is not the complete catalogue. */
  onLabels?: (labels: Record<string, string>) => void;
};

/** Changing type/language starts a fresh bounded search, including pending request guards. */
export function ChildVersionPicker(props: ChildVersionPickerProps) {
  return <ChildVersions key={`${props.parentKind}:${props.contentLocale}`} {...props} />;
}

function ChildVersions({ locale, parentKind, contentLocale, selected, onAdd, onLabels }: ChildVersionPickerProps) {
  const text = getCmsChildrenDictionary(locale), cms = getCmsDictionary(locale);
  const inputId = useId();
  const kind = parentKind === "COURSE" ? "MODULE" : "ACTIVITY";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ q: "", page: 0 });
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; result: AuthResult<ContentPage> } | null>(null);
  const labelCallback = useRef(onLabels);
  const requestKey = JSON.stringify([kind, contentLocale, query.q, query.page, attempt, locale]);
  const result = response?.key === requestKey ? response.result : null;
  const pending = result === null;
  const selectedIds = new Set(selected.map((id) => id.trim().toLowerCase()).filter(Boolean));
  const maximum = selectedIds.size >= 100;

  useEffect(() => { labelCallback.current = onLabels; }, [onLabels]);
  useEffect(() => {
    let current = true;
    void listContents({ kind, locale: contentLocale, q: query.q || undefined, page: query.page, size: 20 }).then((loaded) => {
      if (!current) return;
      // A response which does not honor these filters must not become a selectable child.
      if (loaded.ok && loaded.data.items.some((item) => item.kind !== kind || item.locale !== contentLocale)) {
        setResponse({ key: requestKey, result: { ok: false, error: { kind: "invalid-response", status: loaded.status } } });
        return;
      }
      setResponse({ key: requestKey, result: loaded });
      if (loaded.ok) {
        const labels = Object.fromEntries(loaded.data.items.map((item) => [item.versionId, `${item.title} · ${text.version.replace("{n}", String(item.versionNumber))}`]));
        labelCallback.current?.(labels);
      }
    });
    return () => { current = false; };
  }, [contentLocale, kind, query.q, query.page, requestKey, text.version]);

  function searchVersions() { setQuery({ q: search.trim(), page: 0 }); setAttempt((value) => value + 1); }
  const page = result?.ok ? result.data.page : query.page;
  const pages = result?.ok ? Math.max(1, Math.ceil(result.data.total / result.data.size)) : 1;

  return <fieldset className="min-w-0 space-y-4 rounded-panel border border-border bg-surface-subtle p-4" aria-busy={pending}>
    <legend className="max-w-full px-1 font-semibold">{parentKind === "COURSE" ? text.modules : text.activities}</legend>
    <p className="text-sm leading-relaxed text-muted-foreground">{text.description}</p>
    <div role="search" aria-label={text.search} className="space-y-3">
      <SearchField id={inputId} label={text.search} hint={text.searchHint} maxLength={240} value={search}
        onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchVersions(); } }} />
      <Button variant="secondary" onClick={searchVersions}>{text.apply}</Button>
    </div>
    {pending && <p role="status" className="text-sm text-muted-foreground">{text.loading}</p>}
    {result && !result.ok && <CmsError locale={locale} error={result.error} returnTo={cmsPath(locale)} retry={() => setAttempt((value) => value + 1)} />}
    {maximum && <StatusMessage tone="warning">{text.maximum}</StatusMessage>}
    {result?.ok && <>
      <p role="status" className="text-sm text-muted-foreground">{(result.data.total === 1 ? text.one : text.many).replace("{n}", String(result.data.total))}</p>
      {result.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{text.empty}</p> : <ul className="space-y-3">
        {result.data.items.map((item) => {
          const added = selectedIds.has(item.versionId.toLowerCase());
          const version = text.version.replace("{n}", String(item.versionNumber));
          return <li key={item.versionId} className="flex min-w-0 flex-wrap items-start gap-3 rounded-input border border-border bg-surface p-3">
            <div className="min-w-0 flex-1 basis-40 space-y-2"><p className="break-words font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{version} · {item.locale.toUpperCase()}</p>
              <Badge tone={item.state === "PUBLISHED" ? "success" : item.state === "STALE" ? "warning" : "neutral"}>{cms.state[item.state]}</Badge>
            </div>
            <Button variant="secondary" disabled={added || maximum} aria-label={`${added ? text.added : text.add} · ${item.title} · ${version}`}
              onClick={() => { if (!added && !maximum) onAdd(item.versionId); }}>{added ? text.added : text.add}</Button>
          </li>;
        })}
      </ul>}
      <nav aria-label={text.pagination} className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={page <= 0} onClick={() => setQuery((value) => ({ ...value, page: Math.max(0, value.page - 1) }))}>{text.previous}</Button>
        <span className="text-sm text-muted-foreground">{text.page.replace("{page}", String(page + 1)).replace("{total}", String(pages))}</span>
        <Button variant="secondary" disabled={page + 1 >= pages || page >= 1_000_000} onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))}>{text.next}</Button>
      </nav>
    </>}
  </fieldset>;
}
