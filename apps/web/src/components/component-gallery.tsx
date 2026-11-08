"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import NextLink from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import {
  Accordion, Badge, Button, Card, Checkbox, ConfirmationDialog, Dialog, EmptyState,
  ErrorState, FormField, Input, Link, Pagination, RadioGroup, SearchField, Select,
  Sheet, Skeleton, StatusMessage, Tabs, TextArea, Toast, Tooltip,
} from "@/components/ui";
import { AccessNotice, OfferSummary, ProgressSummary, ResumeCard, SaveStatus, VersionNotice } from "@/components/domain";
import { getGalleryCopy } from "@/lib/i18n/gallery";
import type { Locale } from "@/lib/i18n/locales";

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return <section aria-labelledby={id} className="space-y-6 border-t border-border py-8 md:py-12"><h2 id={id} className="text-2xl">{title}</h2>{children}</section>;
}

export function ComponentGallery({ locale }: { locale: Locale }) {
  const copy = getGalleryCopy(locale);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState("outline");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  function validate(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = copy.nameError;
    if (!goal.trim()) next.goal = copy.goalError;
    if (!checked) next.consent = copy.consentError;
    setErrors(next);
    setMessage(Object.keys(next).length ? "" : copy.nothingSent);
    // Error attributes are committed on the next frame before focus is moved.
    requestAnimationFrame(() => {
      const first = Object.keys(next)[0];
      if (first) form.current?.querySelector<HTMLElement>(`#example-${first}`)?.focus();
    });
  }
  function reset() {
    setName(""); setGoal(""); setChecked(false); setMode("outline"); setErrors({}); setMessage(copy.cleared);
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] px-4 pb-16 md:px-8">
      <header className="max-w-[var(--reading-max)] space-y-6 py-10 md:py-16">
        <nav aria-label={copy.language} className="flex gap-2">
          {(["fr", "en"] as const).map((language) => <NextLink key={language} href={`/${language}/dev/components`} hrefLang={language} lang={language} aria-current={language === locale ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-input px-3 text-sm no-underline ${language === locale ? "bg-brand-soft font-semibold text-brand" : "text-link"}`}>{language === "fr" ? "Français" : "English"}</NextLink>)}
        </nav>
        <h1 className="text-4xl leading-tight font-semibold md:text-5xl">{copy.title}</h1>
        <p className="text-lg text-muted-foreground">{copy.intro}</p>
      </header>

      <Section id="actions" title={copy.sections.actions}>
        <div className="flex flex-wrap gap-3">
          <Button asChild><NextLink href={`/${locale}/dev/learning#workshop`}>{copy.primary}<ArrowRight size={18} aria-hidden="true" /></NextLink></Button>
          <Button variant="secondary" onClick={() => setToast(true)}>{copy.secondary}</Button>
          <Button variant="ghost" onClick={() => setToast(true)}>{copy.ghost}</Button>
          <Button disabled>{copy.disabled}</Button>
          <Button busy loadingLabel={copy.busy} aria-label={copy.busyLabel}>{copy.primary}</Button>
          <Link href="#form">{copy.inline}</Link>
        </div>
        <div className="flex flex-wrap gap-3">{(["neutral", "brand", "success", "warning", "danger"] as const).map((tone, index) => <Badge key={tone} tone={tone}>{copy.badges[index]}</Badge>)}</div>
      </Section>

      <Section id="form" title={copy.sections.form}>
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <Card className="space-y-6 p-5 md:p-8">
            <div className="space-y-2"><h3 className="text-xl">{copy.formTitle}</h3><p className="text-sm text-muted-foreground">{copy.formIntro}</p></div>
            <form ref={form} onSubmit={validate} noValidate className="space-y-5">
              <FormField id="example-name" label={`${copy.name} · ${copy.required}`} hint={copy.nameHint} error={errors.name} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FormField>
              <FormField id="example-goal" label={`${copy.goal} · ${copy.required}`} hint={copy.goalHint} error={errors.goal} required><TextArea value={goal} rows={4} onChange={(event) => setGoal(event.target.value)} /></FormField>
              <FormField id="example-category" label={copy.category}><Select defaultValue="write"><option value="write">{copy.categoryOptions[0]}</option><option value="analyse">{copy.categoryOptions[1]}</option><option value="verify">{copy.categoryOptions[2]}</option></Select></FormField>
              <RadioGroup label={copy.mode} value={mode} onValueChange={setMode} options={[{ value: "outline", label: copy.modeOptions[0] }, { value: "text", label: copy.modeOptions[1] }]} />
              <div className="space-y-2"><Checkbox id="example-consent" label={copy.consent} checked={checked} onCheckedChange={(value) => setChecked(value === true)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "consent-error" : undefined} />{errors.consent && <p id="consent-error" className="text-sm text-danger">{errors.consent}</p>}</div>
              <Button type="submit">{copy.submit}</Button>
            </form>
            {message && <StatusMessage tone="info" title={message} />}
          </Card>
          <div className="space-y-6"><SearchField id="gallery-search" label={copy.search} placeholder={copy.searchPlaceholder} /><p className="rounded-panel border border-border p-5 text-sm text-muted-foreground">{copy.longText}</p></div>
        </div>
      </Section>

      <Section id="overlays" title={copy.sections.overlays}>
        <div className="flex flex-wrap gap-3">
          <Dialog trigger={<Button variant="secondary">{copy.dialog}</Button>} title={copy.dialogTitle} description={copy.dialogDescription} closeLabel={copy.close}><p>{copy.dialogBody}</p></Dialog>
          <Sheet trigger={<Button variant="secondary">{copy.sheet}</Button>} title={copy.sheetTitle} description={copy.sheetDescription} closeLabel={copy.close}><p>{copy.sheetBody}</p></Sheet>
          <ConfirmationDialog trigger={<Button variant="destructive">{copy.confirm}</Button>} title={copy.confirmTitle} description={copy.confirmBody} confirmLabel={copy.confirmAction} cancelLabel={copy.cancel} onConfirm={reset} />
          <Tooltip trigger={<Button variant="ghost"><CircleHelp aria-hidden="true" size={18} />{copy.tooltip}</Button>} content={copy.tooltipBody} />
        </div>
      </Section>

      <Section id="reading" title={copy.sections.reading}>
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <Tabs label={copy.sections.reading} defaultValue="brief" items={["brief", "write", "verify"].map((value, index) => ({ value, label: copy.tabs[index], content: <p className="py-4">{copy.tabBodies[index]}</p> }))} />
          <Accordion items={[{ value: "verify", title: copy.faqTitle, content: copy.faqBody }]} />
        </div>
        <Pagination page={page} totalPages={3} label={copy.pagination} previousLabel={copy.previous} nextLabel={copy.next} pageLabel={`${copy.page} {page} ${copy.of} {total}`} onPageChange={setPage} />
      </Section>

      <Section id="feedback" title={copy.sections.feedback}>
        <div className="grid gap-6 md:grid-cols-2">
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
          <ErrorState title={copy.errorTitle} description={copy.errorBody} retryLabel={copy.retry} onRetry={() => setMessage(copy.retried)} />
          <div role="status" aria-label={copy.loading} className="space-y-4 rounded-panel border border-border p-6"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
          <div className="space-y-4"><Button variant="secondary" onClick={() => setToast(true)}>{copy.toastAction}</Button><StatusMessage tone="warning" title={copy.domainIntro} /></div>
        </div>
      </Section>

      <Section id="domain" title={copy.sections.domain}>
        <p className="max-w-[var(--reading-max)] text-muted-foreground">{copy.domainIntro}</p>
        <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(["unknown", "saving", "error", "conflict"] as const).map((kind) => <SaveStatus key={kind} locale={locale} state={{ kind }} />)}
          <SaveStatus locale={locale} state={{ kind: "local" }} />
          <VersionNotice locale={locale} state={{ kind: "update-available", version: "2" }} />
          {(["login-required", "payment-required", "expired", "revoked", "translation-missing", "unknown"] as const).map((state) => <AccessNotice key={state} locale={locale} state={state} />)}
          <OfferSummary locale={locale} title={copy.resumeTitle} items={[]} state={{ kind: "unknown" }} />
          <ProgressSummary locale={locale} state={{ kind: "empty" }} />
          <ResumeCard locale={locale} state={{ kind: "empty" }} />
        </div>
      </Section>
      <Toast open={toast} onOpenChange={setToast} title={copy.toastTitle} description={copy.toastBody} label={copy.toastTitle} closeLabel={copy.dismiss} />
    </main>
  );
}
