"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button, FormField, Link, Select, StatusMessage } from "@/components/ui";
import { signOut, updatePreferences, type AuthResult, type Preferences } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { authHref } from "@/lib/auth/routes";
import { getAuthDictionary } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/locales";
import { authErrorCopy } from "./auth-form";

export function AccountActions({ locale, initialPreferences }: { locale: Locale; initialPreferences: AuthResult<Preferences> }) {
  const text = getAuthDictionary(locale);
  const [preference, setPreference] = useState<Locale>(initialPreferences.ok ? initialPreferences.data.locale : locale);
  const [etag, setEtag] = useState(initialPreferences.ok ? initialPreferences.etag : undefined);
  const [pending, setPending] = useState<"logout" | "preferences" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  function showError(value: ApiError) { setError(value); requestAnimationFrame(() => errorBox.current?.focus()); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !etag) return;
    lock.current = true; setPending("preferences"); setError(null); setSaved(false);
    try {
      const result = await updatePreferences(preference, etag);
      if (result.ok) { setEtag(result.etag); setSaved(true); }
      else showError(result.error);
    } finally { lock.current = false; setPending(null); }
  }
  async function logout() {
    if (lock.current) return;
    lock.current = true; setPending("logout"); setError(null);
    try {
      const result = await signOut();
      if (result.ok) window.location.replace(authHref(locale, "sign-in", undefined, "logged-out"));
      else showError(result.error);
    } finally { lock.current = false; setPending(null); }
  }
  return <div className="space-y-6">
    {error && <div ref={errorBox} tabIndex={-1} className="rounded-input focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"><StatusMessage tone="danger" title={text.formError}><p>{authErrorCopy(error, text)}</p>{error.kind === "http" && error.status === 401 && <Link href={authHref(locale, "sign-in", undefined, "required")} prefetch={false}>{text.signIn}</Link>}</StatusMessage></div>}
    {initialPreferences.ok && etag ? <form onSubmit={(event) => void save(event)} className="space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6" aria-busy={pending === "preferences"}>
      <FormField id="preferred-locale" label={text.language}><Select id="preferred-locale" name="locale" value={preference} aria-disabled={Boolean(pending)} onChange={(event) => { if (!lock.current) { setPreference(event.target.value as Locale); setSaved(false); } }} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} /></FormField>
      <Button type="submit" busy={pending === "preferences"} aria-disabled={Boolean(pending)} loadingLabel={text.submitting}>{text.savePreferences}</Button>
      {saved && <StatusMessage tone="success">{text.preferenceSaved}</StatusMessage>}
    </form> : <StatusMessage tone="danger"><p>{text.preferenceUnavailable}</p><Link href={authHref(locale, "account")} prefetch={false}>{text.retry}</Link></StatusMessage>}
    <Button variant="secondary" busy={pending === "logout"} aria-disabled={Boolean(pending)} loadingLabel={text.loggingOut} onClick={() => void logout()}>{text.logout}</Button>
  </div>;
}
