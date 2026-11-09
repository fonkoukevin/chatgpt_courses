import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { getAuthDictionary } from '../../apps/web/src/lib/i18n/auth';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { authPath } from '../../apps/web/src/lib/auth/routes';
import { anonymousDraftKey } from '../../apps/web/src/lib/auth/anonymous-draft';
import { controlApi } from './control';

type Locale = 'fr' | 'en';
const password = () => `Test-${randomBytes(24).toString('base64url')}!`;
const email = () => `p04.${randomUUID()}@example.invalid`;
async function privateValuesAreAbsent(values: string[]) {
  const directory = process.env.COURSES_BROWSER_LOGS;
  if (!directory) throw new Error('Owned server log directory required.');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.log'));
  expect(files.length > 0).toBe(true);
  for (const file of files) {
    const output = await readFile(join(directory, file), 'utf8');
    expect(values.every((value) => !output.includes(value))).toBe(true);
  }
}
async function capture(page: Page, name: string, fullPage = true) {
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage, animations: 'disabled' });
}
async function csrf(request: APIRequestContext) {
  const response = await request.get('/api/v1/auth/csrf');
  expect(response.status()).toBe(200);
  const body = await response.json() as { token: string; headerName: string };
  expect(body.headerName).toBe('X-CSRF-TOKEN');
  expect(typeof body.token === 'string' && body.token.length > 0).toBe(true);
  return { [body.headerName]: body.token };
}
async function resetTokenFor(recipient: string): Promise<{ token: string; path: string }> {
  const origin = process.env.COURSES_MAILPIT_ORIGIN;
  if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Local Mailpit required.');
  for (let attempt = 0; attempt < 80; attempt++) {
    const search = await fetch(`${origin}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`);
    const result = await search.json() as { messages: Array<{ ID: string }> };
    if (result.messages?.[0]?.ID) {
      const message = await (await fetch(`${origin}/api/v1/message/${encodeURIComponent(result.messages[0].ID)}`)).json() as { Text: string };
      const candidate = message.Text.match(/https?:\/\/[^\s<>]+/g)?.find((url) => url.includes('#token='));
      if (!candidate) throw new Error('Reset link missing from the test message.');
      const link = new URL(candidate);
      expect(link.origin === process.env.COURSES_BROWSER_ORIGIN).toBe(true);
      expect(link.search.length).toBe(0);
      const value = new URLSearchParams(link.hash.slice(1)).get('token');
      expect(Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value))).toBe(true);
      return { token: value!, path: link.pathname };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('No reset email received in local Mailpit.');
}
async function fillSignIn(page: Page, locale: Locale, account: string, secret: string) {
  const text = getAuthDictionary(locale);
  await page.getByLabel(text.email).fill(account);
  await page.getByLabel(text.password).fill(secret);
  await page.getByRole('button', { name: text.signIn, exact: true }).click();
}

