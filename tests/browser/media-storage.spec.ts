import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { AssetPage } from '../../apps/web/src/lib/api/generated/types.gen';
import { getAssetsDictionary } from '../../apps/web/src/lib/i18n/assets';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { createPersonalProject, createProjectFixture, type ProjectFixture } from './projects-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';
import { csrfHeaders } from './editorial-fixture';
import { controlApi } from './control';
import { registerMediaUiScenarios } from './media-ui.scenarios';
import { registerVideoPlaybackScenarios } from './media-playback.scenarios';
import { registerNotificationRetryScenario } from './media-notification-retry.scenario';

type Locale = 'fr' | 'en';
async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function files(request: APIRequestContext, project: string) {
  const r = await request.get(`/api/v1/me/projects/${project}/attachments`); expect(r.status()).toBe(200);
  return await r.json() as AssetPage;
}

test.describe('P10 stockage réel, fichiers privés et emails', () => {
  let editor: APIRequestContext, fixture: ProjectFixture;
  test.beforeAll(async ({ playwright }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    fixture = await createProjectFixture(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });

  for (const locale of ['fr', 'en'] as const) test(`${locale} · transfert S3 CORS, confirmation distincte et téléchargement privé`, async ({ page, context, browser }) => {
    const t = getAssetsDictionary(locale), account = await methodLearner(context.request, locale);
    await loginMethodAccount(context.request, account);
    const project = await createPersonalProject(context.request, account.id, fixture.BR01[locale]);
    const bytes = Buffer.from(`P10 explicitly synthetic attachment ${randomUUID()}\n`, 'utf8');
    const requests: Promise<boolean>[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(process.env.S3_EXTERNAL_ENDPOINT!)) requests.push(request.allHeaders().then((headers) => !headers.cookie && !headers['x-csrf-token'] && !headers['x-account-context']));
    });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(projectsPath(locale, project.id));
    await page.getByRole('tab', { name: t.files, exact: true }).click();
    const panel = page.locator('[data-project-files]'), upload = panel.locator('[data-asset-upload-state]');
    await expect(upload.getByLabel(t.choose, { exact: true })).toBeEnabled();
    await expect(upload).toContainText('application/pdf'); await expect(upload).toContainText(t.formatUnavailable);
    await upload.getByLabel(t.choose, { exact: true }).setInputFiles({ name: 'p10-verification.txt', mimeType: 'text/plain', buffer: bytes });
    await upload.getByRole('button', { name: t.transfer, exact: true }).click();
    await expect(upload).toHaveAttribute('data-asset-upload-state', 'transferred');
    const pending = await files(context.request, project.id); expect(pending.items.length).toBe(1); expect(pending.items[0].state).toBe('PENDING');
    await capture(page, `${locale}-390-transferred-not-ready`);
    await upload.getByRole('button', { name: t.confirm, exact: true }).click();
    await expect(upload).toHaveAttribute('data-asset-upload-state', 'ready');
    const ready = await files(context.request, project.id); expect(ready.items[0].state).toBe('READY');
    await expect(panel.getByRole('button', { name: t.download, exact: true })).toBeEnabled();
    const download = page.waitForEvent('download'); await panel.getByRole('button', { name: t.download, exact: true }).click();
    const completed = await download, path = await completed.path(); expect(path !== null).toBe(true);
    expect((await readFile(path!)).equals(bytes)).toBe(true);
    expect(requests.length >= 2).toBe(true); expect((await Promise.all(requests)).every(Boolean)).toBe(true);
    expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((value) => !String(value).includes('X-Amz-Signature')))).toBe(true);
    await capture(page, `${locale}-390-file-ready`); await page.setViewportSize({ width: 1440, height: 1000 }); await capture(page, `${locale}-1440-file-ready`);

    const other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const stranger = await methodLearner(other.request, locale); await loginMethodAccount(other.request, stranger);
      expect((await other.request.get(`/api/v1/me/projects/${project.id}/attachments`)).status()).toBe(404);
      const forbidden = await other.request.post(`/api/v1/assets/${ready.items[0].id}/download-access`, { headers: { ...await csrfHeaders(other.request), 'X-Account-Context': stranger.id }, data: null });
      expect(forbidden.status()).toBe(404);
      const missingContext = await context.request.post(`/api/v1/assets/${ready.items[0].id}/download-access`, { headers: await csrfHeaders(context.request), data: null });
      expect(missingContext.status()).toBe(428);
    } finally { await other.close(); }
  });

  test('panne API pendant autorisation : fichier en mémoire et reprise explicite', async ({ page, context }) => {
    const t = getAssetsDictionary('fr'), account = await methodLearner(context.request); await loginMethodAccount(context.request, account);
    const project = await createPersonalProject(context.request, account.id, fixture.BR01.fr);
    await page.goto(projectsPath('fr', project.id)); await page.getByRole('tab', { name: t.files, exact: true }).click();
    const upload = page.locator('[data-asset-upload-state]'); await expect(upload.getByLabel(t.choose, { exact: true })).toBeEnabled();
    await upload.getByLabel(t.choose, { exact: true }).setInputFiles({ name: 'p10-recovery.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic recovery fixture\n') });
    try {
      await controlApi('stop-api'); await upload.getByRole('button', { name: t.transfer, exact: true }).click();
      await expect(upload).toHaveAttribute('data-asset-upload-state', 'error'); await expect(upload).toContainText(t.unavailable);
      expect(await upload.locator('input[type=file]').evaluate((input) => (input as HTMLInputElement).files?.length)).toBe(1);
      await capture(page, 'fr-1440-upload-api-unavailable');
    } finally { await controlApi('start-api'); }
    await upload.getByRole('button', { name: t.transfer, exact: true }).click(); await expect(upload).toHaveAttribute('data-asset-upload-state', 'transferred');
    await upload.getByRole('button', { name: t.confirm, exact: true }).click(); await expect(upload).toHaveAttribute('data-asset-upload-state', 'ready');
    await capture(page, 'fr-1440-upload-recovered');
  });
});

registerMediaUiScenarios();
registerVideoPlaybackScenarios();
registerNotificationRetryScenario();
