"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, FormField, Link, Select, StatusMessage } from "@/components/ui";
import { getPreferences, signOut, updatePreferences, type AuthResult, type Preferences } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { accountPath } from "@/lib/account/routes";
import { authHref } from "@/lib/auth/routes";
import { getAccountDictionary } from "@/lib/i18n/account";
import { localeName, unsavedChangesMessage, type Locale } from "@/lib/i18n/locales";
import { useUnsavedInput } from "@/components/learning/unsaved";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { AccountError, AccountNotice } from "../account/parts";

export function AccountSettings({ locale, initialPreferences, expectedAccountId, account, boundary }: { locale: Locale; initialPreferences: AuthResult<Preferences>; expectedAccountId: string; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getAccountDictionary(locale), [record, setRecord] = useState(initialPreferences), [preference, setPreference] = useState<Locale>(initialPreferences.ok ? initialPreferences.data.locale : locale);
  const [pending, setPending] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState<ApiError | null>(null), lock = useRef(false), lifetime = useRef(0), edits = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  async function action(kind: "save" | "read" | "logout") {
    if (lock.current || account.status !== "active" || kind === "save" && (!record.ok || !record.etag)) return;
    lock.current = true; setPending(true); setSaved(false); setError(null); const scope = boundary.capture(), own = lifetime.current, change = edits.current;
    try {
      if (kind === "logout") { const result = await signOut(expectedAccountId); if (result.ok) window.location.replace(authHref(locale, "sign-in", undefined, "logged-out")); else if (own === lifetime.current && boundary.isCurrent(scope)) { setError(result.error); boundary.fail(result.error); } return; }
      const result = kind === "read" ? await getPreferences() : await updatePreferences(preference, record.ok ? record.etag! : "", expectedAccountId);
      if (own !== lifetime.current || !boundary.isCurrent(scope)) return;
      if (result.ok) { setRecord(result); setSaved(kind === "save" && change === edits.current); } else { setError(result.error); boundary.fail(result.error); }
    } finally { lock.current = false; if (own === lifetime.current) setPending(false); }
  }
  const enabled = account.status === "active" && !pending;
  useUnsavedInput(pending || preference !== (record.ok ? record.data.locale : locale), unsavedChangesMessage(locale), boundary);
  return <div className="space-y-6"><section className="space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.preferences}</h2><p className="text-sm text-muted-foreground">{t.languageHelp}</p>
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void action("save"); }} className="space-y-4" aria-busy={pending} data-account-preferences>
      <FormField id="preferred-locale" label={t.interfaceLanguage}><Select value={preference} disabled={!enabled} onChange={event => { edits.current++; setPreference(event.target.value as Locale); setSaved(false); }} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} /></FormField>
      <div className="flex flex-wrap gap-3"><Button type="submit" className="max-w-full whitespace-normal" aria-disabled={!enabled || !record.ok} busy={pending} loadingLabel={t.saving}>{t.savePreferences}</Button><Button variant="secondary" disabled={!enabled} onClick={() => void action("read")}>{t.reload}</Button></div>
      {record.ok && account.status === "active" && <p className="text-sm text-muted-foreground">{t.serverVersion} : {localeName(record.data.locale)}</p>}{saved && account.status === "active" && <StatusMessage tone="success">{t.saved}</StatusMessage>}
    </form>{error && <AccountError locale={locale} error={error} />}{!record.ok && !error && <AccountError locale={locale} error={record.error} />}</section>
    <section className="space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.security}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.securityHelp}</p><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "recover")} prefetch={false} className="inline-flex min-h-11 items-center">{t.resetPassword}</Link><Button variant="secondary" disabled={!enabled} busy={pending} onClick={() => void action("logout")}>{t.logout}</Button></div></section></div>;
}
export function AccountActions(props: { locale: Locale; initialPreferences: AuthResult<Preferences>; expectedAccountId: string }) {
  const destination = accountPath(props.locale), { state: account, boundary } = useLearningAccount(destination, props.expectedAccountId);
  return <><AccountNotice locale={props.locale} account={account} boundary={boundary} destination={destination} /><AccountSettings {...props} account={account} boundary={boundary} /></>;
}
