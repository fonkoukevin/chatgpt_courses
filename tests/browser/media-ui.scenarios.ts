import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { AssetUploadIntent, AssetView, NotificationPage } from '../../apps/web/src/lib/api/generated/types.gen';
import { getVideoDictionary } from '../../apps/web/src/lib/i18n/video';
import { getAssetsDictionary } from '../../apps/web/src/lib/i18n/assets';
import { getCmsDictionary } from '../../apps/web/src/lib/i18n/cms';
import { getNotificationsDictionary } from '../../apps/web/src/lib/i18n/notifications';
import { notificationsPath } from '../../apps/web/src/lib/notifications/routes';
import { activityDiscoveryHref } from '../../apps/web/src/lib/public/routes';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { createContent, currentContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publishPublicContent } from './public-content-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';

async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function captureRegion(page: Page, region: Locator, name: string) {
  const original = page.viewportSize()!, bounds = await region.boundingBox(); if (!bounds) throw new Error('A visible media region is required.');
  try {
    await page.setViewportSize({ width: original.width, height: Math.max(original.height, Math.ceil(bounds.height) + 80) });
    await page.getByRole('main').focus(); await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
  } finally { await page.setViewportSize(original); }
}
async function observeS3Transport(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page), methods = new Map<string, string>();
  const observations: Array<{ method: string; status?: number; netCode?: string; corsBlocked?: boolean; corsOriginAllowed?: boolean; corsPutAllowed?: boolean; corsContentTypeAllowed?: boolean }> = [];
  const origin = process.env.S3_EXTERNAL_ENDPOINT;
  if (!origin) throw new Error('Disposable S3 endpoint required.');
  session.on('Network.requestWillBeSent', ({ requestId, request }) => { if (request.url.startsWith(origin)) methods.set(requestId, request.method); });
  session.on('Network.responseReceived', ({ requestId, response }) => {
    const method = methods.get(requestId); if (!method) return;
    const headers = Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
    observations.push({ method, status: response.status, corsOriginAllowed: ['*', process.env.COURSES_BROWSER_ORIGIN].includes(headers['access-control-allow-origin']), corsPutAllowed: /(?:^|[,\s])PUT(?:$|[,\s])/i.test(headers['access-control-allow-methods'] ?? ''), corsContentTypeAllowed: /(?:^|[,\s])(?:content-type|\*)(?:$|[,\s])/i.test(headers['access-control-allow-headers'] ?? '') });
  });
  session.on('Network.loadingFailed', ({ requestId, errorText, corsErrorStatus }) => { const method = methods.get(requestId); if (method) observations.push({ method, netCode: /^net::[A-Z0-9_]+$/.test(errorText) ? errorText : 'UNCLASSIFIED_NETWORK_FAILURE', corsBlocked: Boolean(corsErrorStatus) }); });
  await session.send('Network.enable');
  return async () => {
    try { await test.info().attach('s3-transport-sanitized', { body: Buffer.from(JSON.stringify(observations)), contentType: 'application/json' }); }
    finally { await session.detach(); }
  };
}