for (const locale of ['fr', 'en'] as const) {
  const text = getAuthDictionary(locale);
  for (const width of [1440, 768, 390, 320]) {
    test(`${locale} ${width}px : E06, clavier et erreurs lisibles`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('pageerror'));
      for (const mode of ['sign-in', 'sign-up', 'recover', 'reset'] as const) {
        const response = await page.goto(authPath(locale, mode));
        expect(response?.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        if (mode === 'reset') await expect(page.getByText(text.invalidToken, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await capture(page, `${locale}-${width}-${mode}`);
      }
      await page.goto(authPath(locale, 'sign-up'));
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await page.getByRole('button', { name: text.signUp, exact: true }).click();
      await expect(page.getByLabel(text.email)).toBeFocused();
      await page.getByRole('button', { name: text.show, exact: true }).first().click();
      await expect(page.locator('#auth-password')).toHaveAttribute('type', 'text');
      await page.getByRole('button', { name: text.hide, exact: true }).first().click();
      await expect(page.locator('#auth-password')).toHaveAttribute('type', 'password');
      await page.getByLabel(text.email).fill(email());
      await page.getByLabel(text.newPassword).fill('short');
      await page.getByRole('button', { name: text.signUp, exact: true }).click();
      await expect(page.locator('#auth-password')).toBeFocused();
      await expect(page.getByText(text.passwordInvalid, { exact: true })).toBeVisible();
      if (width === 320) await capture(page, `${locale}-320-validation`);
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} : vrai compte, session persistée, préférences et logout`, async ({ page, context, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const address = email(); const secret = password();
    await page.goto(authPath(locale, 'sign-up'));
    await page.getByLabel(text.email).fill(address);
    await page.getByLabel(text.newPassword).fill(secret);
    await page.getByLabel(text.confirmPassword).fill(secret);
    await page.getByLabel(text.displayName, { exact: true }).fill(locale === 'fr' ? 'Compte de test P04' : 'P04 test account');
    await page.getByRole('button', { name: text.signUp, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(authPath(locale, 'sign-in')));
    await expect(page.getByText(text.registered, { exact: true })).toBeVisible();
    const before = (await context.cookies()).find((cookie) => cookie.name === 'SESSION')?.value;
    await fillSignIn(page, locale, address, secret);
    await expect(page).toHaveURL(new RegExp(`${authPath(locale, 'account')}$`));
    await expect(page.getByText(address, { exact: true })).toBeVisible();
    const after = (await context.cookies()).find((cookie) => cookie.name === 'SESSION');
    expect(Boolean(after && after.value !== before && after.httpOnly && after.sameSite === 'Lax' && after.path === '/')).toBe(true);
    const preferences = await context.request.get('/api/v1/me/preferences');
    expect(preferences.status()).toBe(200);
    expect(preferences.headers()['cache-control']).toContain('no-store');
    expect(Boolean(preferences.headers().etag)).toBe(true);
    await page.getByLabel(text.language, { exact: true }).selectOption(locale === 'fr' ? 'en' : 'fr');
    await page.getByRole('button', { name: text.savePreferences, exact: true }).click();
    await expect(page.getByText(text.preferenceSaved, { exact: true })).toBeVisible();
    const current = await (await context.request.get('/api/v1/me/preferences')).json() as { locale: string };
    expect(current.locale).toBe(locale === 'fr' ? 'en' : 'fr');
    await capture(page, `${locale}-account-persisted`);
    await controlApi('stop-api');
    await page.reload();
    await expect(page.getByText(text.accountUnavailable, { exact: true })).toBeVisible();
    await expect(page.getByText(address, { exact: true })).toHaveCount(0);
    await capture(page, `${locale}-account-api-unavailable`);
    await controlApi('start-api');
    await page.reload();
    await expect(page.getByText(address, { exact: true })).toBeVisible();
    const fresh = await browser.newContext();
    try {
      const other = await fresh.newPage();
      await other.goto(`${process.env.COURSES_BROWSER_ORIGIN}${authPath(locale, 'account')}`);
      await expect(other).toHaveURL(new RegExp(authPath(locale, 'sign-in')));
      await fillSignIn(other, locale, address, secret);
      await expect(other).toHaveURL(new RegExp(`${authPath(locale, 'account')}$`));
      await expect(other.getByLabel(text.language, { exact: true })).toHaveValue(locale === 'fr' ? 'en' : 'fr');
    } finally { await fresh.close(); }
    await page.evaluate(() => sessionStorage.setItem('chatgpt-courses:personal:test', 'temporary-cache-probe'));
    await page.getByRole('button', { name: text.logout, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(authPath(locale, 'sign-in')));
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    expect(await page.evaluate(() => sessionStorage.getItem('chatgpt-courses:personal:test') === null)).toBe(true);
    await privateValuesAreAbsent([address, secret]);
  });

  test(`${locale} : récupération reçue dans Mailpit et jeton à usage unique`, async ({ page, context }) => {
    const address = email(); const oldPassword = password(); const newPassword = password();
    let headers = await csrf(context.request);
    const registered = await context.request.post('/api/v1/auth/register', { headers, data: { email: address, password: oldPassword, locale } });
    expect(registered.status()).toBe(201);
    await page.goto(authPath(locale, 'recover'));
    await page.getByLabel(text.email).fill(address);
    await page.getByRole('button', { name: text.sendLink, exact: true }).click();
    await expect(page.getByText(text.neutralSent, { exact: true })).toBeVisible();
    const recovery = await resetTokenFor(address);
    await page.addInitScript((value) => { if (location.pathname.endsWith('/reinitialisation') || location.pathname.endsWith('/reset-password')) history.replaceState(null, '', `${location.pathname}#token=${value}`); }, recovery.token);
    await page.goto(recovery.path);
    await expect(page.getByLabel(text.newPassword)).toBeVisible();
    expect(new URL(page.url()).hash.length).toBe(0);
    const currentLanguage = page.getByRole('link', { name: locale === 'fr' ? 'Français' : 'English', exact: true });
    expect(Boolean((await currentLanguage.getAttribute('href'))?.includes('#token='))).toBe(false);
    const otherLanguage = page.getByRole('link', { name: locale === 'fr' ? 'English' : 'Français', exact: true });
    expect((await otherLanguage.getAttribute('href'))?.split('#token=')[1] === recovery.token).toBe(true);
    await currentLanguage.click();
    expect(new URL(page.url()).hash.length).toBe(0);
    await page.getByLabel(text.newPassword).fill(newPassword);
    await page.getByLabel(text.confirmPassword).fill(newPassword);
    await page.getByRole('button', { name: text.submitReset, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(authPath(locale, 'sign-in')));
    await expect(page.getByText(text.resetDone, { exact: true })).toBeVisible();
    headers = await csrf(context.request);
    expect((await context.request.post('/api/v1/auth/password-resets', { headers, data: { token: recovery.token, newPassword: password() } })).status()).toBe(400);
    await fillSignIn(page, locale, address, newPassword);
    await expect(page).toHaveURL(new RegExp(`${authPath(locale, 'account')}$`));
    expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((value) => !String(value).includes('#token=')))).toBe(true);
    await capture(page, `${locale}-reset-account`);
    await privateValuesAreAbsent([address, oldPassword, newPassword, recovery.token]);
  });
}

