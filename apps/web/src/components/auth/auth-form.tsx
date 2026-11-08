"use client";

import { useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Input, Link, StatusMessage } from "@/components/ui";
import { registerAccount, requestPasswordReset, resetPassword, signIn } from "@/lib/api/auth-client";
import { validNewPassword } from "@/lib/api/auth-validation";
import type { ApiError } from "@/lib/api/client";
import { authHref, type AuthScreen } from "@/lib/auth/routes";
import { getAuthDictionary, type AuthDictionary } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/locales";
import { AuthFrame } from "./auth-frame";
import { useAuthMemory } from "./auth-memory";
import { ResumeContext } from "./resume-context";

type Mode = Exclude<AuthScreen, "account">;
type Fields = Partial<Record<"email" | "displayName" | "password" | "confirmation", string>>;

export function authErrorCopy(error: ApiError, text: AuthDictionary): string {
  if (error.kind === "unavailable") return text.unavailable;
  if (error.kind === "invalid-response") return text.invalidResponse;
  const code = error.problem?.code;
  if (code === "ACCESS_DENIED") return text.FORBIDDEN;
  if (code === "INVALID_RESET_TOKEN") return text.invalidToken;
  if (code && ["BAD_CREDENTIALS", "EMAIL_ALREADY_REGISTERED", "CSRF_INVALID", "AUTHENTICATION_REQUIRED", "RATE_LIMITED", "VALIDATION_FAILED", "FORBIDDEN", "REVISION_CONFLICT"].includes(code)) return text[code as keyof AuthDictionary];
  return text.genericError;
}

function createResetTokenStore() {
  let token: string | null | undefined;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => token,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (token === undefined) {
        const params = new URLSearchParams(location.hash.slice(1));
        const value = params.get("token");
        token = params.size === 1 && value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
        if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
      }
      listener();
      return () => { listeners.delete(listener); };
    },
    clear() { token = null; listeners.forEach((listener) => listener()); },
  };
}

function useResetToken() {
  const store = useMemo(() => createResetTokenStore(), []);
  const token = useSyncExternalStore(store.subscribe, store.snapshot, () => undefined);
  return { token, clear: store.clear };
}

function PasswordInput({ text, ...props }: ComponentProps<"input"> & { text: AuthDictionary }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative min-w-0"><Input {...props} type={visible ? "text" : "password"} className="pr-24" />
    <Button variant="ghost" className="absolute right-0 top-0 px-3 text-sm" onClick={() => setVisible(!visible)} aria-pressed={visible} aria-controls={props.id}>{visible ? text.hide : text.show}</Button>
  </div>;
}

