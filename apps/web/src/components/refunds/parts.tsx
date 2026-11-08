"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { AdminLayout, LearnerLayout } from "@/components/layouts";
import { Badge, Button, FormField, Link, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { RefundAllocation, RefundContext, RefundLine, RefundOperationView, RefundRequestView } from "@/lib/api/generated/types.gen";
import { authHref, authPath } from "@/lib/auth/routes";
import { cmsPath } from "@/lib/cms/routes";
import { commerceMoney } from "@/lib/commerce/format";
import { ordersPath } from "@/lib/commerce/routes";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { notificationsPath } from "@/lib/notifications/routes";
import { adminRefundsPath, orderRefundsPath } from "@/lib/refunds/routes";
import { projectDate } from "@/components/projects/parts";

export function RefundShell({ locale, orderId, title, description, languageLinks, children }: { locale: Locale; orderId?: string; title?: string; description?: string; languageLinks?: Record<Locale, string>; children: ReactNode }) {
  const t = getRefundsDictionary(locale);
  return <LearnerLayout locale={locale} title={title ?? t.title} description={description ?? t.description} product={{ active: "orders", languageLinks: languageLinks ?? { fr: orderId ? orderRefundsPath("fr", orderId) : ordersPath("fr"), en: orderId ? orderRefundsPath("en", orderId) : ordersPath("en") } }}>{children}</LearnerLayout>;
}
export function RefundAdminShell({ locale, languageLinks, children }: { locale: Locale; languageLinks?: Record<Locale, string>; children: ReactNode }) {
  const t = getRefundsDictionary(locale);
  return <AdminLayout locale={locale} title={t.operatorTitle} description={t.operatorDescription} product={{ contentHref: cmsPath(locale), accountHref: authPath(locale, "account"), languageHrefs: languageLinks ?? { fr: adminRefundsPath("fr"), en: adminRefundsPath("en") }, navigationDescription: t.navigation, current: t.operatorTitle, notificationsHref: notificationsPath(locale), refundsHref: adminRefundsPath(locale), active: "refunds" }}>{children}</AdminLayout>;
}
export function RefundError({ locale, error, retry }: { locale: Locale; error: ApiError; retry?: () => void }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), code = "problem" in error ? error.problem?.code : undefined;
  return <div className="space-y-3"><StatusMessage tone="danger">{error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 404 ? t.notFound : error.status === 403 ? t.forbidden : code === "INVALID_REFUND_ALLOCATION" ? s.allocationInvalid : error.status === 412 || code === "REFUND_PREVIEW_CHANGED" || code === "REFUND_AMOUNT_UNAVAILABLE" ? t.stale : t.failed}</StatusMessage>{retry && <Button variant="secondary" className="max-w-full whitespace-normal" onClick={retry}>{t.retry}</Button>}</div>;
}
export function RefundAccountNotice({ locale, account, boundary, destination }: { locale: Locale; account: LearningAccountState; boundary: LearningAccountBoundary; destination: string }) {
  const t = getRefundsDictionary(locale);
  return account.status === "active" ? null : <div className="space-y-3"><StatusMessage tone="warning">{account.status === "loading" ? t.loadingAccount : account.status === "changed" ? t.accountChanged : account.status === "expired" || account.status === "anonymous" ? t.expiredSession : t.unavailable}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", destination)} prefetch={false} className="inline-flex min-h-11 items-center">{t.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{t.checkAccount}</Button></div></div>;
}
export const refundMoney = (locale: Locale, amountMinor: number, currency: string) => commerceMoney({ amountMinor, currency }, locale) ?? getRefundsDictionary(locale).none;
export function RefundContextFacts({ locale, value }: { locale: Locale; value: RefundContext }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale);
  return <section className="space-y-4" data-refund-context><h2 className="text-xl font-semibold">{s.totals}</h2><dl className="grid gap-4 sm:grid-cols-2">{[{ label: t.paidAmount, amount: value.paidAmountMinor }, { label: t.refundedAmount, amount: value.confirmedRefundedMinor }, { label: t.reservedAmount, amount: value.reservedMinor }, { label: t.remainingAmount, amount: value.availableMinor }].map(item => <div key={item.label}><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="mt-1 break-words font-semibold">{refundMoney(locale, item.amount, value.currency)}</dd></div>)}</dl>{value.reconciliationState === "NEEDS_REVIEW" && <StatusMessage tone="warning">{t.reconciliationHelp}</StatusMessage>}</section>;
}
export function RefundAllocations({ locale, allocations, lines, currency }: { locale: Locale; allocations: RefundAllocation[]; lines?: RefundLine[]; currency: string }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale);
  return <ul className="space-y-3">{allocations.map((item, index) => { const line = lines?.find(value => value.orderResourceId === item.orderResourceId); return <li key={item.orderResourceId} className="min-w-0 space-y-2 rounded-input border border-border p-4"><p className="break-words font-medium">{line?.title ?? `${t.lines} ${index + 1}`}</p><p className="break-all text-xs leading-relaxed text-muted-foreground">{t.lineReference} : {item.orderResourceId}</p>{line && <p className="text-sm text-muted-foreground">{t.version} {line.versionNumber} · {line.locales.map(value => value.toUpperCase()).join(" / ")}</p>}<p className="break-words font-semibold">{refundMoney(locale, item.amountMinor, currency)}</p><p className="text-sm">{item.accessAction === "KEEP" ? t.keepAccess : t.revokeAccess}</p><p className="text-sm text-muted-foreground">{t.otherOrigin}</p></li>; })}{lines?.filter(line => !allocations.some(item => item.orderResourceId === line.orderResourceId)).map(line => <li key={line.orderResourceId} className="space-y-1 rounded-input border border-border p-4"><p className="break-words font-medium">{line.title}</p><p className="break-all text-xs leading-relaxed text-muted-foreground">{t.lineReference} : {line.orderResourceId}</p><p className="text-sm text-muted-foreground">{s.lineUnchanged}</p></li>)}</ul>;
}
export function RefundRequestFacts({ locale, value }: { locale: Locale; value: RefundRequestView }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale);
  return <article className="space-y-4 rounded-panel border border-border p-4 sm:p-6" data-refund-request={value.id}><Badge tone={value.state === "REJECTED" ? "warning" : "neutral"}>{s.requests[value.state]}</Badge><p className="text-sm text-muted-foreground">{t.submittedAt} {projectDate(value.createdAt, locale)}</p><p className="whitespace-pre-wrap break-words leading-relaxed">{value.reason}</p>{value.decision && <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">{t.decision}</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value.decision.reason}</p><p className="text-sm text-muted-foreground">{t.decidedAt} {projectDate(value.decision.decidedAt, locale)}</p><StatusMessage>{value.state === "REJECTED" ? t.declinedHelp : t.decisionHelp}</StatusMessage></section>}</article>;
}
export function RefundOperationFacts({ locale, value, lines }: { locale: Locale; value: RefundOperationView; lines?: RefundLine[] }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale);
  return <section className="min-w-0 space-y-5" data-refund-operation={value.id} data-refund-financial-state={value.state} data-refund-access-state={value.accessState}>
    <div className="flex flex-wrap gap-2"><Badge>{s.origins[value.origin]}</Badge><Badge tone={value.state === "SUCCEEDED" ? "success" : ["FAILED", "NEEDS_REVIEW", "UNKNOWN"].includes(value.state) ? "warning" : "neutral"}>{s.operations[value.state]}</Badge></div><p className="break-words text-2xl font-semibold">{refundMoney(locale, value.amountMinor, value.currency)}</p>
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t.financialState}</dt><dd className="mt-1 font-medium">{s.operations[value.state]}</dd></div><div><dt className="text-muted-foreground">{t.accessState}</dt><dd className="mt-1 font-medium">{s.access[value.accessState]}</dd></div><div><dt className="text-muted-foreground">{t.updatedAt}</dt><dd className="mt-1">{projectDate(value.updatedAt, locale)}</dd></div>{value.confirmedAt && <div><dt className="text-muted-foreground">{t.confirmedAt}</dt><dd className="mt-1">{projectDate(value.confirmedAt, locale)}</dd></div>}</dl>
    {value.accessState === "NEEDS_REVIEW" && <StatusMessage tone="warning">{s.externalReview}</StatusMessage>}{["UNKNOWN", "NEEDS_REVIEW", "REQUIRES_ACTION"].includes(value.state) && <StatusMessage tone="warning">{t.reconciliationHelp}</StatusMessage>}
    {value.allocations.length > 0 && <RefundAllocations locale={locale} allocations={value.allocations} lines={lines} currency={value.currency} />}
    {value.notificationStatus !== "NONE" && <StatusMessage tone={value.notificationStatus === "ISSUE" ? "warning" : "info"}>{t.notification} : {value.notificationStatus === "ISSUE" ? s.notificationIssue : value.notificationStatus === "SENT" ? s.notificationSent : s.notificationPending}</StatusMessage>}
    <p className="text-sm leading-relaxed text-muted-foreground">{t.workRetained}</p>
  </section>;
}
export function RefundTextCopy({ locale, value }: { locale: Locale; value: string }) {
  const t = getRefundsDictionary(locale), id = useId(), [copied, setCopied] = useState<{ value: string; state: "copied" | "failed" } | null>(null), manual = useRef<HTMLTextAreaElement>(null), sequence = useRef(0);
  async function copy() { const request = ++sequence.current; try { await navigator.clipboard.writeText(value); if (request === sequence.current) setCopied({ value, state: "copied" }); } catch { if (request === sequence.current) setCopied({ value, state: "failed" }); } }
  const status = copied?.value === value ? copied.state : null;
  return <div className="space-y-3"><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void copy()}>{t.copy}</Button>{status && <StatusMessage tone={status === "copied" ? "success" : "warning"}>{status === "copied" ? t.copied : t.copyFailed}</StatusMessage>}{status === "failed" && <><FormField id={`${id}-manual`} label={t.localText}><TextArea ref={manual} readOnly value={value} rows={6} /></FormField><Button variant="secondary" onClick={() => { manual.current?.focus(); manual.current?.select(); }}>{t.selectText}</Button></>}</div>;
}
