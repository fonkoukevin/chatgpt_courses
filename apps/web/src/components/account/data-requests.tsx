"use client";
import { useUnsavedInput } from "@/components/learning/unsaved";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, ConfirmationDialog, FormField, Pagination, Select, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { cancelDataRequest, createDataRequest, getDataRequest, getDataRequestEvents, listDataRequests } from "@/lib/api/account-client";
import type { CreateDataRequest, DataRequestPage, DataRequestView } from "@/lib/api/generated/types.gen";
import { accountIntent, type AccountIntent } from "@/lib/account/intent";
import { dataRequestsHref, type AccountListQuery } from "@/lib/account/routes";
import { getAccountDictionary, getAccountStateDictionary } from "@/lib/i18n/account";
import { unsavedChangesMessage, type Locale } from "@/lib/i18n/locales";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { AccountError, AccountNotice, AccountTextCopy, accountDate } from "./parts";
import { AccountShell } from "./shell";
import { useAccountResource } from "./use-resource";

function DataRequestCard({ locale, item, account, boundary, onChanged }: { locale: Locale; item: DataRequestView; account: LearningAccountState; boundary: LearningAccountBoundary; onChanged: () => void }) {
  const t = getAccountDictionary(locale), s = getAccountStateDictionary(locale), [reason, setReason] = useState(""), [pending, setPending] = useState(false), [error, setError] = useState<ApiError | null>(null), [open, setOpen] = useState(false), [eventPage, setEventPage] = useState(0), [showHistory, setShowHistory] = useState(false);
  const intent = useRef<AccountIntent | null>(null), lock = useRef(false), life = useRef(0);
  useEffect(() => () => { life.current++; }, []);
  useUnsavedInput(pending || Boolean(reason), unsavedChangesMessage(locale), boundary);
  const loadEvents = useCallback(() => getDataRequestEvents(item.id, eventPage, 10), [item.id, eventPage]), events = useAccountResource(account, boundary, showHistory ? loadEvents : null);
  async function cancel() {
    if (lock.current || account.status !== "active" || !account.accountId || !reason.trim() || [...reason].length > 2000) return;
    const scope = boundary.capture(), own = life.current, body = { reason }; lock.current = true; setPending(true); setError(null);
    try { const current = await getDataRequest(item.id); if (own !== life.current || !boundary.isCurrent(scope)) return;
      if (!current.ok) { setError(current.error); boundary.fail(current.error); return; }
      if (current.data.revision !== item.revision || current.data.state !== "WAITING_POLICY") { setError({ kind: "http", status: 412 }); return; }
      const attempt = accountIntent(intent.current, `cancel:${item.id}:${current.etag}`, account.accountId, body, () => crypto.randomUUID()); intent.current = attempt;
      const result = await cancelDataRequest(item.id, current.etag!, body, attempt.key, account.accountId); if (own !== life.current || !boundary.isCurrent(scope)) return;
      if (result.ok) { setOpen(false); setReason(""); onChanged(); events.reload(); } else { setError(result.error); boundary.fail(result.error); }
    } finally { lock.current = false; if (own === life.current) setPending(false); }
  }
  const names = { EXPORT: t.exportRequest, ERASURE: t.erasureRequest, ACCOUNT_CLOSURE: t.closureRequest };
  return <li data-data-request={item.id} className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{names[item.type]}</h2><Badge tone={item.state === "CANCELLED" ? "neutral" : "warning"}>{item.state === "CANCELLED" ? t.requestCanceled : t.waitingPolicy}</Badge><p lang="" className="whitespace-pre-wrap break-words">{item.reason}</p><p className="text-sm text-muted-foreground">{t.createdAt} : {accountDate(item.createdAt, locale)}</p>{item.state === "WAITING_POLICY" && <><p className="text-sm text-muted-foreground">{t.waitingPolicyHelp}</p><ConfirmationDialog open={open} onOpenChange={value => { if (!lock.current) setOpen(value); }} title={t.cancelDataTitle} description={t.cancelDataHelp} confirmLabel={t.cancelDataRequest} cancelLabel={t.close} busy={pending} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.cancelDataRequest}</Button>} onConfirm={event => { event.preventDefault(); void cancel(); }}><FormField id={`cancel-${item.id}`} label={t.dataReason} required><TextArea value={reason} maxLength={4000} onChange={event => setReason(event.target.value)} disabled={pending || account.status !== "active"} /></FormField>{error && <AccountError locale={locale} error={error} />}</ConfirmationDialog></>}
    <Button variant="ghost" onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory}>{t.events}</Button>{showHistory && (events.result?.ok ? <><ol className="space-y-3">{events.result.data.items.map(event => <li key={event.id} className="space-y-1 border-l-2 border-border pl-3"><p className="font-medium">{s.events[event.type]}</p><p lang="" className="whitespace-pre-wrap break-words text-sm">{event.reason}</p><p className="text-xs text-muted-foreground">{accountDate(event.createdAt, locale)}</p></li>)}</ol>{events.result.data.total > 10 && <Pagination label={t.pagination} page={eventPage + 1} totalPages={Math.ceil(events.result.data.total / 10)} previousLabel={t.previous} nextLabel={t.next} onPageChange={page => setEventPage(page - 1)} />}</> : events.result ? <AccountError locale={locale} error={events.result.error} retry={events.reload} /> : <p role="status">{t.loading}</p>)}
  </li>;
}
export function PersonalDataRequests({ locale, expectedAccountId, initial, query = {} }: { locale: Locale; expectedAccountId: string; initial: AuthResult<DataRequestPage>; query?: AccountListQuery }) {
  const t = getAccountDictionary(locale), s = getAccountStateDictionary(locale), destination = dataRequestsHref(locale, query), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const load = useCallback(() => listDataRequests(query.page ?? 0, query.pageSize ?? 20), [query.page, query.pageSize]), list = useAccountResource(account, boundary, load, initial);
  const [type, setType] = useState<CreateDataRequest["type"]>("EXPORT"), [reason, setReason] = useState(""), [pending, setPending] = useState(false), [saved, setSaved] = useState(false), [olderAcknowledged, setOlderAcknowledged] = useState(false), [error, setError] = useState<ApiError | null>(null), [submitted, setSubmitted] = useState(false), lock = useRef(false), life = useRef(0), changes = useRef(0), intent = useRef<AccountIntent | null>(null);
  useEffect(() => () => { life.current++; }, []);
  useUnsavedInput(pending || !saved && Boolean(reason || type !== "EXPORT"), unsavedChangesMessage(locale), boundary);
  const valid = Boolean(reason.trim()) && [...reason].length <= 2000;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitted(true); if (lock.current || account.status !== "active" || !account.accountId || !valid) return;
    const body = { type, reason }, scope = boundary.capture(), own = life.current, edit = changes.current, attempt = accountIntent(intent.current, "data-request", account.accountId, body, () => crypto.randomUUID()); intent.current = attempt;
    lock.current = true; setPending(true); setSaved(false); setOlderAcknowledged(false); setError(null);
    try { const result = await createDataRequest(body, attempt.key, account.accountId); if (own !== life.current || !boundary.isCurrent(scope)) return; if (result.ok) { setSaved(changes.current === edit); setOlderAcknowledged(changes.current !== edit); list.reload(); if (changes.current === edit) { setReason(""); setSubmitted(false); intent.current = null; } } else { setError(result.error); boundary.fail(result.error); } }
    finally { lock.current = false; if (own === life.current) setPending(false); }
  }
  return <AccountShell locale={locale} section="data"><AccountNotice locale={locale} account={account} boundary={boundary} destination={destination} /><StatusMessage>{t.dataHelp}</StatusMessage><form data-data-request-form onSubmit={event => void submit(event)} noValidate aria-busy={pending} className="space-y-5 rounded-panel border border-border bg-surface p-4 sm:p-6"><FormField id="data-type" label={t.requestType}><Select value={type} disabled={account.status !== "active"} onChange={event => { changes.current++; setType(event.target.value as CreateDataRequest["type"]); setSaved(false); }} options={[{ value: "EXPORT", label: t.exportRequest }, { value: "ERASURE", label: t.erasureRequest }, { value: "ACCOUNT_CLOSURE", label: t.closureRequest }]} /></FormField><FormField id="data-reason" label={t.dataReason} required error={submitted && !valid ? reason.trim() ? t.tooLong : t.required : undefined}><TextArea value={reason} rows={4} disabled={account.status !== "active"} onChange={event => { changes.current++; setReason(event.target.value); setSaved(false); }} /></FormField><Button type="submit" busy={pending} loadingLabel={t.saving} aria-disabled={account.status !== "active" || pending}>{t.sendRequest}</Button>{saved && account.status === "active" && <StatusMessage tone="success">{t.requestRecorded}</StatusMessage>}{olderAcknowledged && account.status === "active" && <StatusMessage tone="warning">{t.unsubmittedChanges}</StatusMessage>}{error && <><AccountError locale={locale} error={error} />{error.kind === "http" && error.problem?.code === "DATA_REQUEST_EXISTS" && <p>{s.dataExists}</p>}</>}{reason && <AccountTextCopy locale={locale} value={reason} />}</form>
    {account.status === "active" && <div className="space-y-5"><Button variant="secondary" onClick={list.reload} busy={list.loading}>{t.refresh}</Button>{list.result?.ok ? list.result.data.items.length ? <><ul className="space-y-5">{list.result.data.items.map(item => <DataRequestCard key={`${item.id}:${item.revision}`} locale={locale} item={item} account={account} boundary={boundary} onChanged={list.reload} />)}</ul>{list.result.data.total > list.result.data.pageSize && <Pagination label={t.pagination} page={list.result.data.page + 1} totalPages={Math.ceil(list.result.data.total / list.result.data.pageSize)} previousLabel={t.previous} nextLabel={t.next} hrefForPage={page => dataRequestsHref(locale, { ...query, page: page - 1 })} />}</> : <StatusMessage>{t.emptyDataRequests}</StatusMessage> : list.result ? <AccountError locale={locale} error={list.result.error} retry={list.reload} /> : <p>{t.loading}</p>}</div>}
  </AccountShell>;
}
