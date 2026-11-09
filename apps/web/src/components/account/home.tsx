"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ConfirmationDialog, FormField, Input, Link, StatusMessage } from "@/components/ui";
import { AccountSettings } from "@/components/auth/account-actions";
import { getAccountProfile, saveAccountProfile } from "@/lib/api/account-client";
import type { AuthResult, Preferences } from "@/lib/api/auth-client";
import type { ProfileView } from "@/lib/api/generated/types.gen";
import type { ApiError } from "@/lib/api/client";
import { accountPath, attestationsPath, dataRequestsPath, helpPath } from "@/lib/account/routes";
import { ordersPath } from "@/lib/commerce/routes";
import { entitlementsPath } from "@/lib/refunds/routes";
import { learningPath } from "@/lib/learning/routes";
import { getAccountDictionary } from "@/lib/i18n/account";
import { getOperationsDictionary } from "@/lib/i18n/operations";
import { operationsNavigation } from "@/lib/operations/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { AccountError, AccountNotice, AccountTextCopy } from "./parts";
import { AccountShell } from "./shell";

function ProfileForm({ locale, initial, expectedAccountId, account, boundary }: { locale: Locale; initial: AuthResult<ProfileView>; expectedAccountId: string; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getAccountDictionary(locale), [record, setRecord] = useState(initial), [name, setName] = useState(initial.ok ? initial.data.displayName ?? "" : "");
  const [error, setError] = useState<ApiError | null>(null), [pending, setPending] = useState(false), [saved, setSaved] = useState(false), [server, setServer] = useState<AuthResult<ProfileView> | null>(null), lock = useRef(false), lifetime = useRef(0), changes = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || account.status !== "active" || !record.ok || !record.etag || [...name].length > 120) return;
    lock.current = true; setPending(true); setError(null); setSaved(false); const scope = boundary.capture(), own = lifetime.current, edit = changes.current;
    try { const result = await saveAccountProfile(record.etag, { displayName: name.trim() || null }, expectedAccountId); if (own !== lifetime.current || !boundary.isCurrent(scope)) return;
      if (result.ok) { setRecord(result); setServer(null); if (edit === changes.current) { setName(result.data.displayName ?? ""); setSaved(true); } } else { setError(result.error); boundary.fail(result.error); }
    } finally { lock.current = false; if (own === lifetime.current) setPending(false); }
  }
  async function readCurrent() {
    if (lock.current || account.status !== "active") return; lock.current = true; setPending(true); const scope = boundary.capture(), own = lifetime.current;
    try { const result = await getAccountProfile(); if (own !== lifetime.current || !boundary.isCurrent(scope)) return; setServer(result); if (!result.ok) { setError(result.error); boundary.fail(result.error); } }
    finally { lock.current = false; if (own === lifetime.current) setPending(false); }
  }
  const allowed = account.status === "active", dirty = !record.ok || name !== (record.data.displayName ?? "");
  return <section className="space-y-5 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.profile}</h2>{record.ok && allowed && <div><p className="text-sm text-muted-foreground">{t.email}</p><p className="mt-1 break-words">{record.data.email}</p><p className="mt-2 text-sm text-muted-foreground">{t.emailReadOnly}</p></div>}
    <form data-account-profile onSubmit={event => void save(event)} aria-busy={pending} className="space-y-4"><FormField id="profile-name" label={t.displayName} hint={t.displayNameHelp} error={[...name].length > 120 ? t.tooLong : undefined}><Input name="displayName" value={name} autoComplete="name" disabled={!allowed} onChange={event => { changes.current++; setName(event.target.value); setSaved(false); }} /></FormField><div className="flex flex-wrap gap-3"><Button type="submit" busy={pending} aria-disabled={!allowed || pending || !record.ok || [...name].length > 120} loadingLabel={t.saving}>{t.saveProfile}</Button><Button variant="secondary" disabled={!allowed || pending} onClick={() => void readCurrent()}>{t.reload}</Button></div>{saved && allowed ? <StatusMessage tone="success">{t.saved}</StatusMessage> : dirty && <p role="status" className="text-sm text-muted-foreground">{t.modified}</p>}</form>
    {error && <AccountError locale={locale} error={error} />}{!record.ok && !error && <AccountError locale={locale} error={record.error} />}
    {server?.ok && allowed && <div className="space-y-4 rounded-input border border-control p-4"><h3 className="font-semibold">{t.serverVersion}</h3><p className="break-words">{server.data.displayName ?? t.none}</p><div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reloadTitle} description={t.reloadHelp} confirmLabel={t.useServer} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.useServer}</Button>} onConfirm={() => { changes.current++; setRecord(server); setName(server.data.displayName ?? ""); setSaved(false); setServer(null); setError(null); }} /><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => { setRecord(server); setServer(null); setError(null); setSaved(false); }}>{t.keepLocal}</Button></div><p className="text-sm text-muted-foreground">{t.keepLocalHelp}</p></div>}{dirty && <AccountTextCopy locale={locale} value={name} />}</section>;
}
export function AccountHome({ locale, expectedAccountId, initialProfile, initialPreferences, permissions }: { locale: Locale; expectedAccountId: string; initialProfile: AuthResult<ProfileView>; initialPreferences: AuthResult<Preferences>; permissions: string[] }) {
  const t = getAccountDictionary(locale), destination = accountPath(locale), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const operations = operationsNavigation(locale, permissions);
  const links = [{ title: t.purchases, help: t.purchasesHelp, label: t.allOrders, href: ordersPath(locale) }, { title: t.access, help: t.accessHelp, label: t.openAccess, href: entitlementsPath(locale) }, { title: t.attestations, help: t.attestationsHelp, label: t.attestations, href: attestationsPath(locale) }, { title: t.help, help: t.helpDescription, label: t.help, href: helpPath(locale) }, { title: t.data, help: t.dataDescription, label: t.data, href: dataRequestsPath(locale) }];
  return <AccountShell locale={locale}><AccountNotice locale={locale} account={account} boundary={boundary} destination={destination} /><div className="grid items-start gap-6 lg:grid-cols-2"><div className="min-w-0 space-y-6"><ProfileForm locale={locale} initial={initialProfile} expectedAccountId={expectedAccountId} account={account} boundary={boundary} /><AccountSettings locale={locale} expectedAccountId={expectedAccountId} initialPreferences={initialPreferences} account={account} boundary={boundary} /></div><div className="min-w-0 space-y-5">{links.map(item => <section key={item.href} className="space-y-3 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{item.title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{item.help}</p><Link href={item.href} prefetch={false} className="inline-flex min-h-11 items-center">{item.label}</Link></section>)}<Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{t.retainedWork}</Link>{account.status === "active" && operations.length > 0 && <section className="space-y-3 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{getOperationsDictionary(locale).navigation}</h2><ul className="space-y-2">{operations.map(item => <li key={item.key}><Link href={item.href} prefetch={false} className="inline-flex min-h-11 items-center">{item.label}</Link></li>)}</ul></section>}</div></div></AccountShell>;
}
