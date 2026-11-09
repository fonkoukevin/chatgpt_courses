"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, ConfirmationDialog, Dialog, FormField, Input, StatusMessage, TextArea } from "@/components/ui";
import { AccountNotice, AccountTextCopy } from "@/components/account/parts";
import { useUnsavedInput } from "@/components/learning/unsaved";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { ContentView } from "@/lib/api/generated/types.gen";
import { getContent, renameContentSlug } from "@/lib/api/cms-client";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsSlugDictionary } from "@/lib/i18n/cms-slug";
import { localeName, unsavedChangesMessage, type Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { CmsError } from "./parts";

type Props = { locale: Locale; expectedAccountId: string; content: ContentView; etag: string; disabled?: boolean; onSaved: (value: ContentView, etag: string) => void; onDirtyChange: (dirty: boolean) => void };
export function SlugEditor({ locale, expectedAccountId, content, etag, disabled, onSaved, onDirtyChange }: Props) {
  const t = getCmsSlugDictionary(locale), id = useId(), destination = cmsPath(locale, content.id);
  const { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(content.slug), [baseline, setBaseline] = useState(content.slug), [baseEtag, setBaseEtag] = useState(etag), [reason, setReason] = useState("");
  const [error, setError] = useState<ApiError | null>(null), [current, setCurrent] = useState<AuthResult<ContentView> | null>(null);
  const [saved, setSaved] = useState(false), [invalid, setInvalid] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const lock = useRef(false), sequence = useRef(0), life = useRef(0), nameInput = useRef<HTMLInputElement>(null), reasonInput = useRef<HTMLTextAreaElement>(null);
  const dirty = slug !== baseline || reason !== "", validSlug = slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), validReason = Boolean(reason.trim()) && [...reason].length <= 1000;
  useEffect(() => () => { life.current++; sequence.current++; }, []);
  useEffect(() => { onDirtyChange(dirty || busy); }, [dirty, busy, onDirtyChange]);
  useUnsavedInput(dirty || busy, unsavedChangesMessage(locale), boundary);
  function reset() { sequence.current++; setSlug(content.slug); setBaseline(content.slug); setBaseEtag(etag); setReason(""); setCurrent(null); setError(null); setSaved(false); setInvalid(false); setUnconfirmed(false); }
  function panel(value: boolean) { if (lock.current) return; if (value && !dirty) reset(); setOpen(value); }
  function prepare(value: boolean) { if (lock.current) return; if (value && (!validSlug || !validReason || disabled || account.status !== "active" || current)) { setInvalid(true); (validSlug ? reasonInput : nameInput).current?.focus(); return; } setConfirm(value); }
  async function readCurrent() {
    const attempt = ++sequence.current, scope = boundary.capture();
    const result = await getContent(content.id);
    if (attempt !== sequence.current || !boundary.isCurrent(scope)) return;
    setCurrent(result); if (!result.ok) boundary.fail(result.error);
  }
  function adopt(keepLocal: boolean) {
    if (!current?.ok || !current.etag || account.status !== "active") return;
    sequence.current++; setBaseline(current.data.slug); setBaseEtag(current.etag); if (!keepLocal) { setSlug(current.data.slug); setReason(""); }
    setError(null); setSaved(false); setInvalid(false); setCurrent(null); onSaved(current.data, current.etag);
  }
  async function save() {
    if (lock.current || disabled || account.status !== "active" || !account.accountId || !validSlug || !validReason || current) return;
    lock.current = true; setBusy(true); setSaved(false); setError(null); setUnconfirmed(false);
    const attempt = ++sequence.current, lifetime = life.current, scope = boundary.capture();
    try {
      const result = await renameContentSlug(content.id, baseEtag, { slug, reason }, expectedAccountId);
      if (attempt !== sequence.current) return;
      if (!boundary.isCurrent(scope)) { setUnconfirmed(true); return; }
      if (result.ok && result.etag) { setBaseline(result.data.slug); setSlug(result.data.slug); setBaseEtag(result.etag); setReason(""); setCurrent(null); setSaved(true); setConfirm(false); onSaved(result.data, result.etag); }
      else if (!result.ok) { setError(result.error); boundary.fail(result.error); if (result.error.status === 412) { setConfirm(false); await readCurrent(); } }
    } finally { lock.current = false; if (lifetime === life.current) setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); prepare(true); }
  const reserved = error?.kind === "http" && error.problem?.code === "SLUG_ALREADY_RESERVED";
  const discard = <ConfirmationDialog title={t.discard} description={t.discardHelp} confirmLabel={t.discard} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="ghost" disabled={busy} className="max-w-full whitespace-normal">{t.discard}</Button>} onConfirm={reset} />;
  return <section data-cms-slug className="space-y-3">
    <Dialog open={open} onOpenChange={panel} title={t.title} description={t.help} closeLabel={t.close} trigger={<Button variant="secondary" disabled={disabled && !dirty} className="max-w-full whitespace-normal">{t.open}</Button>}>
      <div className="space-y-5"><AccountNotice locale={locale} account={account} boundary={boundary} destination={destination} /><p className="text-sm text-muted-foreground">{localeName(content.locale)} · {t.permission}</p>{disabled && <StatusMessage tone="warning">{t.parentBusy}</StatusMessage>}
        <form data-cms-slug-form onSubmit={submit} noValidate aria-busy={busy} className="space-y-4">
          <p className="break-all text-sm">{t.before} : {baseline}</p><FormField id={`${id}-slug`} label={t.slug} hint={t.format} required error={invalid && !validSlug ? t.required : undefined}><Input ref={nameInput} value={slug} maxLength={180} autoCapitalize="none" spellCheck={false} disabled={busy || disabled || account.status !== "active"} onChange={event => { setSlug(event.target.value); setSaved(false); setInvalid(false); }} /></FormField>
          <FormField id={`${id}-reason`} label={t.reason} required error={invalid && !validReason ? t.required : undefined}><TextArea ref={reasonInput} value={reason} rows={3} disabled={busy || disabled || account.status !== "active"} onChange={event => { setReason(event.target.value); setSaved(false); setInvalid(false); }} /></FormField>
          <div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.confirmTitle} description={t.confirmHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} open={confirm} onOpenChange={prepare} busy={busy} trigger={<Button type="button" className="max-w-full whitespace-normal" disabled={disabled || busy || account.status !== "active" || Boolean(current)}>{t.confirm}</Button>} onConfirm={event => { event.preventDefault(); void save(); }}><div className="space-y-3"><p className="break-all">{t.before} : {baseline}</p><p className="break-all">{t.after} : {slug}</p><p className="whitespace-pre-wrap break-words">{reason}</p>{error && <CmsError locale={locale} error={error} returnTo={destination} />}</div></ConfirmationDialog>{discard}</div>
          {invalid && <StatusMessage tone="danger">{t.required}</StatusMessage>}{error && (reserved || error.status === 412 ? <StatusMessage tone="danger">{reserved ? t.reserved : t.conflict}</StatusMessage> : <CmsError locale={locale} error={error} returnTo={destination} />)}{saved && <StatusMessage tone="success">{t.saved}</StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.unconfirmed}</StatusMessage>}
        </form>
        {current && <section className="space-y-4 rounded-input border border-control p-4">{current.ok ? <><h3 className="font-semibold">{t.server}</h3><p className="break-all">{current.data.slug}</p><div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.useServer} description={t.discardHelp} confirmLabel={t.useServer} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.useServer}</Button>} onConfirm={() => adopt(false)} /><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => adopt(true)}>{t.keepLocal}</Button></div></> : <CmsError locale={locale} error={current.error} returnTo={destination} retry={() => void readCurrent()} />}</section>}
        <Button variant="secondary" onClick={() => void readCurrent()} disabled={busy || account.status !== "active"}>{t.read}</Button>{dirty && <AccountTextCopy locale={locale} value={JSON.stringify({ slug, reason }, null, 2)} />}
      </div>
    </Dialog>
    {dirty && !open && <StatusMessage tone="warning"><p>{t.modified}</p>{discard}</StatusMessage>}
  </section>;
}
