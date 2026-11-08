import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { MethodView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getMethodsDictionary } from '../../apps/web/src/lib/i18n/methods';
import { getMethodPageDictionary } from '../../apps/web/src/lib/i18n/method-pages';
import { getCmsDictionary } from '../../apps/web/src/lib/i18n/cms';
import { getMethodEditorialDictionary } from '../../apps/web/src/lib/i18n/method-editorial';
import { methodsPath } from '../../apps/web/src/lib/methods/routes';
import { methodDraftPrefix } from '../../apps/web/src/lib/auth/method-draft';
import { csrfHeaders } from './editorial-fixture';
import { contentAction, currentContent } from './editorial-api';
import { publishPublicContent } from './public-content-fixture';
import { controlApi } from './control';
import { authPath, createMethodSources, createPersonalMethod, fillMethodLogin, loginMethodAccount, methodFields, methodLearner, methodRecord, methodSourceHref, patchPersonalMethod } from './methods-fixture';

async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function captureSection(page: Page, section: Locator, name: string) {
  const original = page.viewportSize()!, bounds = await section.boundingBox();
  if (!bounds) throw new Error('Visible section required for the screenshot.');
  try {
    await page.setViewportSize({ width: original.width, height: Math.max(original.height, Math.ceil(bounds.height) + 80) });
    await section.locator('textarea').first().focus();
    await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
    await section.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
  } finally { await page.setViewportSize(original); }
}
async function captureConfirmation(page: Page, dialog: Locator, name: string) {
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').first().focus();
  await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: false, animations: 'disabled' });
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function privateMarkerNotStored(page: Page, marker: string) {
  expect(await page.evaluate((value) => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((item) => !String(item).includes(value)), marker)).toBe(true);
}

