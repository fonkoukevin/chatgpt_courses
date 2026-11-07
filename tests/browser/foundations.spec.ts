import { expect, test, type Page, type Response } from '@playwright/test';
import { join } from 'node:path';
import { controlApi } from './control';

const labels = {
  fr: { heading: 'Apprendre. Produire. Vérifier.', skip: 'Aller au contenu', check: 'Vérifier la connexion',
    error: 'Tester une erreur API', healthy: 'Connexion confirmée', missing: 'Erreur HTTP 404', unavailable: 'Service indisponible', retry: 'Réessayer' },
  en: { heading: 'Learn. Produce. Verify.', skip: 'Skip to content', check: 'Check the connection',
    error: 'Test an API error', healthy: 'Connection confirmed', missing: 'HTTP error 404', unavailable: 'Service unavailable', retry: 'Try again' },
} as const;
type Locale = keyof typeof labels;

function responseFor(page: Page, endpoint: 'health' | 'unknown') {
  return page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/system/${endpoint}` && response.request().method() === 'GET');
}
async function capture(page: Page, name: string) {
  const directory = process.env.COURSES_BROWSER_EVIDENCE;
  if (!directory || !/^[a-z0-9-]+$/.test(name)) throw new Error('Destination de capture invalide.');
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function assertHealthy(page: Page, response: Response, locale: Locale) {
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'UP' });
  await expect(page.getByRole('status')).toContainText(labels[locale].healthy);
}

for (const width of [1440, 390, 320]) {
  for (const locale of ['fr', 'en'] as const) {
    test(`${locale} ${width}px : clavier, API réelle et erreur 404`, async ({ page }) => {
      const copy = labels[locale];
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const navigation = await page.goto(`/${locale}`);
      expect(navigation?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      // Only keyboard navigation: skip link, then the real connection controls.
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: copy.skip })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/${locale}#main-content$`));
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: copy.check, exact: true })).toBeFocused();
      const health = responseFor(page, 'health');
      await page.keyboard.press('Enter');
      await assertHealthy(page, await health, locale);
      await capture(page, `${locale}-${width}-healthy`);

      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: copy.error, exact: true })).toBeFocused();
      const missing = responseFor(page, 'unknown');
      await page.keyboard.press('Enter');
      const response = await missing;
      expect(response.status()).toBe(404);
      expect(response.headers()['content-type']).toContain('application/problem+json');
      expect(await response.json()).toMatchObject({ status: 404, traceId: expect.any(String), code: expect.any(String) });
      await expect(page.getByRole('status')).toContainText(copy.missing);
      await expect(page.getByRole('status')).not.toContainText(copy.healthy);
      await expect(page.getByRole('button', { name: copy.retry, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(pageErrors).toEqual([]);
      await capture(page, `${locale}-${width}-http404`);
    });
  }
}

test('panne réelle de l’API, interface disponible et reprise FR/EN', async ({ context }) => {
  const pages: Array<{ page: Page; locale: Locale }> = [];
  let outageError: unknown;
  try {
    const stopped = await controlApi('stop-api');
    for (const locale of ['fr', 'en'] as const) {
      const page = await context.newPage();
      pages.push({ page, locale });
      const navigation = await page.goto(`/${locale}`);
      expect(navigation?.status()).toBe(200); // Next stays running while Spring is stopped.
      const health = responseFor(page, 'health');
      await page.getByRole('button', { name: labels[locale].check, exact: true }).click();
      const response = await health;
      expect([502, 503, 504]).toContain(response.status());
      expect(await response.json()).toMatchObject({ code: 'API_UNAVAILABLE', traceId: expect.any(String) });
      await expect(page.getByRole('status')).toContainText(labels[locale].unavailable);
      await expect(page.getByRole('status')).not.toContainText(labels[locale].healthy);
      await capture(page, `${locale}-api-unavailable`);
    }
    const restarted = await controlApi('start-api');
    expect(restarted.webPid).toBe(stopped.webPid); // No restart of Next masks the failure/recovery.
    for (const { page, locale } of pages) {
      const health = responseFor(page, 'health');
      await page.getByRole('button', { name: labels[locale].retry, exact: true }).click();
      await assertHealthy(page, await health, locale);
      await capture(page, `${locale}-api-recovered`);
    }
  } catch (error) {
    outageError = error;
    throw error;
  } finally {
    // Restore the dedicated API even after an assertion fails; the supervisor
    // later attempts every process cleanup and reports failures together.
    try { await controlApi('start-api'); }
    catch (restoreError) { throw new AggregateError([outageError, restoreError].filter(Boolean), 'Restauration API non confirmée.'); }
  }
});
