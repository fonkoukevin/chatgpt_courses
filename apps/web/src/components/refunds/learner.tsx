"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge, Button, FormField, Link, Pagination, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { EntitlementPage, RefundContext, RefundOperationPage, RefundRequestPage } from "@/lib/api/generated/types.gen";
import { createRefundRequest, getRefundContext, listEntitlements, listRefundOperations, listRefundRequests } from "@/lib/api/refunds-client";
import { ordersPath } from "@/lib/commerce/routes";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { learningPath } from "@/lib/learning/routes";
import { validMethodText } from "@/lib/methods/validation";
import { refundIntent, type RefundIntent } from "@/lib/refunds/intent";
import { entitlementsPath, orderRefundsPath, refundPageQuery, type RefundPageQuery } from "@/lib/refunds/routes";
import { projectDate } from "@/components/projects/parts";
import { RefundAccountNotice, RefundContextFacts, RefundError, RefundOperationFacts, RefundRequestFacts, RefundShell, RefundTextCopy } from "./parts";
import { useRefundResource } from "./use-resource";

function RequestForm({ locale, orderId, context, account, boundary, onRecorded }: { locale: Locale; orderId: string; context: RefundContext | null; account: LearningAccountState; boundary: LearningAccountBoundary; onRecorded: () => void }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), id = useId(), field = useRef<HTMLTextAreaElement>(null), lock = useRef(false), lifetime = useRef(0), intent = useRef<RefundIntent | null>(null);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [invalid, setInvalid] = useState(false), [error, setError] = useState<ApiError | null>(null), [uncertain, setUncertain] = useState(false), [recorded, setRecorded] = useState<string | null>(null);
  useEffect(() => () => { lifetime.current++; }, []);
  async function submit() {
    if (lock.current || account.status !== "active" || !account.accountId || !context?.canRequest) return;
    if (!validMethodText(reason, 2000, 1) || !reason.trim()) { setInvalid(true); field.current?.focus(); return; }
    const attempt = refundIntent(intent.current, orderId, account.accountId, { reason }, () => crypto.randomUUID()); intent.current = attempt;
    const scope = boundary.capture(), instance = lifetime.current; lock.current = true; setBusy(true); setError(null); setUncertain(false);
    try {
      const value = await createRefundRequest(orderId, { reason }, attempt.key, attempt.accountId);
      if (instance !== lifetime.current) return;
      if (!boundary.isCurrent(scope)) { setUncertain(true); return; }
      if (!value.ok) { setError(value.error); boundary.fail(value.error); setUncertain(value.error.kind === "unavailable" || value.error.kind === "invalid-response"); return; }
      setRecorded(value.data.reason); setUncertain(false); onRecorded();
    } finally { lock.current = false; if (instance === lifetime.current) setBusy(false); }
  }
  return <section className="space-y-5 rounded-panel border border-border p-4 sm:p-6" data-refund-request-form><h2 className="text-xl font-semibold">{t.create}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.requestHelp}</p>{context && !context.canRequest && <StatusMessage>{s.requestUnavailable}</StatusMessage>}
    <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}><FormField id={`${id}-reason`} label={t.requestReason} hint={t.reasonHelp} required error={invalid ? t.reasonRequired : undefined}><TextArea ref={field} maxLength={2000} rows={5} value={reason} readOnly={account.status !== "active"} onChange={event => { setReason(event.target.value); setInvalid(false); }} /></FormField><Button type="submit" busy={busy} loadingLabel={t.creating} disabled={account.status !== "active" || !context?.canRequest} className="max-w-full whitespace-normal">{uncertain ? t.retry : t.create}</Button></form>
    {recorded !== null && <StatusMessage tone="success">{t.requested}{recorded !== reason ? ` · ${s.unsubmittedChanges}` : ""}</StatusMessage>}{error && <RefundError locale={locale} error={error} />}{uncertain && <StatusMessage tone="warning">{t.unconfirmed}</StatusMessage>}{reason && <RefundTextCopy locale={locale} value={reason} />}
  </section>;
}

