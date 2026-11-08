"use client";

import { useId, useState } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, StatusMessage } from "@/components/ui";
import { domainDictionary } from "@/lib/i18n/domain";
import type { Locale } from "@/lib/i18n/locales";
import type { RubricItem } from "./types";

export function RubricChecklist({ locale, items, initialChecked = [], className }: {
  locale: Locale; items: readonly RubricItem[]; initialChecked?: readonly string[]; className?: string;
}) {
  const t = domainDictionary(locale).rubric;
  const prefix = useId();
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(
    initialChecked.filter((id) => items.some((item) => item.id === id)),
  ));
  const checkedCount = items.filter((item) => checked.has(item.id)).length;
  const blockingRemaining = items.some((item) => item.blocking && !checked.has(item.id));
  return <Card className={className}>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardContent>
      <fieldset>
        <legend className="text-sm leading-relaxed text-muted-foreground">{t.intro}</legend>
        {items.length > 0 ? <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {items.map((item, index) => <label key={item.id} htmlFor={`${prefix}-${index}`}
            className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-4 hover:bg-surface-subtle">
            <input id={`${prefix}-${index}`} type="checkbox" checked={checked.has(item.id)}
              aria-describedby={item.description ? `${prefix}-${index}-description` : undefined}
              onChange={(event) => setChecked((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(item.id); else next.delete(item.id);
                return next;
              })}
              className="mt-1 size-5 shrink-0 cursor-pointer rounded border-control accent-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{item.label}</span>
              {item.description && <span id={`${prefix}-${index}-description`} className="mt-1 block text-sm text-muted-foreground">{item.description}</span>}
              {item.blocking && <Badge tone="warning" className="mt-2">{t.blocking}</Badge>}
            </span>
          </label>)}
        </div> : <p className="mt-4 rounded-lg bg-surface-subtle p-4 text-sm text-muted-foreground">{t.empty}</p>}
      </fieldset>
      {items.length > 0 && <div className="mt-5 space-y-3">
        <p role="status" aria-live="polite" className="text-sm font-semibold">{t.declared} : {checkedCount}/{items.length} {t.unit}</p>
        {blockingRemaining && <StatusMessage tone="warning">{t.remaining}</StatusMessage>}
        {checkedCount === items.length && <StatusMessage tone="info">{t.complete}</StatusMessage>}
      </div>}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.local}</p>
    </CardContent>
  </Card>;
}