// Small generated raster used only by the disposable test. It is not course media.
function syntheticPng() {
  function chunk(name: string, bytes: Buffer) {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
    let crc = 0xffffffff; for (const byte of Buffer.concat([type, bytes])) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([length, type, bytes, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(24); header.writeUInt32BE(24, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(24 * (1 + 24 * 3)); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const offset = y * 73 + 1 + x * 3; pixels[offset] = x < 12 ? 24 : 232; pixels[offset + 1] = y < 12 ? 79 : 232; pixels[offset + 2] = 138; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function grantNotificationRead(actor: string) {
  const container = process.env.COURSES_BROWSER_DB_ID, run = process.env.COURSES_BROWSER_RUN_ID;
  if (process.env.APP_ENV !== 'test' || !container || !/^[a-f0-9]{64}$/.test(container) || !run || !/^[a-f0-9-]{36}$/.test(actor)) throw new Error('Owned disposable database required.');
  const inspect = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.chatgptcourses.browser-run" }}', container], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (inspect.status !== 0 || inspect.stdout.trim() !== run) throw new Error('Disposable database ownership was not confirmed.');
  const role = randomUUID(), code = `P10_NOTIFICATIONS_${randomUUID().replaceAll('-', '').toUpperCase()}`;
  const grant = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'browser_test', '-d', 'courses_browser', '-At'], { windowsHide: true, encoding: 'utf8', timeout: 10000,
    input: `BEGIN;\nINSERT INTO roles(id,code) VALUES('${role}','${code}');\nINSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code='notifications.read';\nINSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}');\nCOMMIT;\nSELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id='${role}' AND p.code='notifications.read';\n` });
  if (grant.status !== 0 || !/\n1\s*$/.test(grant.stdout)) throw new Error('Explicit notification read grant was not confirmed.');
}

export function registerMediaUiScenarios() {
  for (const locale of ['fr', 'en'] as const) test(`${locale} · image CMS réellement transférée, ajout volontaire, publication et lecture publique`, async ({ page, context, browser }) => {
    const finishDiagnostics = await observeS3Transport(context, page);
    try {
    const t = getAssetsDictionary(locale), cms = getCmsDictionary(locale); await loginEditor(context.request);
    const original = await createContent(context.request, editorialContent(locale)), label = locale === 'fr' ? 'Image de test synthétique à quatre couleurs' : 'Synthetic four-colour test image';
    await page.goto(`/${locale}/admin/content/${original.value.id}/edit`);
    const container = page.locator('[data-editorial-asset-upload]'), upload = container.locator('[data-asset-upload-state]');
    await expect(upload.getByLabel(t.choose, { exact: true })).toBeEnabled();
    await upload.getByLabel(t.choose, { exact: true }).setInputFiles({ name: 'p10-synthetic-image.png', mimeType: 'image/png', buffer: syntheticPng() });
    const intentResponse = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith('/admin/assets/upload-intents'));
    await upload.getByRole('button', { name: t.transfer, exact: true }).click(); const intent = await intentResponse; expect(intent.status()).toBe(201); const pending = await intent.json() as AssetUploadIntent;
    await expect(upload).toHaveAttribute('data-asset-upload-state', 'transferred');
    const confirmation = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith(`/admin/assets/${pending.asset.id}/confirmations`));
    await upload.getByRole('button', { name: t.confirm, exact: true }).click(); const confirmed = await confirmation; expect(confirmed.status()).toBe(200); const ready = await confirmed.json() as AssetView; expect(ready.state).toBe('READY');
    await expect(upload).toHaveAttribute('data-asset-upload-state', 'ready');
    const unchanged = await currentContent(context.request, original.value.id); expect(unchanged.value.currentRevisionId).toBe(original.value.currentRevisionId); expect(unchanged.value.document!.media).toEqual([]);
    await container.getByRole('textbox', { name: t.referenceLabel, exact: true }).fill(label); await container.getByRole('button', { name: t.preview, exact: true }).click();
    const preview = container.getByRole('img', { name: label, exact: true }); await expect(preview).toBeVisible(); await expect.poll(() => preview.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 24)).toBe(true);
    await container.getByRole('button', { name: t.addReference, exact: true }).click(); await page.getByRole('alertdialog', { name: t.addTitle, exact: true }).getByRole('button', { name: t.addReference, exact: true }).click();
    await expect(page.getByRole('textbox', { name: cms.assetId, exact: true })).toHaveValue(ready.id);
    await page.locator('#cms-reason').fill('P10 explicit verified image reference, draft only before review');
    const saved = page.waitForResponse((value) => value.request().method() === 'POST' && value.url().endsWith(`/admin/contents/${original.value.id}/revisions`));
    await page.getByRole('button', { name: cms.save, exact: true }).click(); expect((await saved).status()).toBe(200); await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
    const draft = await currentContent(context.request, original.value.id); expect(draft.value.state).toBe('DRAFT'); expect(draft.value.publishedRevisionId).toBeNull(); expect(draft.value.document!.media[0]).toEqual({ assetId: ready.id, kind: 'IMAGE', label, required: false });
    for (const width of [1440, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await captureRegion(page, container, `${locale}-${width}-cms-image-ready-reference`); }
    const published = await publishPublicContent(context.request, draft), visitor = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const publicPage = await visitor.newPage(), requests: Promise<boolean>[] = [];
      publicPage.on('request', (request) => { if (request.url().startsWith(process.env.S3_EXTERNAL_ENDPOINT!)) requests.push(request.allHeaders().then((headers) => !headers.cookie && !headers['x-csrf-token'] && !headers['x-account-context'])); });
      await publicPage.goto(activityDiscoveryHref(locale, published.value.resourceId, published.value.versionId));
      const media = publicPage.locator('[data-learning-media]'); await media.getByRole('button', { name: t.showImage, exact: true }).click();
      const image = media.getByRole('img', { name: label, exact: true }); await expect(image).toBeVisible(); await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth === 24)).toBe(true);
      expect(requests.length).toBe(1); expect((await Promise.all(requests)).every(Boolean)).toBe(true); expect(await image.getAttribute('src')).toMatch(/^blob:/);
      expect(await publicPage.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((value) => !String(value).includes('X-Amz-Signature')))).toBe(true);
      for (const width of [1440, 390, 320]) { await publicPage.setViewportSize({ width, height: width >= 768 ? 1000 : 844 }); await captureRegion(publicPage, media, `${locale}-${width}-public-image`); }
    } finally { await visitor.close(); }
    } finally { await finishDiagnostics(); }
  });

  for (const locale of ['fr', 'en'] as const) test(`${locale} · référence vidéo absente : texte utile sans lecteur ou durée inventés`, async ({ page, context }) => {
    await loginEditor(context.request); const command = editorialContent(locale);
    command.document.media = [{ assetId: randomUUID(), kind: 'VIDEO', required: false, label: locale === 'fr' ? 'Vidéo absente du dossier de test' : 'Missing video in the test case' }];
    const published = await publishPublicContent(context.request, await createContent(context.request, command));
    await page.goto(activityDiscoveryHref(locale, published.value.resourceId, published.value.versionId));
    await expect(page.getByText(getVideoDictionary(locale).unavailable, { exact: true })).toBeVisible(); await expect(page.getByText(command.document.objective, { exact: true })).toBeVisible(); await expect(page.locator('video')).toHaveCount(0);
    for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 }); await captureRegion(page, page.locator('[data-learning-media]'), `${locale}-${width}-video-absent-text-fallback`); }
  });

  for (const locale of ['fr', 'en'] as const) test(`${locale} · suivi opérateur expurgé et permissions vérifiées réellement`, async ({ page, context, browser }) => {
    const t = getNotificationsDictionary(locale), account = await methodLearner(context.request, locale); grantNotificationRead(account.id); await loginMethodAccount(context.request, account);
    const response = await context.request.get('/api/v1/admin/notifications?page=0&pageSize=20'); expect(response.status()).toBe(200); const notifications = await response.json() as NotificationPage; expect(notifications.items.length > 0).toBe(true);
    const allowed = ['id', 'type', 'status', 'attempts', 'cycleAttempts', 'requeueCount', 'nextAttemptAt', 'leaseUntil', 'lastErrorCode', 'createdAt', 'updatedAt', 'expiresAt', 'sentAt', 'purgedAt', 'payloadAvailable'];
    expect(notifications.items.every((item) => Object.keys(item).every((key) => allowed.includes(key)))).toBe(true); expect(JSON.stringify(notifications).includes(account.email)).toBe(false);
    await page.goto(notificationsPath(locale)); await expect(page.getByRole('heading', { level: 1, name: t.title, exact: true })).toBeVisible(); await expect(page.locator('[data-notification-id]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: t.retryAction, exact: true })).toHaveCount(0); expect((await page.content()).includes(account.email)).toBe(false);
    const deniedRetry = await context.request.post(`/api/v1/admin/notifications/${notifications.items[0].id}/retry`, { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': account.id }, data: { reason: 'MANUAL_RECONCILIATION', ackDuplicate: true } }); expect(deniedRetry.status()).toBe(403);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 }); await capture(page, `${locale}-${width}-notification-operations-readonly`);
      await captureRegion(page, page.locator('[data-notification-id]').first(), `${locale}-${width}-notification-first-card`);
    }
    const other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const stranger = await methodLearner(other.request, locale); await loginMethodAccount(other.request, stranger); expect((await other.request.get('/api/v1/admin/notifications')).status()).toBe(403);
      const blocked = await other.newPage(); await blocked.goto(notificationsPath(locale)); await expect(blocked.getByText(t.forbidden, { exact: true })).toBeVisible(); await expect(blocked.locator('[data-notification-id]')).toHaveCount(0);
    } finally { await other.close(); }
  });
}