export function AuthForm({ locale, mode, returnTo, notice }: { locale: Locale; mode: Mode; returnTo: string; notice?: string }) {
  const text = getAuthDictionary(locale);
  const router = useRouter();
  const memory = useAuthMemory();
  const reset = useResetToken();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const passwordMode = mode !== "recover";
  const newPassword = mode === "sign-up" || mode === "reset";
  const title = mode === "sign-in" ? text.signIn : mode === "sign-up" ? text.signUp : mode === "recover" ? text.recover : text.reset;
  const description = mode === "sign-in" ? text.intro : mode === "sign-up" ? text.registerIntro : mode === "recover" ? text.recoverIntro : text.resetIntro;
  const noticeCopy = notice === "registered" ? text.registered : notice === "reset" ? text.resetDone : notice === "logged-out" ? text.loggedOut : notice === "required" ? text.sessionRequired : null;

  function focusField(errors: Fields) {
    const first = (["email", "displayName", "password", "confirmation"] as const).find((key) => errors[key]);
    const control = first ? form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`) : null;
    control?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const invalid: Fields = {};
    const email = memory.email.trim();
    if (mode !== "reset" && (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email))) invalid.email = text.emailInvalid;
    if (mode === "sign-up" && memory.displayName.length > 120) invalid.displayName = text.nameInvalid;
    if (passwordMode && (newPassword ? !validNewPassword(password) : !password)) invalid.password = newPassword ? text.passwordInvalid : text.required;
    if (newPassword && confirmation !== password) invalid.confirmation = text.passwordMismatch;
    setFields(invalid); setError(null); setSent(false);
    if (Object.keys(invalid).length) { focusField(invalid); return; }
    if (mode === "reset" && !reset.token) return;
    lock.current = true; setPending(true);
    try {
      const result = mode === "sign-in" ? await signIn(email, password)
        : mode === "sign-up" ? await registerAccount({ email, password, displayName: memory.displayName.trim() || undefined, locale })
          : mode === "recover" ? await requestPasswordReset({ email, locale })
            : await resetPassword({ token: reset.token!, newPassword: password });
      if (!result.ok) {
        setError(result.error);
        const serverFields: Fields = {};
        if (result.error.kind === "http") result.error.problem?.fieldErrors?.forEach(({ field }) => {
          if (field === "email") serverFields.email = text.emailInvalid;
          else if (field === "displayName") serverFields.displayName = text.nameInvalid;
          else if (field === "password" || field === "newPassword") serverFields.password = text.passwordInvalid;
        });
        setFields(serverFields);
        if (Object.keys(serverFields).length) focusField(serverFields);
        else requestAnimationFrame(() => errorBox.current?.focus());
        return;
      }
      if (mode === "sign-in") { window.location.assign(returnTo); return; }
      if (mode === "sign-up" || mode === "reset") {
        setPassword(""); setConfirmation("");
        if (mode === "reset") reset.clear();
        router.replace(authHref(locale, "sign-in", returnTo, mode === "sign-up" ? "registered" : "reset"));
        router.refresh();
      } else setSent(true);
    } finally { lock.current = false; setPending(false); }
  }

  const invalidReset = mode === "reset" && reset.token === null;
  return <AuthFrame locale={locale} screen={mode} title={title} description={description} returnTo={returnTo} resetToken={reset.token ?? undefined}>
    {noticeCopy && <StatusMessage tone="success">{noticeCopy}</StatusMessage>}
    <ResumeContext locale={locale} />
    {invalidReset ? <StatusMessage tone="danger" title={text.invalidToken}><Link href={authHref(locale, "recover", returnTo)} prefetch={false}>{text.requestNew}</Link></StatusMessage>
      : <form ref={form} onSubmit={(event) => void submit(event)} noValidate aria-busy={pending} className="space-y-5 rounded-panel border border-border bg-surface p-4 sm:p-6">
        {error && <div ref={errorBox} tabIndex={-1} className="rounded-input focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"><StatusMessage tone="danger" title={text.formError}>{authErrorCopy(error, text)}{error.kind === "http" && error.problem?.code === "INVALID_RESET_TOKEN" && <p className="mt-2"><Link href={authHref(locale, "recover", returnTo)} prefetch={false}>{text.requestNew}</Link></p>}</StatusMessage></div>}
        {sent && <StatusMessage tone="success">{text.neutralSent}</StatusMessage>}
        {mode !== "reset" && <FormField id="auth-email" label={text.email} error={fields.email} required><Input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" value={memory.email} onChange={(event) => memory.setEmail(event.target.value)} readOnly={pending} maxLength={320} /></FormField>}
        {mode === "sign-up" && <FormField id="auth-display-name" label={text.displayName} error={fields.displayName}><Input id="auth-display-name" name="displayName" autoComplete="nickname" value={memory.displayName} onChange={(event) => memory.setDisplayName(event.target.value)} readOnly={pending} /></FormField>}
        {passwordMode && <FormField id="auth-password" label={newPassword ? text.newPassword : text.password} hint={newPassword ? text.passwordHint : undefined} error={fields.password} required><PasswordInput id="auth-password" name="password" text={text} autoComplete={newPassword ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} readOnly={pending} /></FormField>}
        {newPassword && <FormField id="auth-confirmation" label={text.confirmPassword} error={fields.confirmation} required><PasswordInput id="auth-confirmation" name="confirmation" text={text} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} readOnly={pending} /></FormField>}
        <Button type="submit" busy={pending} aria-disabled={mode === "reset" && reset.token === undefined} loadingLabel={text.submitting} className="w-full">{mode === "recover" ? text.sendLink : mode === "reset" ? text.submitReset : title}</Button>
      </form>}
    <nav aria-label={text.accountNavigation} className="space-y-3 text-sm">
      {mode === "sign-in" ? <><p><Link href={authHref(locale, "recover", returnTo)} prefetch={false}>{text.forgot}</Link></p><p>{text.needAccount} <Link href={authHref(locale, "sign-up", returnTo)} prefetch={false}>{text.signUp}</Link></p></>
        : <p><Link href={authHref(locale, "sign-in", returnTo)} prefetch={false}>{mode === "sign-up" ? text.haveAccount : text.backSignIn}</Link></p>}
    </nav>
  </AuthFrame>;
}
