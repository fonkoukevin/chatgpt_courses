import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, StatusMessage } from "@/components/ui";
import { domainDictionary } from "@/lib/i18n/domain";
import type { Locale } from "@/lib/i18n/locales";
import type { AccessState, DomainAction, OfferState, ProgressState, ResumeState, SaveState, VersionState } from "./types";

type CommonProps = { locale: Locale; className?: string };

function accessTone(state: AccessState) {
  if (state === "granted") return "success";
  if (state === "error" || state === "revoked") return "danger";
  if (["required", "login-required", "payment-required", "expired"].includes(state)) return "warning";
  return "neutral";
}

export function AccessNotice({ locale, state, action, className }: CommonProps & {
  state: AccessState; action?: DomainAction;
}) {
  const t = domainDictionary(locale);
  const tone = accessTone(state);
  return <StatusMessage tone={tone === "neutral" ? "info" : tone} title={t.access[state]} className={className}>
    <p>{t.accessDetail[state]}</p>
    {action && <Link href={action.href} className="mt-3 inline-flex min-h-11 items-center font-medium underline">{action.label}</Link>}
  </StatusMessage>;
}

export function CourseCard({ locale, title, description, outcome, category, href, access, className }: CommonProps & {
  title: string; description: string; outcome: string; category?: string; href?: string; access: AccessState;
}) {
  const t = domainDictionary(locale);
  return <Card className={`flex min-w-0 flex-col ${className ?? ""}`}>
    <CardHeader>
      <div className="mb-2 flex flex-wrap gap-2">
        {category && <Badge tone="brand">{category}</Badge>}
        <Badge tone={accessTone(access)}>{t.access[access]}</Badge>
      </div>
      <CardTitle className="text-xl">{title}</CardTitle>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col gap-5">
      <div className="rounded-lg bg-surface-subtle p-4">
        <p className="text-sm font-semibold text-muted-foreground">{t.course.outcome}</p>
        <p className="mt-1 text-sm font-medium">{outcome}</p>
      </div>
      <div className="mt-auto">
        {href ? <Button asChild variant="secondary"><Link href={href}>{t.course.discover}</Link></Button>
          : <p className="text-sm text-muted-foreground">{t.course.unavailable}</p>}
      </div>
    </CardContent>
  </Card>;
}

function isValidProgress(completed: number, total: number) {
  return Number.isSafeInteger(completed) && Number.isSafeInteger(total)
    && total > 0 && completed >= 0 && completed <= total;
}