test.describe('P07 real methods', () => {
  let editor: APIRequestContext;
  let sources: Awaited<ReturnType<typeof createMethodSources>>;
  test.beforeAll(async ({ playwright }) => {
    editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    sources = await createMethodSources(editor);
  });
  test.afterAll(async () => { await editor?.dispose(); });

  for (const locale of ['fr', 'en'] as const) test(`${locale} : visiteur, connexion, import volontaire, sauvegarde et seconde session`, async ({ page, context, browser }) => {
    const t = getMethodsDictionary(locale), bridge = getMethodPageDictionary(locale), source = sources[locale];
    const account = await methodLearner(context.request, locale);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(methodSourceHref(source, locale));
    await expect(page.getByRole('heading', { level: 1, name: source.value.title })).toBeVisible();
    await capture(page, `${locale}-1440-source-method`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: t.prepare, exact: true }).click();
    const output = page.getByLabel(t.output, { exact: true });
    await expect(output).not.toHaveValue('');
    const personalText = `${await output.inputValue()}\nP07 local adaptation ${randomUUID()}`;
    await output.fill(personalText);
    await page.getByLabel(t.fields.constraints, { exact: true }).fill('P07 changed constraint without rewriting my text');
    await expect(output).toHaveValue(personalText);
    await expect(page.getByText(t.stale, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: t.copy, exact: true }).click();
    await expect(page.getByText(t.copied, { exact: true })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.replace(/\r\n/g, '\n')).toBe(personalText.replace(/\r\n/g, '\n'));
    const title = `P07 ${locale} proposal ${randomUUID()}`;
    await page.getByRole('textbox', { name: bridge.title, exact: true }).fill(title);
    await capture(page, `${locale}-390-source-generator`);
    await page.getByRole('button', { name: bridge.keepAndSignIn, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(locale === 'fr' ? '/fr/connexion' : '/en/sign-in'));
    expect(await page.evaluate((prefix) => Object.keys(sessionStorage).some((key) => key.startsWith(prefix)), methodDraftPrefix)).toBe(true);
    await fillMethodLogin(page, locale, account);
    await expect(page).toHaveURL(new RegExp(locale === 'fr' ? '/fr/espace/methodes/nouvelle' : '/en/my/methods/new'));
    await expect(page.getByRole('button', { name: bridge.importAction, exact: true })).toBeVisible();
    const before = await context.request.get('/api/v1/me/methods');
    expect((await before.json() as { total: number }).total).toBe(0);
    await page.getByRole('button', { name: bridge.importAction, exact: true }).click();
    await expect(page.getByLabel(t.output, { exact: true })).toHaveValue(personalText);
    const privateNotes = `P07-private-note-${randomUUID()}`;
    await page.getByLabel(t.notes, { exact: true }).fill(privateNotes);
    await privateMarkerNotStored(page, privateNotes);
    const createdResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/me/methods/from-template'));
    await page.getByRole('button', { name: t.save, exact: true }).click();
    const response = await createdResponse; expect(response.status()).toBe(201);
    const saved = await response.json() as MethodView;
    expect(saved.text === personalText && saved.notes === privateNotes).toBe(true);expect(saved.origin?.revisionId).toBe(source.value.publishedRevisionId);
    await expect(page).toHaveURL(new RegExp(methodsPath(locale, saved.id) + '$'));
    await page.goto(methodsPath(locale, saved.id));
    await expect(page.getByLabel(t.output, { exact: true })).toHaveValue(personalText);
    await expect(page.getByLabel(t.notes, { exact: true })).toHaveValue(privateNotes);
    for (const width of locale === 'fr' ? [1440, 1024, 768] : [1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page);await capture(page, `${locale}-${width}-personal-saved`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page); await capture(page, `${locale}-390-personal-saved`);
    expect(await page.evaluate((prefix) => Object.keys(sessionStorage).every((key) => !key.startsWith(prefix)), methodDraftPrefix)).toBe(true);
    await page.goto(methodsPath(locale));await page.getByLabel(t.search, { exact: true }).fill(title);
    await page.getByRole('button', { name: t.searchAction, exact: true }).click();
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await capture(page, `${locale}-390-personal-library`);
    const second = await browser.newContext();
    try {
      await loginMethodAccount(second.request, account);const reopened = await methodRecord(second.request, saved.id);
      expect(reopened.value.text === personalText && reopened.value.notes === privateNotes).toBe(true);
      const next = await second.newPage();await next.goto(`${process.env.COURSES_BROWSER_ORIGIN}${methodsPath(locale === 'fr' ? 'en' : 'fr', saved.id)}`);
      const other = getMethodsDictionary(locale === 'fr' ? 'en' : 'fr');
      await expect(next.getByLabel(other.output, { exact: true })).toHaveValue(personalText);
      expect((await methodRecord(second.request, saved.id)).value.locale).toBe(locale);
    } finally { await second.close(); }
  });

  test('générateur incomplet, reconstruction et réinitialisation exigent des actions explicites', async ({ page, context }) => {
    const t = getMethodsDictionary('fr');await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(methodSourceHref(sources.fr, 'fr'));
    await page.getByRole('textbox', { name: t.fields.availableData, exact: true }).fill('');
    await page.getByRole('button', { name: t.prepare, exact: true }).press('Enter');
    await expect(page.getByText(t.invalid, { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: t.fields.availableData, exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: t.fields.availableData, exact: true }).fill('BR01 fournit les quatre pages, pas de prix pour logo/intégration.');
    await page.getByRole('button', { name: t.prepare, exact: true }).press('Enter');
    const output = page.getByLabel(t.output, { exact: true });const before = await output.inputValue();expect(before).toContain('BR01');
    await output.fill(`${before}\nRetouche manuelle à conserver`);
    await page.getByRole('textbox', { name: t.fields.objective, exact: true }).fill('Nouvel objectif local');
    await page.getByRole('button', { name: t.rebuild, exact: true }).click();
    const replace = page.getByRole('alertdialog', { name: t.replaceTitle, exact: true });await expect(replace).toBeVisible();
    await captureConfirmation(page, replace, 'fr-390-generator-rebuild-confirmation');
    await replace.getByRole('button', { name: t.cancel, exact: true }).click();await expect(output).toHaveValue(`${before}\nRetouche manuelle à conserver`);
    await page.getByRole('button', { name: t.reset, exact: true }).click();
    const reset = page.getByRole('alertdialog', { name: t.resetTitle, exact: true });
    await captureConfirmation(page, reset, 'fr-390-generator-reset-confirmation');
    await reset.getByRole('button', { name: t.confirmReset, exact: true }).click();
    await expect(output).toHaveValue('');await expect(page.getByRole('textbox', { name: t.fields.objective, exact: true })).toHaveValue('');
    await page.setViewportSize({ width: 320, height: 812 });await noOverflow(page);await capture(page, 'fr-320-generator-reset');
  });

  test('deux comptes : refus IDOR et ancien formulaire bloqué après changement de session', async ({ page, context, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const t = getMethodsDictionary('fr');const a = await methodLearner(context.request);await loginMethodAccount(context.request, a);
    const own = await createPersonalMethod(context.request, a.id, methodFields('fr'));
    const bContext = await browser.newContext();
    try {
      const b = await methodLearner(bContext.request);await loginMethodAccount(bContext.request, b);
      expect((await bContext.request.get(`/api/v1/me/methods/${own.id}`)).status()).toBe(404);
      const headers = { ...await csrfHeaders(bContext.request), 'X-Account-Context': b.id, 'If-Match': `"personal-method-${own.id}-r${own.revision}"` };
      expect((await bContext.request.patch(`/api/v1/me/methods/${own.id}`, { headers, data: { fields: methodFields('fr') } })).status()).toBe(404);
      expect((await bContext.request.post(`/api/v1/me/methods/${own.id}/duplicates`, { headers })).status()).toBe(404);
      expect((await bContext.request.delete(`/api/v1/me/methods/${own.id}`, { headers })).status()).toBe(404);
      const otherPage = await bContext.newPage();await otherPage.goto(`${process.env.COURSES_BROWSER_ORIGIN}${methodsPath('fr', own.id)}`);
      await expect(otherPage.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(otherPage.getByLabel(t.output, { exact: true })).toHaveCount(0);expect(!(await otherPage.content()).includes(own.text)).toBe(true);
      await page.goto(methodsPath('fr', 'new'));
      const marker = `P07-account-switch-${randomUUID()}`;
      await page.getByRole('textbox', { name: t.title, exact: true }).fill(marker);await page.getByLabel(t.output, { exact: true }).fill(marker);
      // No browser event is broadcast here: the mutation itself must carry the old account precondition.
      await context.request.post('/api/v1/auth/logout', { headers: await csrfHeaders(context.request) });
      await loginMethodAccount(context.request, b);
      const rejected = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/me/methods'));
      await page.getByRole('button', { name: t.save, exact: true }).click();
      const response = await rejected;expect(response.status()).toBe(409);
      expect((await response.json() as { code: string }).code).toBe('ACCOUNT_CONTEXT_CHANGED');
      await expect(page.getByText(t.accountChanged, { exact: true })).toBeVisible();await expect(page.getByLabel(t.output, { exact: true })).toHaveValue(marker);
      expect((await (await context.request.get('/api/v1/me/methods')).json() as { total: number }).total).toBe(0);
      await privateMarkerNotStored(page, marker);await capture(page, 'fr-390-account-context-changed');
    } finally { await bContext.close(); }
  });

  test('source révisée puis archivée : texte conservé, duplication et suppression réelles', async ({ page, context, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const t = getMethodsDictionary('en'), account = await methodLearner(context.request, 'en');await loginMethodAccount(context.request, account);
    const fields = methodFields('en');const own = await createPersonalMethod(context.request, account.id, fields, sources.en);
    let source = await currentContent(editor, sources.en.value.id);
    const cms = getCmsDictionary('en'), definition = getMethodEditorialDictionary('en');
    const revisedTitle = source.value.title + ' · revised';
    const revisedInstruction = source.value.document!.methodDefinition!.starterInstruction + '\nCheck the supplied facts before proposing the result.';
    const cmsContext = await browser.newContext({ storageState: await editor.storageState() });
    try {
      const cmsPage = await cmsContext.newPage();
      await cmsPage.goto(`${process.env.COURSES_BROWSER_ORIGIN}/en/admin/content/${source.value.id}/edit`);
      await cmsPage.locator('#cms-title').fill(revisedTitle);
      await cmsPage.getByRole('textbox', { name: definition.starterInstruction, exact: true }).fill(revisedInstruction);
      await cmsPage.locator('#cms-reason').fill('P07 method definition editorial correction preserves personal copies');
      const savedRevision = cmsPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/v1/admin/contents/${source.value.id}/revisions`));
      await cmsPage.getByRole('button', { name: cms.save, exact: true }).click();
      expect((await savedRevision).status()).toBe(200);
      await expect(cmsPage.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
      source = await currentContent(editor, source.value.id);
      expect(source.value.title).toBe(revisedTitle);
      expect(source.value.document?.methodDefinition?.starterInstruction).toBe(revisedInstruction);
      await captureSection(cmsPage, cmsPage.locator('#cms-method-definition'), 'en-1440-cms-method-definition');
    } finally { await cmsContext.close(); }
    source = await publishPublicContent(editor, source);
    await page.goto(methodsPath('en', own.id));await expect(page.getByText(t.sourceUpdated, { exact: true })).toBeVisible();
    await expect(page.getByLabel(t.output, { exact: true })).toHaveValue(fields.text);
    await contentAction(editor, source, 'archive', { reason: 'P07 source withdrawal leaves personal work intact' });
    await page.getByRole('button', { name: t.sourceRefresh, exact: true }).click();await expect(page.getByText(t.sourceUnavailable, { exact: true })).toBeVisible();
    await expect(page.getByLabel(t.notes, { exact: true })).toHaveValue(fields.notes);
    const duplicated = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/me/methods/${own.id}/duplicates`));
    await page.getByRole('button', { name: t.duplicate, exact: true }).click();const response = await duplicated;expect(response.status()).toBe(201);
    const copy = await response.json() as MethodView;expect(copy.id).not.toBe(own.id);expect(copy.text === own.text).toBe(true);
    await page.goto(methodsPath('en', copy.id));await page.getByRole('button', { name: t.delete, exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: t.deleteTitle, exact: true });await dialog.getByRole('button', { name: t.confirmDelete, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(methodsPath('en') + '$'));
    expect((await context.request.get(`/api/v1/me/methods/${copy.id}`)).status()).toBe(404);expect((await context.request.get(`/api/v1/me/methods/${own.id}`)).status()).toBe(200);
    await capture(page, 'en-390-personal-library-after-delete');
  });

  test('réponse retardée, conflit réel et panne conservent la dernière saisie privée', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const t = getMethodsDictionary('fr'), account = await methodLearner(context.request);await loginMethodAccount(context.request, account);
    const initial = methodFields('fr');const own = await createPersonalMethod(context.request, account.id, initial);
    await page.goto(methodsPath('fr', own.id));
    let release!: () => void, complete!: () => void, responseCaptured = false, started = false;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const delivered = new Promise<void>((resolve) => { complete = resolve; });
    await page.route(`**/api/v1/me/methods/${own.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      started = true;
      try {
        const response = await route.fetch();responseCaptured = true;await held;await route.fulfill({ response });
      } finally { complete(); }
    });
    const output = page.getByLabel(t.output, { exact: true });await output.fill('First submitted P07 text');
    try {
      await page.getByRole('button', { name: t.save, exact: true }).click();await expect.poll(() => responseCaptured).toBe(true);
      await output.fill('Newer local P07 text while the response is delayed');release?.();
      await expect(page.getByText(t.modified, { exact: true })).toBeVisible();await expect(output).toHaveValue('Newer local P07 text while the response is delayed');
    } finally { release();if (started) await delivered;await page.unrouteAll({ behavior: 'wait' }); }
    expect((await patchPersonalMethod(context.request, account.id, own.id, { ...initial, text: 'Different server text from another tab' })).status()).toBe(200);
    await page.getByRole('button', { name: t.save, exact: true }).click();await expect(page.getByRole('heading', { name: t.conflictTitle, exact: true })).toBeVisible();
    await expect(output).toHaveValue('Newer local P07 text while the response is delayed');
    await captureSection(page, page.locator('section').filter({ has: page.getByRole('heading', { name: t.conflictTitle, exact: true }) }), 'fr-390-personal-method-conflict-comparison');
    await page.getByRole('button', { name: t.keepLocal, exact: true }).click();const confirmation = page.getByRole('alertdialog', { name: t.keepLocal, exact: true });await confirmation.getByRole('button', { name: t.confirm, exact: true }).click();
    let stopped = false;
    try {
      await controlApi('stop-api');stopped = true;await page.getByRole('button', { name: t.save, exact: true }).click();
      await expect(page.getByText(t.unavailable, { exact: true })).toBeVisible();await expect(output).toHaveValue('Newer local P07 text while the response is delayed');
      await privateMarkerNotStored(page, 'Newer local P07 text');await capture(page, 'fr-390-personal-method-outage');
      await controlApi('start-api');stopped = false;await page.getByRole('button', { name: t.save, exact: true }).click();
      await expect(page.getByText(t.saved, { exact: true })).toBeVisible();expect((await methodRecord(context.request, own.id)).value.text).toBe('Newer local P07 text while the response is delayed');
      await capture(page, 'fr-390-personal-method-recovered');
    } finally { release?.();if (stopped) await controlApi('start-api'); }
  });

  test('création committée puis compte changé : un ancien accusé 201 ne confirme rien sous le nouveau compte', async ({ page, context }) => {
    const t = getMethodsDictionary('en');
    const a = await methodLearner(context.request, 'en'), b = await methodLearner(context.request, 'en');
    await loginMethodAccount(context.request, a);
    await page.goto(methodsPath('en', 'new'));
    const marker = `P07-delayed-create-${randomUUID()}`;
    await page.getByRole('textbox', { name: t.title, exact: true }).fill(marker);
    const output = page.getByLabel(t.output, { exact: true });
    await output.fill(marker);
    await capture(page, 'en-1440-delayed-create-before-account-change');

    let release!: () => void, complete!: () => void, committed: MethodView | null = null, started = false;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const delivered = new Promise<void>((resolve) => { complete = resolve; });
    const path = '**/api/v1/me/methods';
    await page.route(path, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      started = true;
      try {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        committed = await response.json() as MethodView;
        await held;
        await route.fulfill({ response });
      } finally { complete(); }
    });
    const otherTab = await context.newPage();
    try {
      await page.getByRole('button', { name: t.save, exact: true }).click();
      await expect.poll(() => committed !== null).toBe(true);
      const saved = committed as MethodView | null;
      if (!saved) throw new Error('Expected the server to commit before the account transition.');
      expect((await methodRecord(context.request, saved.id)).value.text === marker).toBe(true);

      // A real form login renews the shared session and publishes the normal
      // signed-in event to the original tab. No synthetic account event is used.
      await otherTab.goto(`${authPath('en', 'sign-in')}?returnTo=${encodeURIComponent(methodsPath('en'))}`);
      await fillMethodLogin(otherTab, 'en', b);
      await expect(otherTab).toHaveURL(new RegExp(methodsPath('en') + '$'));
      const changedNotice = page.getByRole('status').filter({ has: page.getByRole('link', { name: t.accountLibrary, exact: true }) });
      await expect(changedNotice).toBeVisible();
      await expect(changedNotice).toContainText(t.accountChanged);
      await expect(page.getByText(t.accountTransitionUnconfirmed, { exact: true })).toBeVisible();

      const acknowledged = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/me/methods'));
      release?.();
      expect((await acknowledged).status()).toBe(201);
      await expect(page.locator('[data-method-save-state]')).toHaveAttribute('data-method-save-state', 'error');
      await expect(page.getByText(t.saved, { exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(methodsPath('en', 'new') + '$'));
      await expect(output).toHaveValue(marker);
      await expect(page.getByRole('button', { name: t.save, exact: true })).toBeDisabled();
      expect((await (await context.request.get('/api/v1/me/methods')).json() as { total: number }).total).toBe(0);
      expect((await context.request.get(`/api/v1/me/methods/${saved.id}`)).status()).toBe(404);
      await privateMarkerNotStored(page, marker);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await noOverflow(page);
        await capture(page, `en-${width}-delayed-create-account-change`);
      }
    } finally {
      release();
      if (started) await delivered;
      await page.unrouteAll({ behavior: 'wait' });
      await otherTab.close();
    }
  });
});