test('essai temporaire, retour validé et refus des mutations de proxy non conformes', async ({ page, context }) => {
  const locale = 'fr'; const text = getAuthDictionary(locale); const learning = getShowcaseDictionary(locale).learning;
  const address = email(); const secret = password();
  let headers = await csrf(context.request);
  expect((await context.request.post('/api/v1/auth/register', { headers, data: { email: address, password: secret, locale } })).status()).toBe(201);
  expect((await context.request.post('/api/v1/auth/login', { form: { email: address, password: secret } })).status()).toBe(403);
  expect((await context.request.post('/api/v1/auth/register', { headers: { ...headers, Origin: 'https://evil.example.invalid' }, data: { email: email(), password: password(), locale } })).status()).toBe(403);
  expect((await context.request.post('/api/v1/auth/register', { headers, data: 'x'.repeat(65537) })).status()).toBe(413);
  await page.goto('/fr/dev/learning');
  await page.getByRole('tab', { name: learning.write, exact: true }).click();
  const draft = page.getByRole('textbox', { name: learning.draftLabel, exact: true });
  const body = 'Exemple fictif P04 : clarifier les quatre livrables, sans engagement inventé.';
  await draft.fill(body);
  await page.getByRole('button', { name: text.draftSave, exact: true }).click();
  await expect(page.getByText(text.draftSaved, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: text.draftKeep, exact: true }).click();
  await fillSignIn(page, locale, address, secret);
  await expect(page).toHaveURL(/\/fr\/dev\/learning$/);
  await page.getByRole('tab', { name: learning.write, exact: true }).click();
  await page.getByRole('button', { name: text.draftRestore, exact: true }).click();
  expect((await draft.inputValue()) === body).toBe(true);
  expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).expiresAt > Date.now(), anonymousDraftKey)).toBe(true);
  await capture(page, 'fr-temporary-trial-restored');
  headers = await csrf(context.request);
  const current = await context.request.get('/api/v1/auth/me'); expect(current.status()).toBe(200);
  const actor = (await current.json() as {id:string}).id;
  expect((await context.request.post('/api/v1/auth/logout', { headers: { ...headers, 'X-Account-Context': actor } })).status()).toBe(204);
  await page.goto('/fr/connexion?returnTo=https%3A%2F%2Fevil.example.invalid');
  await fillSignIn(page, locale, address, secret);
  await expect(page).toHaveURL(/\/fr\/compte$/);
});
