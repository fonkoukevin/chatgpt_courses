"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Checkbox, ConfirmationDialog, Dialog, FormField, Input, Select, StatusMessage, TextArea } from "@/components/ui";
import { getContent, saveContentMetadata } from "@/lib/api/cms-client";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { ContentView, PublicMetadata } from "@/lib/api/generated/types.gen";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsMetadataDictionary } from "@/lib/i18n/cms-metadata";
import type { Locale } from "@/lib/i18n/locales";
import { CmsError } from "./parts";

type Props = { locale: Locale; content: ContentView; etag: string; disabled?: boolean; onSaved: (value: ContentView, etag: string) => void; onDirtyChange?: (dirty: boolean) => void };
const clone = (value: PublicMetadata) => structuredClone(value);
const same = (left: PublicMetadata, right: PublicMetadata) => JSON.stringify(left) === JSON.stringify(right);

export function MetadataEditor({ locale, content, etag, disabled, onSaved, onDirtyChange }: Props) {
  const text = getCmsMetadataDictionary(locale), id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [value, setValue] = useState(() => clone(content.metadata)), [baseline, setBaseline] = useState(() => clone(content.metadata));
  const [baseEtag, setBaseEtag] = useState(etag), [reason, setReason] = useState("");
  const [rebased, setRebased] = useState(false), [error, setError] = useState<ApiError | null>(null);
  const [validation, setValidation] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState<AuthResult<ContentView> | null>(null), [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  const [knownServer, setKnownServer] = useState<{ value: ContentView; etag: string } | null>(null);
  const lock = useRef(false), form = useRef<HTMLFormElement>(null), feedback = useRef<HTMLDivElement>(null), sequence = useRef(0);
  const dirtyCallback = useRef(onDirtyChange);
  const dirty = rebased || reason !== "" || !same(value, baseline);
  useEffect(() => { dirtyCallback.current = onDirtyChange; }, [onDirtyChange]);
  useEffect(() => () => { sequence.current++; dirtyCallback.current?.(false); }, []);
  function announce(next: PublicMetadata, nextReason = reason, nextBaseline = baseline, adopted = rebased) {
    onDirtyChange?.(adopted || nextReason !== "" || !same(next, nextBaseline));
  }
  function change<K extends keyof PublicMetadata>(key: K, next: PublicMetadata[K]) {
    const updated = { ...value, [key]: next }; setValue(updated); setSaved(false); announce(updated);
  }
  function openPanel(next: boolean) {
    if (lock.current) return;
    if (next && !dirty) { setValue(clone(content.metadata)); setBaseline(clone(content.metadata)); setBaseEtag(etag); setReason(""); setRebased(false); setError(null); setValidation(null); setConflict(null); setKnownServer(null); }
    setOpen(next);
  }
  function acceptServer(server: ContentView, tag: string) {
    sequence.current++; setValue(clone(server.metadata)); setBaseline(clone(server.metadata)); setBaseEtag(tag);
    setReason(""); setRebased(false); setConflict(null); setKnownServer(null); setError(null); setValidation(null); setSaved(false);
    onDirtyChange?.(false); onSaved(server, tag);
  }
  function discard() {
    if (lock.current) return;
    if (knownServer) acceptServer(knownServer.value, knownServer.etag);
    else { setValue(clone(content.metadata)); setBaseline(clone(content.metadata)); setBaseEtag(etag); setReason(""); setRebased(false); setError(null); setValidation(null); setConflict(null); setSaved(false); onDirtyChange?.(false); }
  }
  async function loadConflict() {
    const request = ++sequence.current, result = await getContent(content.id);
    if (request === sequence.current) { setConflict(result); if (result.ok && result.etag) setKnownServer({ value: result.data, etag: result.etag }); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify({ metadata: value, reason }, null, 2)); setCopyState("copied"); }
    catch { setCopyState("error"); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || disabled || conflict) return;
    const invalid = Array.from(form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[required],textarea[required]") ?? []).find((input) => !input.value.trim());
    if (invalid) { setValidation(text.required); invalid.focus(); return; }
    const normalized = { ...value, audience: value.audience.filter((line) => line.trim()) };
    if (new TextEncoder().encode(JSON.stringify(normalized)).length > 16 * 1024) { setValidation(text.tooLarge); requestAnimationFrame(() => feedback.current?.focus()); return; }
    const request = ++sequence.current; lock.current = true; setBusy(true); setError(null); setValidation(null); setSaved(false);
    try {
      const result = await saveContentMetadata(content.id, baseEtag, { metadata: normalized, reason });
      if (request !== sequence.current) return;
      if (result.ok && result.etag) { acceptServer(result.data, result.etag); setSaved(true); }
      else if (!result.ok) { setError(result.error); if (result.error.status === 412) await loadConflict(); requestAnimationFrame(() => feedback.current?.focus()); }
    } finally { lock.current = false; setBusy(false); }
  }
  const field = (name: string) => `${id}-${name}`;
  const discardButton = <ConfirmationDialog title={text.discard} description={text.discardHelp} confirmLabel={text.confirm} cancelLabel={text.cancel}
    trigger={<Button variant="ghost" disabled={busy} className="max-w-full whitespace-normal">{text.discard}</Button>} onConfirm={discard} />;
  return <section className="space-y-4">
    {dirty && !open && <StatusMessage tone="warning"><p>{text.dirty}</p><div className="mt-3">{discardButton}</div></StatusMessage>}
    <Dialog open={open} onOpenChange={openPanel} title={text.title} description={text.help} closeLabel={text.close} className="max-w-3xl"
      trigger={<Button variant="secondary" disabled={disabled && !dirty}>{text.open}</Button>}>
      <form ref={form} noValidate aria-busy={busy} onSubmit={(event) => void submit(event)} className="space-y-7">
        {disabled && <StatusMessage tone="warning">{text.busyParent}</StatusMessage>}
        {(error || validation || saved) && <div ref={feedback} tabIndex={-1}>{error && <CmsError error={error} locale={locale} returnTo={cmsPath(locale, content.id)} />}{validation && <StatusMessage tone="danger">{validation}</StatusMessage>}{saved && <StatusMessage tone="success">{text.saved}</StatusMessage>}</div>}
        <fieldset disabled={busy} className="space-y-7">
          <fieldset className="space-y-3"><legend className="font-semibold">{text.goals}</legend><p className="text-sm text-muted-foreground">{text.goalsHelp}</p>
            {Object.entries(text.goal).map(([code, label]) => <Checkbox key={code} id={field(code)} label={label} checked={value.goalCodes.includes(code as PublicMetadata["goalCodes"][number])}
              onCheckedChange={(checked) => change("goalCodes", checked === true ? [...value.goalCodes, code as PublicMetadata["goalCodes"][number]] : value.goalCodes.filter((goal) => goal !== code))} />)}
          </fieldset>
          <FormField id={field("level")} label={text.level}><Select value={value.level ?? ""} options={[{ value: "", label: text.none }, ...Object.entries(text.levels).map(([value, label]) => ({ value, label }))]} onChange={(event) => change("level", event.target.value ? event.target.value as PublicMetadata["level"] : null)} /></FormField>
          <FormField id={field("audience")} label={text.audience} hint={text.lines}><TextArea rows={3} value={value.audience.join("\n")} onChange={(event) => change("audience", event.target.value ? event.target.value.split("\n") : [])} /></FormField>
          <section className="space-y-4"><h3 className="font-semibold">{text.tools}</h3>{value.tools.map((tool, index) => <div key={index} className="space-y-3 rounded-input border border-border p-4">
            <FormField id={field(`tool-${index}-name`)} label={text.toolName} required><Input required maxLength={120} value={tool.name} onChange={(event) => change("tools", value.tools.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} /></FormField>
            <FormField id={field(`tool-${index}-url`)} label={text.optionalUrl}><Input inputMode="url" maxLength={2000} value={tool.url ?? ""} onChange={(event) => change("tools", value.tools.map((item, position) => position === index ? { ...item, url: event.target.value || null } : item))} /></FormField>
            <Button variant="ghost" onClick={() => change("tools", value.tools.filter((_, position) => position !== index))}>{text.remove}</Button>
          </div>)}<Button variant="secondary" disabled={value.tools.length >= 10} onClick={() => change("tools", [...value.tools, { name: "", url: null }])}>{text.addTool}</Button></section>
          <section className="space-y-4"><h3 className="font-semibold">{text.sources}</h3>{value.sources.map((source, index) => <div key={index} className="space-y-3 rounded-input border border-border p-4">
            <FormField id={field(`source-${index}-label`)} label={text.sourceLabel} required><Input required maxLength={240} value={source.label} onChange={(event) => change("sources", value.sources.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></FormField>
            <FormField id={field(`source-${index}-url`)} label={text.url} required><Input required inputMode="url" maxLength={2000} value={source.url} onChange={(event) => change("sources", value.sources.map((item, position) => position === index ? { ...item, url: event.target.value } : item))} /></FormField>
            <Button variant="ghost" onClick={() => change("sources", value.sources.filter((_, position) => position !== index))}>{text.remove}</Button>
          </div>)}<Button variant="secondary" disabled={value.sources.length >= 20} onClick={() => change("sources", [...value.sources, { label: "", url: "" }])}>{text.addSource}</Button></section>
          <section className="space-y-4"><h3 className="font-semibold">{text.faq}</h3>{value.faq.map((faq, index) => <div key={index} className="space-y-3 rounded-input border border-border p-4">
            <FormField id={field(`faq-${index}-question`)} label={text.question} required><TextArea required rows={2} maxLength={500} value={faq.question} onChange={(event) => change("faq", value.faq.map((item, position) => position === index ? { ...item, question: event.target.value } : item))} /></FormField>
            <FormField id={field(`faq-${index}-answer`)} label={text.answer} required><TextArea required rows={4} maxLength={2000} value={faq.answer} onChange={(event) => change("faq", value.faq.map((item, position) => position === index ? { ...item, answer: event.target.value } : item))} /></FormField>
            <Button variant="ghost" onClick={() => change("faq", value.faq.filter((_, position) => position !== index))}>{text.remove}</Button>
          </div>)}<Button variant="secondary" disabled={value.faq.length >= 12} onClick={() => change("faq", [...value.faq, { question: "", answer: "" }])}>{text.addFaq}</Button></section>
          <FormField id={field("evaluation")} label={text.evaluation} hint={text.evaluationHelp}><TextArea rows={4} maxLength={4000} value={value.evaluationDescription ?? ""} onChange={(event) => change("evaluationDescription", event.target.value || null)} /></FormField>
          <FormField id={field("reason")} label={text.reason} required><TextArea required rows={3} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); setSaved(false); announce(value, event.target.value); }} /></FormField>
        </fieldset>
        {conflict && <section className="space-y-4 rounded-panel border border-danger bg-danger-soft p-4"><h3 className="font-semibold">{text.conflict}</h3>
          <FormField id={field("local-copy")} label={text.local}><TextArea readOnly rows={10} value={JSON.stringify({ metadata: value, reason }, null, 2)} /></FormField>
          {conflict.ok ? <><FormField id={field("server-copy")} label={text.server}><TextArea readOnly rows={10} value={JSON.stringify(conflict.data.metadata, null, 2)} /></FormField>
            <div className="flex flex-wrap gap-3"><ConfirmationDialog title={text.reload} description={text.discardHelp} confirmLabel={text.confirm} cancelLabel={text.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{text.reload}</Button>} onConfirm={() => { if (conflict.etag) acceptServer(conflict.data, conflict.etag); }} />
              <ConfirmationDialog title={text.keep} description={text.keepHelp} confirmLabel={text.confirm} cancelLabel={text.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{text.keep}</Button>} onConfirm={() => { if (conflict.etag) { setBaseEtag(conflict.etag); setBaseline(clone(conflict.data.metadata)); setRebased(true); setConflict(null); setError(null); onDirtyChange?.(true); } }} /></div></>
            : <CmsError error={conflict.error} locale={locale} returnTo={cmsPath(locale, content.id)} />}
          <Button variant="secondary" onClick={() => void loadConflict()}>{text.retry}</Button>
        </section>}
        <div className="flex flex-wrap gap-3"><Button type="submit" busy={busy} loadingLabel={text.saving} disabled={disabled || Boolean(conflict) || !dirty}>{text.save}</Button><Button variant="secondary" onClick={() => void copy()}>{text.copy}</Button>{dirty && discardButton}</div>
        {copyState && <p role="status">{copyState === "copied" ? text.copied : text.copyFailed}</p>}
      </form>
    </Dialog>
  </section>;
}