export function ProgressSummary({ locale, state, label, className }: CommonProps & {
  state: ProgressState; label?: string;
}) {
  const t = domainDictionary(locale).progress;
  const valid = state.kind === "ready" && isValidProgress(state.completed, state.total);
  if (!valid || state.kind !== "ready") {
    const kind = state.kind === "ready" ? "unknown" : state.kind;
    return <div className={`rounded-xl border border-border bg-surface-subtle p-4 ${className ?? ""}`}
      aria-busy={kind === "loading"}>
      <p className="text-sm font-medium">{label ?? t.title}</p>
      <p className={`mt-1 text-sm ${kind === "error" ? "text-danger" : "text-muted-foreground"}`}>{t[kind]}</p>
    </div>;
  }
  const numbers = new Intl.NumberFormat(locale);
  return <div className={`space-y-3 ${className ?? ""}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="font-medium">{label ?? t.title}</span>
      <span className="text-muted-foreground">{numbers.format(state.completed)} {t.of} {numbers.format(state.total)} {t.unit}</span>
    </div>
    <progress max={state.total} value={state.completed} aria-label={label ?? t.title}
      className="block h-2.5 w-full overflow-hidden rounded-full bg-surface-hover accent-brand [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-surface-hover [&::-webkit-progress-value]:bg-brand" />
    <p className="text-sm leading-relaxed text-muted-foreground">{t.declared}</p>
  </div>;
}

function isConfirmationTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function SaveStatus({ locale, state, className }: CommonProps & { state: SaveState }) {
  const t = domainDictionary(locale).save;
  const validSaved = state.kind === "saved" && isConfirmationTimestamp(state.confirmedAt);
  const kind = state.kind === "saved" && !validSaved ? "unknown" : state.kind;
  const detail = kind === "local" ? t.localDetail : kind === "error" ? t.errorDetail
    : kind === "conflict" ? t.conflictDetail : undefined;
  return <div role="status" aria-live="polite" aria-busy={kind === "saving"}
    className={`rounded-lg border border-border px-4 py-3 text-sm ${kind === "error" ? "bg-danger-soft text-danger"
      : kind === "conflict" ? "bg-warning-soft text-warning" : kind === "saved" ? "bg-success-soft text-success"
        : "bg-surface-subtle text-muted-foreground"} ${className ?? ""}`}>
    <p className="font-medium">{t[kind]}</p>
    {detail && <p className="mt-1 text-sm leading-relaxed">{detail}</p>}
    {validSaved && state.kind === "saved" && <p className="mt-1 text-sm">
      {t.confirmed} <time dateTime={state.confirmedAt}>{new Intl.DateTimeFormat(locale, {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
      }).format(new Date(state.confirmedAt))} UTC</time>
    </p>}
  </div>;
}

export function VersionNotice({ locale, state, action, className }: CommonProps & {
  state: VersionState; action?: DomainAction;
}) {
  const t = domainDictionary(locale).version;
  return <div className={`rounded-xl border border-border bg-surface-subtle p-4 text-sm ${className ?? ""}`}
    aria-busy={state.kind === "loading"}>
    <p className="font-medium">{t[state.kind]}{" "}
      {"version" in state && <span className="text-muted-foreground">{state.version}</span>}
    </p>
    {(state.kind === "update-available" || state.kind === "archived")
      && <p className="mt-1 text-muted-foreground">{t.preserved}</p>}
    {state.kind === "translation-missing" && <p className="mt-1 text-muted-foreground">
      {t.available} : {t.languages[state.availableLocale]}
    </p>}
    {action && <Link href={action.href} className="mt-2 inline-flex min-h-11 items-center font-medium underline">{action.label}</Link>}
  </div>;
}

export function ResumeCard({ locale, state, className }: CommonProps & { state: ResumeState }) {
  const t = domainDictionary(locale).resume;
  return <Card className={className}>
    <CardHeader><p className="text-sm font-medium text-brand">{t.title}</p>
      <CardTitle className="text-xl">{state.kind === "ready" ? state.title : t[state.kind]}</CardTitle>
    </CardHeader>
    <CardContent>
      {state.kind === "ready" ? <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{state.activity}</p>
        {state.progress && <ProgressSummary locale={locale} state={{ kind: "ready", ...state.progress }} />}
        <Button asChild><Link href={state.href}>{t.action}</Link></Button>
      </div> : state.kind === "empty" && <p className="text-sm text-muted-foreground">{t.emptyDetail}</p>}
    </CardContent>
  </Card>;
}

function formatPrice(locale: Locale, price: { amountMinor: number; currency: string }) {
  if (!price || !Number.isSafeInteger(price.amountMinor) || price.amountMinor < 0 || !/^[A-Z]{3}$/.test(price.currency)) return null;
  try {
    const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: price.currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(price.amountMinor / 10 ** digits);
  } catch { return null; }
}

export function OfferSummary({ locale, title, items, state, className }: CommonProps & {
  title: string; items: readonly string[]; state: OfferState;
}) {
  const t = domainDictionary(locale).offer;
  const price = state.kind === "ready" ? formatPrice(locale, state.price) : null;
  const isReady = state.kind === "ready" && price !== null && Array.isArray(state.conditions) && state.conditions.length > 0;
  return <Card className={className}>
    <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      {items.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {isReady && state.kind === "ready" ? <>
        <p className="text-3xl font-semibold tracking-tight text-brand">{price}</p>
        <div><p className="mb-2 text-sm font-semibold">{t.conditions}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {state.conditions.map((condition, index) => <li key={index}>{condition}</li>)}
          </ul>
        </div>
        {state.action && <Button asChild><Link href={state.action.href}>{state.action.label}</Link></Button>}
      </> : <StatusMessage tone="info" title={t[state.kind === "ready" ? "unknown" : state.kind]}>
        <p>{t.incomplete}</p>
      </StatusMessage>}
    </CardContent>
  </Card>;
}
