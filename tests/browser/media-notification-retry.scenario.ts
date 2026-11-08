import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { NotificationPage, NotificationSummary } from '../../apps/web/src/lib/api/generated/types.gen';
import { getNotificationsDictionary } from '../../apps/web/src/lib/i18n/notifications';
import { notificationsHref } from '../../apps/web/src/lib/notifications/routes';
import { controlApi } from './control';
import { csrfHeaders } from './editorial-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';

function grantNotificationOperations(actor: string) {
  const container = process.env.COURSES_BROWSER_DB_ID, run = process.env.COURSES_BROWSER_RUN_ID;
  if (process.env.APP_ENV !== 'test' || !container || !/^[a-f0-9]{64}$/.test(container) || !run || !/^[a-f0-9-]{36}$/.test(actor)) throw new Error('Owned disposable database required.');
  const inspect = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.chatgptcourses.browser-run" }}', container], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (inspect.status !== 0 || inspect.stdout.trim() !== run) throw new Error('Disposable database ownership was not confirmed.');
  const role = randomUUID(), code = `P10_MAIL_RETRY_${randomUUID().replaceAll('-', '').toUpperCase()}`;
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'browser_test', '-d', 'courses_browser', '-At'], { windowsHide: true, encoding: 'utf8', timeout: 10000,
    input: `BEGIN;\nINSERT INTO roles(id,code) VALUES('${role}','${code}');\nINSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('notifications.read','notifications.manage');\nINSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}');\nCOMMIT;\nSELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id='${role}' AND p.code IN('notifications.read','notifications.manage');\n` });
  if (result.status !== 0 || !/\n2\s*$/.test(result.stdout)) throw new Error('Explicit notification operator grant was not confirmed.');
}
async function operations(request: APIRequestContext): Promise<NotificationSummary[]> {
  const response = await request.get('/api/v1/admin/notifications?page=0&pageSize=100'); expect(response.status()).toBe(200);
  return (await response.json() as NotificationPage).items;
}
async function recipientMessageCount(recipient: string): Promise<number> {
  const origin = process.env.COURSES_MAILPIT_ORIGIN;
  if (!origin) throw new Error('Owned Mailpit origin required.');
  const base = new URL(origin);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Local Mailpit required.');
  try {
    const response = await fetch(`${origin}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new Error('Mailpit response unavailable.');
    const result = await response.json() as { messages?: Array<{ To?: Array<{ Address?: string }> }> };
    if (!Array.isArray(result.messages)) throw new Error('Mailpit search response invalid.');
    return result.messages.filter((message) => message.To?.some((to) => to.Address === recipient)).length;
  } catch { throw new Error('Local Mailpit search could not be checked; recipient omitted.'); }
}

export function registerNotificationRetryScenario() {
  test('fr · transport réellement interrompu, reprise explicite avec risque de doublon puis un seul email', async ({ page, context, playwright }) => {
    const t = getNotificationsDictionary('fr'), operator = await methodLearner(context.request, 'fr'); grantNotificationOperations(operator.id); await loginMethodAccount(context.request, operator);
    await expect.poll(async () => (await operations(context.request)).every((item) => item.status === 'SENT' || item.status === 'DEAD'), { timeout: 30000 }).toBe(true);
    const before = new Set((await operations(context.request)).map((item) => item.id));
    const registration = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      await controlApi('pause-mailpit');
      const recipient = await methodLearner(registration, 'fr');
      let targetId: string | undefined;
      await expect.poll(async () => {
        const created = (await operations(context.request)).filter((item) => !before.has(item.id) && item.type === 'ACCOUNT_CREATED');
        if (created.length !== 1) return false;
        targetId = created[0].id; return created[0].status === 'INDETERMINATE';
      }, { timeout: 40000, intervals: [250, 500, 1000] }).toBe(true);
      if (!targetId) throw new Error('A real indeterminate notification is required.');
      const notificationId = targetId;
      await controlApi('resume-mailpit');
      expect(await recipientMessageCount(recipient.email)).toBe(0);
      await page.setViewportSize({ width: 390, height: 844 }); await page.goto(notificationsHref('fr', { status: 'INDETERMINATE' }));
      const item = page.locator(`[data-notification-id="${notificationId}"]`); await expect(item).toContainText(t.states.INDETERMINATE);
      const prepare = item.getByRole('button', { name: t.retryAction, exact: true }); await expect(prepare).toBeEnabled(); await prepare.click();
      const dialog = page.getByRole('alertdialog', { name: t.retryTitle, exact: true }), confirm = dialog.getByRole('button', { name: t.confirm, exact: true });
      const writes: string[] = []; page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/admin/notifications/${notificationId}/retry`)) writes.push(request.method()); });
      await confirm.click(); await expect(dialog.getByText(t.reasonRequired, { exact: true })).toBeVisible(); expect(writes.length).toBe(0);
      await dialog.getByRole('combobox', { name: t.reason, exact: true }).selectOption('CONFIGURATION_FIXED');
      await confirm.click(); await expect(dialog.getByText(t.duplicateRequired, { exact: true })).toBeVisible(); expect(writes.length).toBe(0);
      await dialog.getByRole('checkbox', { name: t.duplicate, exact: true }).check();
      expect((await page.content()).includes(recipient.email)).toBe(false);
      await dialog.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'fr-390-notification-indeterminate-confirmation.png'), animations: 'disabled' });
      const queued = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/admin/notifications/${notificationId}/retry`));
      await confirm.click(); const response = await queued; expect(response.status()).toBe(200);
      const request = JSON.parse(response.request().postData()!) as unknown; expect(request).toEqual({ reason: 'CONFIGURATION_FIXED', ackDuplicate: true });
      await expect(page.getByText(t.queued, { exact: true })).toBeVisible(); expect(writes.length).toBe(1);
      await expect.poll(async () => { const current = (await operations(context.request)).find((entry) => entry.id === notificationId); return current?.status === 'SENT' && current.payloadAvailable === false && current.sentAt !== null && current.requeueCount === 1; }, { timeout: 30000 }).toBe(true);
      await expect.poll(() => recipientMessageCount(recipient.email), { timeout: 10000 }).toBe(1);
      const duplicate = await context.request.post(`/api/v1/admin/notifications/${notificationId}/retry`, { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': operator.id }, data: { reason: 'CONFIGURATION_FIXED', ackDuplicate: true } }); expect(duplicate.status()).toBe(409);
      expect(await recipientMessageCount(recipient.email)).toBe(1);
      await page.goto(notificationsHref('fr', { status: 'SENT' })); const delivered = page.locator(`[data-notification-id="${notificationId}"]`); await expect(delivered).toContainText(t.states.SENT); await expect(delivered.getByRole('button', { name: t.retryAction, exact: true })).toHaveCount(0);
      expect((await page.content()).includes(recipient.email)).toBe(false); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await delivered.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'fr-390-notification-transport-accepted.png'), animations: 'disabled' });
    } finally {
      try { await controlApi('resume-mailpit'); } finally { await registration.dispose(); }
    }
  });
}
