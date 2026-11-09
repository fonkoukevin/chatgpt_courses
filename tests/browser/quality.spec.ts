import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ProjectView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getCmsSlugDictionary } from '../../apps/web/src/lib/i18n/cms-slug';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { getPublicPageDictionary } from '../../apps/web/src/lib/i18n/public-pages';
import { cmsPath } from '../../apps/web/src/lib/cms/routes';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { resourceHref } from '../../apps/web/src/lib/public/routes';
import { projectEtag } from '../../apps/web/src/lib/api/projects-validation';
import { accountHeaders, uploadSupportFile } from './account-fixture';
import { checkedUuid, commerceSql } from './commerce-fixture';
import { createContent, currentContent, contentAction } from './editorial-api';
import { editorialContent } from './editorial-content';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { fillMethodLogin, loginMethodAccount, methodLearner } from './methods-fixture';
import { patchProject, projectRecord } from './projects-fixture';
import { publishPublicContent } from './public-content-fixture';
import { privateTextNotStored, qualityCapture, qualityLearner } from './quality-fixture';

const t = getProjectsDictionary('fr');
const checks: Record<string, unknown> = {};
function proof(name: string, facts: Record<string, unknown>) {
  const path = join(process.env.COURSES_BROWSER_EVIDENCE!, 'quality-behaviour-checks.json');
  // Playwright replaces a failed worker; keep already observed checks from the same isolated run.
  const previous: unknown = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  if (previous && typeof previous === 'object' && 'phase' in previous && previous.phase === 'P17' && 'checks' in previous && typeof previous.checks === 'object') Object.assign(checks, previous.checks);
  checks[name] = facts;
  writeFileSync(path, JSON.stringify({
    phase: 'P17', source: 'Real Chromium / Spring / isolated PostgreSQL and S3', checks,
    limits: ['Local HTTP cookie Secure=false; production cookie policy is a separate configuration check.',
      'No paid entitlement is manufactured; P12/P15 historical access incidents remain tracked separately.',
      'Keyboard samples and selected security scenarios do not constitute a WCAG certification or penetration test.'],
  }, null, 2) + '\n', 'utf8');
}
async function openProject(page: Page, value: ProjectView) {
  await page.goto(projectsPath('fr', value.id));
  await expect(page.getByRole('textbox', { name: t.objective, exact: true })).toBeEnabled();
}
const projectForm = (page: Page) => page.locator('[data-project-save-state]');
const saveButton = (page: Page) => projectForm(page).locator('button[type="submit"]');
const projectResponse = (page: Page, id: string) => page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/v1/me/projects/${id}`);
async function fieldErrorLinked(field: Locator) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(await field.evaluate(node => {
    const ids = (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    return ids.some(id => { const description = document.getElementById(id); return Boolean(description?.textContent?.trim() && description.getClientRects().length); });
  })).toBe(true);
}

test.describe('P17 qualité transversale avec services réels', () => {
  test('01 · clavier CMS, erreur associée et deux dialogues sans mutation implicite', async ({ page, context }) => {
    const editor = await loginEditor(context.request), command = editorialContent('fr'); command.kind = 'GUIDE';
    const source = await createContent(context.request, command), copy = getCmsSlugDictionary('fr');
    await page.goto(cmsPath('fr', source.value.id));
    const trigger = page.locator('[data-cms-slug]').getByRole('button', { name: copy.open, exact: true });
    await expect(trigger).toBeEnabled(); await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: copy.title, exact: true }), slug = dialog.getByLabel(copy.slug), reason = dialog.getByLabel(copy.reason);
    await expect(dialog).toBeVisible();
    expect(await dialog.getAttribute('aria-describedby')).toBeTruthy();
    await expect(slug).toBeEnabled(); await slug.fill('INVALID / ADDRESS'); await reason.fill('');
    await dialog.getByRole('button', { name: copy.confirm, exact: true }).press('Enter');
    await expect(slug).toBeFocused(); await fieldErrorLinked(slug); await fieldErrorLinked(reason);
    const next = `p17-keyboard-${randomUUID()}`; await slug.fill(next); await reason.fill('Vérification clavier locale, sans enregistrement.');
    await reason.press('Tab');
    await expect(dialog.getByRole('button', { name: copy.confirm, exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); const confirmation = page.getByRole('alertdialog', { name: copy.confirmTitle, exact: true });
    await expect(confirmation).toBeVisible();
    // A complete backward/forward cycle must stay in the nested modal, including its cancel button.
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press(index < 3 ? 'Shift+Tab' : 'Tab');
      expect(await confirmation.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await qualityCapture(page, 'fr-390-keyboard-nested-confirmation', 390);
    await page.keyboard.press('Escape'); await expect(confirmation).toBeHidden();
    await expect(dialog.getByRole('button', { name: copy.confirm, exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    // Closing preserves the proposal; returning never submits it.
    await page.keyboard.press('Enter'); await expect(slug).toHaveValue(next); await expect(reason).not.toHaveValue('');
    const actual = await currentContent(context.request, source.value.id);
    expect(actual.value.slug === source.value.slug && actual.value.revision === source.value.revision).toBe(true);
    await privateTextNotStored(page, 'Vérification clavier locale, sans enregistrement.');
    await qualityCapture(page, 'fr-390-keyboard-slug-retained', 390);
    proof('01', { keyboardOpen: true, invalidFocusAndDescription: true, nestedFocusContained: true, escapeReturnsFocus: true, proposalRetained: true, serverRevisionUnchanged: true, editorSessionAuthenticated: Boolean(editor.id) });
  });

  test('02 · hors ligne réel et accusé serveur tardif conservent les retouches', async ({ page, context, browser }) => {
    const own = await qualityLearner(context.request), observer = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      await loginMethodAccount(observer.request, own.account); await openProject(page, own.project);
      const input = page.getByRole('textbox', { name: t.objective, exact: true }), offline = `P17 offline ${randomUUID()}`;
      await input.fill(offline); await context.setOffline(true);
      try {
        await saveButton(page).press('Enter'); await expect(projectForm(page)).toHaveAttribute('data-project-save-state', 'error');
        await expect(input).toHaveValue(offline); await privateTextNotStored(page, offline);
        expect((await projectRecord(observer.request, own.project.id)).revision).toBe(own.project.revision);
        await qualityCapture(page, 'fr-390-offline-input-retained', 390);
      } finally { await context.setOffline(false); }
      // A real online server read precedes checking that reconnect did not retry the failed mutation.
      expect((await context.request.get('/api/v1/auth/me')).status()).toBe(200);
      expect((await projectRecord(observer.request, own.project.id)).revision).toBe(own.project.revision);
      let entered!: () => void, release!: () => void;
      const reached = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
      const endpoint = `**/api/v1/me/projects/${own.project.id}`;
      await page.route(endpoint, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        const response = await route.fetch(); expect(response.status()).toBe(200); entered(); await hold; await route.fulfill({ response });
      });
      const acknowledged = projectResponse(page, own.project.id);
      try {
        await saveButton(page).press('Enter'); await reached;
        expect((await projectRecord(observer.request, own.project.id)).fields.objective === offline).toBe(true);
        const newer = `P17 newer input ${randomUUID()}`; await input.fill(newer); release();
        expect((await acknowledged).status()).toBe(200);
        await expect(projectForm(page)).toHaveAttribute('data-project-save-state', 'modified'); await expect(input).toHaveValue(newer);
        expect((await projectRecord(observer.request, own.project.id)).fields.objective === offline).toBe(true);
        await privateTextNotStored(page, newer); await qualityCapture(page, 'fr-390-late-ack-newer-input', 390);
      } finally { release(); await page.unroute(endpoint); }
      proof('02', { actualBrowserOffline: true, serverUnchangedOfflineAndOnReconnect: true, explicitSaveRequired: true, serverCommittedBeforeHeldResponse: true, newerInputStillModified: true, privateStorageAbsent: true });
    } finally { await context.setOffline(false); await observer.close(); }
  });

  test('03 · conflit PostgreSQL et expiration réelle de session sans perte de saisie', async ({ page, context, browser }) => {
    const own = await qualityLearner(context.request), observer = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      await loginMethodAccount(observer.request, own.account); await openProject(page, own.project);
      const local = `P17 retained conflict ${randomUUID()}`, remote = `P17 server revision ${randomUUID()}`;
      const input = page.getByRole('textbox', { name: t.objective, exact: true }); await input.fill(local);
      const changed = await patchProject(observer.request, own.account.id, own.project, { ...own.project.fields, objective: remote }); expect(changed.status()).toBe(200);
      const current = await changed.json() as ProjectView, rejected = projectResponse(page, own.project.id);
      await saveButton(page).press('Enter'); expect((await rejected).status()).toBe(412);
      await expect(page.getByRole('heading', { name: t.conflictTitle, exact: true })).toBeVisible(); await expect(input).toHaveValue(local);
      await expect(page.locator('pre').filter({ hasText: remote })).toBeVisible(); await qualityCapture(page, 'fr-390-conflict-comparison', 390);
      await page.getByRole('button', { name: t.keepLocal, exact: true }).press('Enter');
      const confirmation = page.getByRole('alertdialog', { name: t.keepLocal, exact: true });
      await confirmation.getByRole('button', { name: t.keepLocal, exact: true }).press('Enter');
      await expect(projectForm(page)).toHaveAttribute('data-project-save-state', 'modified'); await expect(input).toHaveValue(local);
      expect((await projectRecord(observer.request, own.project.id)).revision).toBe(current.revision);
      // JdbcIndexedSessionRepository reconstructs MapSession from LAST_ACCESS_TIME and MAX_INACTIVE_INTERVAL;
      // EXPIRY_TIME is the cleanup index, not the authority used by MapSession.isExpired().
      const expired = commerceSql(`WITH moment AS (SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint AS ms), expired AS (UPDATE spring_session SET creation_time=least(creation_time,moment.ms-(max_inactive_interval::bigint+60)*1000), last_access_time=moment.ms-(max_inactive_interval::bigint+60)*1000, expiry_time=moment.ms-60000 FROM moment WHERE principal_name='${checkedUuid(own.account.id)}' RETURNING 1) SELECT count(*) FROM expired;`);
      expect(Number(expired) >= 2).toBe(true);
      expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
      const refused = projectResponse(page, own.project.id); await saveButton(page).press('Enter');
      // Spring's CSRF filter can reject the expired session before the authentication entry point.
      const mutationAfterExpiryStatus = (await refused).status(); expect([401, 403]).toContain(mutationAfterExpiryStatus);
      await expect(page.getByText(t.expiredSession, { exact: true }).first()).toBeVisible(); await expect(input).toHaveValue(local);
      await privateTextNotStored(page, local); await qualityCapture(page, 'fr-390-real-session-expired', 390);
      await loginMethodAccount(observer.request, own.account);
      expect((await projectRecord(observer.request, own.project.id)).revision).toBe(current.revision);
      proof('03', { concurrentServerRevision: true, ifMatchRefusal: 412, explicitRebaseNoWrite: true, persistedSessionExpiry: true, actualMeStatus: 401, mutationAfterExpiryStatus, localInputRetained: true, noNewServerRevision: true });
    } finally { await observer.close(); }
  });

  test('04 · propriété, liens S3, permissions financières et préconditions de compte', async ({ page, context, browser, playwright }) => {
    const own = await qualityLearner(context.request), other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    const editorContext = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }), binary = await playwright.request.newContext();
    try {
      const ownerSsr = await page.goto(projectsPath('fr', own.project.id));
      expect(ownerSsr?.status()).toBe(200); expect(ownerSsr?.headers()['cache-control']).toContain('no-store');
      expect((await page.content()).includes(own.marker)).toBe(true);
      expect(ownerSsr?.headers()['x-robots-tag']).toContain('noindex');
      const uploaded = await uploadSupportFile(context.request, binary, own.account.id, own.project.id, 'p17-private-owner.txt');
      const foreign = await methodLearner(other.request); await loginMethodAccount(other.request, foreign);
      expect((await other.request.get(`/api/v1/me/projects/${own.project.id}`)).status()).toBe(404);
      expect((await other.request.get(`/api/v1/me/projects/${own.project.id}/attachments`)).status()).toBe(404);
      expect((await other.request.post(`/api/v1/assets/${uploaded.asset.id}/download-access`, { headers: await accountHeaders(other.request, foreign.id), data: null })).status()).toBe(404);
      const foreignPage = await other.newPage(), navigation = await foreignPage.goto(projectsPath('fr', own.project.id));
      expect(navigation?.status()).toBe(404); expect(navigation?.headers()['cache-control']).toContain('no-store');
      expect((await foreignPage.content()).includes(own.marker)).toBe(false);
      expect(navigation?.headers()['x-robots-tag']).toContain('noindex');
      await expect(foreignPage.getByRole('heading', { name: getPublicPageDictionary('fr').notFoundTitle, exact: true })).toBeVisible(); await qualityCapture(foreignPage, 'fr-390-other-owner-no-private-content', 390);
      await loginEditor(editorContext);
      expect((await editorContext.get('/api/v1/admin/contents')).status()).toBe(200);
      expect((await editorContext.get('/api/v1/admin/offers')).status()).toBe(403);
      expect((await editorContext.get(`/api/v1/me/projects/${own.project.id}`)).status()).toBe(404);
      const path = `/api/v1/me/projects/${own.project.id}`, data = { fields: { ...own.project.fields, objective: 'P17 rejected mutation' }, stage: own.project.stage };
      expect((await context.request.patch(path, { headers: { 'X-Account-Context': own.account.id, 'If-Match': projectEtag(own.project) }, data })).status()).toBe(403);
      expect((await context.request.patch(path, { headers: { ...await csrfHeaders(context.request), 'If-Match': projectEtag(own.project) }, data })).status()).toBe(428);
      expect((await context.request.patch(path, { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': foreign.id, 'If-Match': projectEtag(own.project) }, data })).status()).toBe(409);
      expect((await projectRecord(context.request, own.project.id)).revision).toBe(own.project.revision);
      const cookie = (await context.cookies()).find(value => value.name === 'SESSION');
      expect(Boolean(cookie && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/' && !cookie.secure)).toBe(true);
      await openProject(page, own.project); await privateTextNotStored(page, own.marker);
      proof('04', { actualS3UploadReady: true, ownerSsrStatus: 200, ownerMarkerPresentForOwner: true, otherOwnerProjectAndNewLinkStatus: 404, privateSsrNoStoreAndNoindex: true, ownerMarkerAbsentForOtherAccount: true, editorCmsStatus: 200, editorFinanceStatus: 403, missingCsrf: 403, missingAccountContext: 428, changedAccountContext: 409, serverUnchanged: true, localCookieHttpOnlySameSiteLax: true });
    } finally { await other.close(); await editorContext.dispose(); await binary.dispose(); }
  });

  test('05 · texte éditorial échappé, origine et retour contrôlés, iframe réellement bloquée', async ({ page, context, browser }) => {
    await loginEditor(context.request);
    const command = editorialContent('fr'), payload = '<img src=x onerror="window.__qualityPwned=1">';
    command.kind = 'GUIDE'; command.title = 'P17 texte éditorial littéral'; command.document!.blocks = [{ type: 'PARAGRAPH', text: payload, url: null }];
    const guide = await publishPublicContent(context.request, await createContent(context.request, command));
    const unsafe = await context.request.post(`/api/v1/admin/contents/${guide.value.id}/revisions`, { headers: { ...await csrfHeaders(context.request), 'If-Match': guide.etag }, data: {
      title: guide.value.title, summary: guide.value.summary, document: { ...guide.value.document!, blocks: [{ type: 'LINK', text: 'Unsafe URL rejected', url: 'javascript:alert(1)' }] }, reason: 'P17 input validation verification',
    } }); expect(unsafe.status()).toBe(400); expect((await currentContent(context.request, guide.value.id)).value.revision).toBe(guide.value.revision);
    const publicPage = await page.goto(resourceHref({ locale: 'fr', kind: 'GUIDE', slug: guide.value.slug, resourceId: guide.value.resourceId, versionId: guide.value.versionId }));
    expect(publicPage?.status()).toBe(200); await expect(page.getByText(payload, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => '__qualityPwned' in window)).toBe(false); expect(await page.locator('img[onerror]').count()).toBe(0);
    await qualityCapture(page, 'fr-390-editorial-html-literal', 390);
    const own = await qualityLearner(context.request), forged = await context.request.patch(`/api/v1/me/projects/${own.project.id}`, { headers: { ...await accountHeaders(context.request, own.account.id, projectEtag(own.project)), Origin: 'https://foreign.invalid', 'X-Forwarded-Host': 'foreign.invalid', 'X-Forwarded-Proto': 'https' }, data: { fields: own.project.fields, stage: own.project.stage } });
    expect(forged.status()).toBe(403); expect((await forged.json() as { code: string }).code).toBe('INVALID_REQUEST_ORIGIN');
    expect((await projectRecord(context.request, own.project.id)).revision).toBe(own.project.revision);
    const anonymous = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const account = await methodLearner(anonymous.request), login = await anonymous.newPage();
      await login.goto('/fr/connexion?returnTo=https%3A%2F%2Fforeign.invalid%2F'); await fillMethodLogin(login, 'fr', account);
      await expect(login).toHaveURL(`${process.env.COURSES_BROWSER_ORIGIN}/fr/compte`);
    } finally { await anonymous.close(); }
    let refusedFrame = false;
    page.on('console', message => { if (/frame-ancestors|X-Frame-Options|Refused to frame/i.test(message.text())) refusedFrame = true; });
    const frameResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/fr' && response.request().isNavigationRequest());
    await page.setContent('<!doctype html><html lang="fr"><title>P17 parent de contrôle</title><body><iframe title="P17 app frame" src="/fr"></iframe></body></html>');
    const actual = await frameResponse; expect(actual.status()).toBe(200);
    const headers = actual.headers(); expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'"); expect(headers['content-security-policy']).toContain("object-src 'none'"); expect(headers['content-security-policy']).toContain("base-uri 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()']) expect(headers['permissions-policy']).toContain(feature);
    await expect.poll(() => refusedFrame).toBe(true);
    expect(await page.locator('iframe').evaluate(node => { try { return Boolean((node as HTMLIFrameElement).contentDocument?.querySelector('main')); } catch { return false; } })).toBe(false);
    proof('05', { publishedLiteralHtmlEscaped: true, javascriptUrlRejected: 400, forgedUnsafeOriginRejected: 403, externalReturnToRejected: true, actualIframeResponse: 200, chromiumFramePolicyBlocked: true, cspFrameObjectBaseAndXfo: true, permissionsPolicy: true });
  });
});