export function OrderRefunds({ locale, orderId, expectedAccountId, initialContext, initialRequests, initialOperations, query = {} }: { locale: Locale; orderId: string; expectedAccountId: string; initialContext: AuthResult<RefundContext>; initialRequests: AuthResult<RefundRequestPage>; initialOperations: AuthResult<RefundOperationPage>; query?: RefundPageQuery }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), destination = orderRefundsPath(locale, orderId) + refundPageQuery(query), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const page = query.page ?? 0, pageSize = query.pageSize ?? 20;
  const contextLoad = useCallback(() => getRefundContext(orderId), [orderId]), requestLoad = useCallback(() => listRefundRequests({ orderId, page, pageSize }), [orderId, page, pageSize]), operationLoad = useCallback(() => listRefundOperations({ orderId, page, pageSize }), [orderId, page, pageSize]);
  const context = useRefundResource(account, boundary, contextLoad, initialContext), requests = useRefundResource(account, boundary, requestLoad, initialRequests), operations = useRefundResource(account, boundary, operationLoad, initialOperations);
  const refresh = () => { context.reload(); requests.reload(); operations.reload(); }, value = context.result?.ok ? context.result.data : null;
  const total = Math.max(requests.result?.ok ? requests.result.data.total : 0, operations.result?.ok ? operations.result.data.total : 0);
  return <RefundShell locale={locale} orderId={orderId}><div className="space-y-7"><div className="flex flex-wrap gap-3"><Link href={ordersPath(locale, orderId)} prefetch={false} className="inline-flex min-h-11 items-center">{t.backOrder}</Link><Link href={entitlementsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{s.entitlementsTitle}</Link><Button variant="secondary" onClick={refresh} busy={context.loading || requests.loading || operations.loading} loadingLabel={t.loading}>{t.refresh}</Button></div><RefundAccountNotice locale={locale} account={account} boundary={boundary} destination={destination} />
    {account.status === "active" && <><p className="break-all text-sm"><span className="text-muted-foreground">{t.orderReference} : </span>{orderId}</p>{!context.result ? <p role="status">{t.loading}</p> : !context.result.ok ? <RefundError locale={locale} error={context.result.error} retry={context.reload} /> : <RefundContextFacts locale={locale} value={context.result.data} />}</>}
    <RequestForm locale={locale} orderId={orderId} context={value} account={account} boundary={boundary} onRecorded={refresh} />
    {account.status === "active" && <><section className="space-y-4"><h2 className="text-2xl font-semibold">{s.requestHistory}</h2>{!requests.result ? <p role="status">{t.loading}</p> : !requests.result.ok ? <RefundError locale={locale} error={requests.result.error} retry={requests.reload} /> : !requests.result.data.items.length ? <p className="text-muted-foreground">{t.empty}</p> : requests.result.data.items.map(item => <RefundRequestFacts key={item.id} locale={locale} value={item} />)}</section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">{s.operationHistory}</h2>{!operations.result ? <p role="status">{t.loading}</p> : !operations.result.ok ? <RefundError locale={locale} error={operations.result.error} retry={operations.reload} /> : !operations.result.data.items.length ? <p className="text-muted-foreground">{s.noOperations}</p> : operations.result.data.items.map(item => <article key={item.id} className="rounded-panel border border-border p-4 sm:p-6"><RefundOperationFacts locale={locale} value={item} lines={value?.lines} /></article>)}</section>
    {total > pageSize && <Pagination label={t.pagination} page={page + 1} totalPages={Math.ceil(total / pageSize)} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.page} hrefForPage={next => orderRefundsPath(locale, orderId) + refundPageQuery({ page: next - 1, pageSize })} />}</>}
    <StatusMessage>{t.workRetained}</StatusMessage><Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{s.preservedWork}</Link>
  </div></RefundShell>;
}

export function PersonalEntitlements({ locale, expectedAccountId, initial, query = {} }: { locale: Locale; expectedAccountId: string; initial: AuthResult<EntitlementPage>; query?: RefundPageQuery }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), destination = entitlementsPath(locale) + refundPageQuery(query), { state: account, boundary } = useLearningAccount(destination, expectedAccountId), page = query.page ?? 0, pageSize = query.pageSize ?? 20;
  const load = useCallback(() => listEntitlements(locale, page, pageSize), [locale, page, pageSize]), { result, reload, loading } = useRefundResource(account, boundary, load, initial);
  return <RefundShell locale={locale} title={s.entitlementsTitle} description={s.entitlementsDescription} languageLinks={{ fr: entitlementsPath("fr") + refundPageQuery(query), en: entitlementsPath("en") + refundPageQuery(query) }}><div className="space-y-6"><RefundAccountNotice locale={locale} account={account} boundary={boundary} destination={destination} /><div className="flex flex-wrap gap-3"><Button variant="secondary" busy={loading} loadingLabel={t.loading} onClick={reload}>{t.refresh}</Button><Link href={ordersPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{t.order}</Link></div>{account.status === "active" && (!result ? <p role="status">{t.loading}</p> : !result.ok ? <RefundError locale={locale} error={result.error} retry={reload} /> : <>{!result.data.items.length ? <StatusMessage>{s.noEntitlements}</StatusMessage> : <ul className="grid gap-5 xl:grid-cols-2">{result.data.items.map(item => <li key={item.id} className="min-w-0 space-y-4 rounded-panel border border-border p-4 sm:p-6" data-entitlement-id={item.id} data-entitlement-state={item.state}><h2 className="break-words text-xl font-semibold">{item.title}</h2><div className="flex flex-wrap gap-2"><Badge tone={item.state === "ACTIVE" ? "success" : "warning"}>{s.entitlements[item.state]}</Badge><Badge>{s.origins[item.originType]}</Badge></div>{item.orderId && <p className="break-all text-xs leading-relaxed text-muted-foreground">{t.orderReference} : {item.orderId}</p>}{item.orderResourceId && <p className="break-all text-xs leading-relaxed text-muted-foreground">{t.lineReference} : {item.orderResourceId}</p>}<p className="text-sm">{t.version} {item.versionNumber} · {item.locales.map(value => value.toUpperCase()).join(" / ")}</p><p className="text-sm">{s.starts} {projectDate(item.startsAt, locale)}</p><p className="text-sm">{item.expiresAt ? `${s.expires} ${projectDate(item.expiresAt, locale)}` : s.unlimited}</p>{item.revokedAt && <StatusMessage tone="warning">{item.revokedReason === "REFUND" ? s.refundReason : s.revokedReason} · {projectDate(item.revokedAt, locale)}</StatusMessage>}{item.orderId && <div className="flex flex-wrap gap-3"><Link href={ordersPath(locale, item.orderId)} prefetch={false}>{t.order}</Link><Link href={orderRefundsPath(locale, item.orderId)} prefetch={false}>{s.refundHistory}</Link></div>}</li>)}</ul>}{result.data.total > pageSize && <Pagination label={t.pagination} page={page + 1} totalPages={Math.ceil(result.data.total / pageSize)} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.page} hrefForPage={next => entitlementsPath(locale) + refundPageQuery({ page: next - 1, pageSize })} />}</>)}<StatusMessage>{t.workRetained}</StatusMessage><Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{s.preservedWork}</Link></div></RefundShell>;
}
