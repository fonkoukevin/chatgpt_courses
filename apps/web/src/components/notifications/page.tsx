"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AdminLayout } from "@/components/layouts";
import { Badge, Button, Checkbox, ConfirmationDialog, FormField, Link, Pagination, Select, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { NotificationPage, NotificationSummary, RetryNotification } from "@/lib/api/generated/types.gen";
import { listNotifications, retryNotification } from "@/lib/api/notifications-client";
import { authHref, authPath } from "@/lib/auth/routes";
import { cmsPath } from "@/lib/cms/routes";
import type { Locale } from "@/lib/i18n/locales";
import { getNotificationsDictionary } from "@/lib/i18n/notifications";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { notificationsHref, notificationsPath, notificationStatuses, type NotificationListQuery } from "@/lib/notifications/routes";
import { projectDate } from "@/components/projects/parts";

function NotificationError({ locale, error }: { locale: Locale; error: ApiError }) {
  const t = getNotificationsDictionary(locale);
  return <StatusMessage tone="danger">{error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 403 ? t.forbidden : t.genericFailure}</StatusMessage>;
}
export function NotificationsShell({ locale, children, query = {} }: { locale: Locale; children: ReactNode; query?: NotificationListQuery }) {
  const t = getNotificationsDictionary(locale);
  return <AdminLayout locale={locale} title={t.title} description={t.description} product={{ contentHref: cmsPath(locale), accountHref: authPath(locale, "account"), languageHrefs: { fr: notificationsHref("fr", query), en: notificationsHref("en", query) }, navigationDescription: t.navigation, current: t.title, notificationsHref: notificationsHref(locale, query), active: "notifications" }}>{children}</AdminLayout>;
}
function RetryDelivery({ locale, item, account, boundary, onQueued }: { locale: Locale; item: NotificationSummary; account: LearningAccountState; boundary: LearningAccountBoundary; onQueued: () => void }) {
  const t = getNotificationsDictionary(locale), id = useId(), [open, setOpen] = useState(false), [reason, setReason] = useState<RetryNotification["reason"] | "">("");
  const [ackDuplicate, setAckDuplicate] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState<"reason" | "ack" | null>(null), [unconfirmed, setUnconfirmed] = useState(false);
  const lock = useRef(false), field = useRef<HTMLSelectElement>(null);
  async function retry() {
    if (lock.current || account.status !== "active" || !account.accountId) return;
    if (!reason) { setInvalid("reason"); field.current?.focus(); return; }
    if (item.status === "INDETERMINATE" && !ackDuplicate) { setInvalid("ack"); document.getElementById(`${id}-duplicate`)?.focus(); return; }
    lock.current = true; setBusy(true); setError(null); setInvalid(null); setUnconfirmed(false); const scope = boundary.capture();
    try {
      const result = await retryNotification(item.id, { reason, ackDuplicate }, account.accountId);
      if (!boundary.isCurrent(scope)) { setUnconfirmed(true); return; }
      if (!result.ok) { setError(result.error); boundary.fail(result.error); return; }
      setOpen(false); onQueued();
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-3"><ConfirmationDialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title={t.retryTitle} description={t.retryHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} busy={busy} trigger={<Button variant="secondary" disabled={account.status !== "active"} className="max-w-full whitespace-normal">{t.retryAction}</Button>} onConfirm={(event) => { event.preventDefault(); void retry(); }}>
    <div className="space-y-4"><FormField id={`${id}-reason`} label={t.reason} required error={invalid === "reason" ? t.reasonRequired : undefined}><Select ref={field} value={reason} options={[{ value: "", label: t.reason }, { value: "CONFIGURATION_FIXED", label: t.configurationFixed }, { value: "MANUAL_RECONCILIATION", label: t.reconciliation }]} onChange={(event) => { setReason(event.target.value as RetryNotification["reason"] | ""); setInvalid(null); }} /></FormField>{item.status === "INDETERMINATE" && <><StatusMessage tone="warning">{t.duplicateHelp}</StatusMessage><Checkbox id={`${id}-duplicate`} label={t.duplicate} checked={ackDuplicate} aria-invalid={invalid === "ack"} aria-describedby={invalid === "ack" ? `${id}-duplicate-error` : undefined} onCheckedChange={(value) => { setAckDuplicate(value); setInvalid(null); }} />{invalid === "ack" && <p id={`${id}-duplicate-error`} role="alert" className="text-sm text-danger">{t.duplicateRequired}</p>}</>}{error && <NotificationError locale={locale} error={error} />}{unconfirmed && <StatusMessage tone="warning">{t.scopeChanged}</StatusMessage>}</div>
  </ConfirmationDialog></div>;
}

export function NotificationsPage({ locale, initial, expectedAccountId, permissions, query }: { locale: Locale; initial: AuthResult<NotificationPage>; expectedAccountId: string; permissions: string[]; query: NotificationListQuery }) {
  const t = getNotificationsDictionary(locale), id = useId(), { state: account, boundary } = useLearningAccount(notificationsHref(locale, query), expectedAccountId);
  const [result, setResult] = useState(initial), [refresh, setRefresh] = useState(0), [queued, setQueued] = useState(false), [pending, setPending] = useState(false), request = useRef(0);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const sequence = ++request.current, scope = boundary.capture();
    void listNotifications(query).then((value) => { if (!active || sequence !== request.current || !boundary.isCurrent(scope)) return; setResult(value); setPending(false); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, query, refresh]);
  function reload() { setPending(true); setRefresh((value) => value + 1); }
  if (account.status !== "active") return <NotificationsShell locale={locale} query={query}><div className="space-y-4">{account.status === "loading" ? <p role="status">{t.loading}</p> : <><StatusMessage tone="warning">{account.status === "changed" ? t.accountChanged : account.status === "expired" || account.status === "anonymous" ? t.expiredSession : t.unavailable}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", notificationsHref(locale, query))} prefetch={false}>{t.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{t.checkAccount}</Button></div></>}</div></NotificationsShell>;
  return <NotificationsShell locale={locale} query={query}><div className="space-y-6"><form method="get" action={notificationsPath(locale)} className="flex flex-wrap items-end gap-4"><FormField id={`${id}-status`} label={t.status}><Select name="status" defaultValue={query.status ?? ""} options={[{ value: "", label: t.all }, ...notificationStatuses.map((status) => ({ value: status, label: t.states[status] }))]} /></FormField><Button type="submit">{t.filter}</Button><Button variant="secondary" busy={pending} loadingLabel={t.loading} onClick={reload}>{t.refresh}</Button></form>{query.status && <Link href={notificationsPath(locale)} prefetch={false}>{t.clear}</Link>}{queued && <StatusMessage>{t.queued}</StatusMessage>}
    {!result.ok ? <NotificationError locale={locale} error={result.error} /> : result.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : <ul className="grid gap-4 xl:grid-cols-2">{result.data.items.map((item) => <li key={`notification:${item.id}`} className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6" data-notification-id={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">{t.types[item.type]}</h2><Badge tone={item.status === "SENT" ? "success" : item.status === "DEAD" || item.status === "INDETERMINATE" ? "warning" : "neutral"}>{t.states[item.status]}</Badge></div><dl className="grid gap-3 text-sm sm:grid-cols-2">{[
      { label: t.created, value: projectDate(item.createdAt, locale) }, { label: t.updated, value: projectDate(item.updatedAt, locale) }, { label: t.attempts, value: item.attempts }, { label: t.cycleAttempts, value: item.cycleAttempts }, { label: t.requeues, value: item.requeueCount }, { label: t.nextAttempt, value: item.nextAttemptAt ? projectDate(item.nextAttemptAt, locale) : t.unavailableValue },
    ].map((entry) => <div key={entry.label}><dt className="text-muted-foreground">{entry.label}</dt><dd className="mt-1 break-words font-medium">{entry.value}</dd></div>)}</dl><details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">{t.reference}</summary><dl className="space-y-3">{[{ label: t.reference, value: item.id }, { label: t.expires, value: projectDate(item.expiresAt, locale) }, { label: t.leaseUntil, value: item.leaseUntil ? projectDate(item.leaseUntil, locale) : t.unavailableValue }, { label: t.sent, value: item.sentAt ? projectDate(item.sentAt, locale) : t.unavailableValue }, { label: t.purged, value: item.purgedAt ? projectDate(item.purgedAt, locale) : t.unavailableValue }, { label: t.errorCode, value: item.lastErrorCode ?? t.unavailableValue }].map((entry) => <div key={entry.label}><dt className="text-muted-foreground">{entry.label}</dt><dd className="mt-1 break-all">{entry.value}</dd></div>)}</dl></details>{!item.payloadAvailable && <p className="text-sm text-muted-foreground">{t.expired}</p>}{permissions.includes("notifications.manage") && item.payloadAvailable && ["RETRY", "DEAD", "INDETERMINATE"].includes(item.status) && <RetryDelivery locale={locale} item={item} account={account} boundary={boundary} onQueued={() => { setQueued(true); reload(); }} />}</li>)}</ul>}
    {result.ok && result.data.total > result.data.pageSize && <Pagination label={t.pagination} page={result.data.page + 1} totalPages={Math.ceil(result.data.total / result.data.pageSize)} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.page} hrefForPage={(page) => notificationsHref(locale, { ...query, page: page - 1 })} />}
  </div></NotificationsShell>;
}
