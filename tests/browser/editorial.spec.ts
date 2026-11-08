import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { loginEditor } from './editorial-fixture';
import { createContent, currentContent, publishContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { getCmsDictionary } from '../../apps/web/src/lib/i18n/cms';
import { getCmsChildrenDictionary } from '../../apps/web/src/lib/i18n/cms-children';
import { getAuthDictionary } from '../../apps/web/src/lib/i18n/auth';
import { controlApi } from './control';

async function capture(page: Page, name: string, fullPage = true) {
  if (!await page.getByRole('dialog').count()) await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage, animations: 'disabled' });
}
async function captureSection(page: Page, section: Locator, name: string) {
  const original = page.viewportSize()!;
  const bounds = await section.boundingBox();
  if (!bounds) throw new Error('Visible section required for visual verification.');
  try {
    await page.setViewportSize({ width: original.width, height: Math.max(original.height, Math.ceil(bounds.height) + 80) });
    await section.locator('input,textarea,select,button').first().focus();
    expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
    await section.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
  } finally { await page.setViewportSize(original); }
}

test('réponse retardée, panne réelle et conflit entre deux onglets conservent la saisie', async ({ page, context }) => {
  await loginEditor(context.request);
  const text = getCmsDictionary('fr');
  const content = await createContent(context.request, editorialContent('fr'));
  const path = `/fr/admin/content/${content.value.id}/edit`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  let release!: () => void, complete!: () => void, committed = false, started = false;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const delivered = new Promise<void>((resolve) => { complete = resolve; });
  const target = `**/api/v1/admin/contents/${content.value.id}/revisions`;
  await page.route(target, async (route) => {
    started = true;
    try {
      const response = await route.fetch(); committed = true;
      await delayed; await route.fulfill({ response });
    } finally { complete(); }
  });
  const sent = 'Première correction envoyée au serveur.';
  const newer = 'Saisie plus récente encore locale pendant la réponse retardée.';
  try {
    await page.locator('#cms-summary').fill(sent); await page.locator('#cms-reason').fill('Delayed acknowledgement verification.');
    await page.getByRole('button', { name: text.save, exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await expect(page.locator('#cms-summary')).toBeEditable(); await page.locator('#cms-summary').fill(newer);
  } finally { release(); if (started) await delivered; await page.unrouteAll({ behavior: 'wait' }); }
  await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'modified');
  await expect(page.locator('#cms-summary')).toHaveValue(newer);
  expect((await currentContent(context.request, content.value.id)).value.summary).toBe(sent);
  await page.getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
  await controlApi('stop-api');
  const offlineTitle = 'Titre conservé pendant une vraie panne de Spring';
  try {
    await page.locator('#cms-title').fill(offlineTitle); await page.locator('#cms-reason').fill('Retry after actual API outage.');
    await page.getByRole('button', { name: text.save, exact: true }).click();
    await expect(page.getByText(getAuthDictionary('fr').unavailable, { exact: true })).toBeVisible();
    await expect(page.locator('#cms-title')).toHaveValue(offlineTitle);
    await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'modified');
    await capture(page, 'fr-390-unsaved-api-unavailable', false);
  } finally { await controlApi('start-api'); }
  await page.getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
  const other = await context.newPage();
  try {
    await other.setViewportSize({ width: 390, height: 844 });
    await other.goto(path);
    await page.locator('#cms-summary').fill('Révision du premier onglet confirmée.'); await page.locator('#cms-reason').fill('First concurrent editor.');
    await page.getByRole('button', { name: text.save, exact: true }).click();
    await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
    const local = 'Texte indépendant du second onglet à conserver.';
    await other.locator('#cms-summary').fill(local); await other.locator('#cms-reason').fill('Second concurrent editor.');
    await other.getByRole('button', { name: text.save, exact: true }).click();
    await expect(other.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'conflict');
    await expect(other.locator('#cms-summary')).toHaveValue(local);
    expect((await other.locator('#cms-local-copy').inputValue()).includes(local)).toBe(true);
    expect((await other.locator('#cms-server-copy').inputValue()).includes('Révision du premier onglet confirmée.')).toBe(true);
    await capture(other, 'fr-390-conflict', false);
    await captureSection(other, other.locator('section').filter({ has: other.getByRole('heading', { name: text.conflict, exact: true }) }), 'fr-390-conflict-comparison');
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.getByRole('button', { name: text.keepLocal, exact: true }).click();
    await other.getByRole('alertdialog', { name: text.keepLocal, exact: true }).getByRole('button', { name: text.confirm, exact: true }).click();
    await expect(other.locator('#cms-summary')).toHaveValue(local);
    await other.getByRole('button', { name: text.save, exact: true }).click();
    await expect(other.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
    expect((await currentContent(context.request, content.value.id)).value.summary).toBe(local);
  } finally { await other.close(); }
});

test('ordre des activités modifiable au clavier et confirmé par PostgreSQL', async ({ page, context }) => {
  await loginEditor(context.request);
  const text = getCmsDictionary('en');
  const firstCommand = editorialContent('en'); firstCommand.title = 'First brief activity';
  const secondCommand = editorialContent('en'); secondCommand.title = 'Second brief activity';
  const first = await createContent(context.request, firstCommand);
  const second = await createContent(context.request, secondCommand);
  const command = editorialContent('en'); command.kind = 'MODULE'; command.title = 'Understand the brief — disposable module';
  command.childVersionIds = [first.value.versionId];
  const parent = await createContent(context.request, command);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/admin/content/${parent.value.id}/edit`);
  const order = page.locator('#cms-composition');
  const children = getCmsChildrenDictionary('en');
  const add = order.getByRole('button', { name: `${children.add} · ${secondCommand.title} · ${children.version.replace('{n}', '1')}`, exact: true });
  await add.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#cms-child-1')).toHaveValue(second.value.versionId);
  const move = order.getByRole('button', { name: text.moveDown.replace('{n}', '1'), exact: true });
  await move.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#cms-child-0')).toHaveValue(second.value.versionId);
  await expect(page.locator('#cms-child-1')).toHaveValue(first.value.versionId);
  await editorAction(page, text.saveComposition);
  expect((await currentContent(context.request, parent.value.id)).value.childVersionIds).toEqual([second.value.versionId, first.value.versionId]);
  await captureSection(page, order, 'en-390-composition');
});
async function editorAction(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await dialog.locator('#cms-action-reason').fill('Automated verification of the explicit P05 editorial operation.');
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

for (const locale of ['fr', 'en'] as const) {
  test(`${locale} : catalogue et création réels au clavier à 390 px`, async ({ page, context }) => {
    await loginEditor(context.request);
    const text = getCmsDictionary(locale), command = editorialContent(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = []; page.on('pageerror', () => errors.push('pageerror'));
    const catalogueResponse = await page.goto(`/${locale}/admin/content`);
    expect(catalogueResponse?.headers()['cache-control']).toContain('no-store');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    const create = page.getByRole('button', { name: text.create, exact: true });
    await create.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: text.create, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.locator('#cms-title').fill('Temporary retained creation draft');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(create).toBeFocused();
    await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
    await expect(dialog.locator('#cms-title')).toHaveValue('Temporary retained creation draft');
    await dialog.locator('#cms-title').fill(command.title);
    await dialog.locator('#cms-create-slug').fill(command.slug);
    await dialog.locator('#cms-summary').fill(command.summary);
    await dialog.locator('#cms-create-objectives').fill(command.objectives);
    await dialog.locator('#cms-create-evaluation').fill(command.evaluationDefinition);
    await dialog.getByLabel(text.objective).fill(command.document.objective);
    await dialog.getByLabel(text.expectedResult).fill(command.document.expectedResult);
    await dialog.getByLabel(text.accessPolicy, { exact: true }).selectOption('FREE');
    await dialog.getByRole('button', { name: text.addBlock, exact: true }).click();
    await dialog.getByLabel(`${text.blockText} 1`, { exact: true }).fill(command.document.blocks[0].text);
    await dialog.getByRole('button', { name: text.addExercise, exact: true }).click();
    await dialog.getByLabel(text.instructions, { exact: true }).fill(command.document.exercise!.instructions);
    await dialog.getByLabel(text.correction, { exact: true }).fill(command.document.exercise!.correction);
    await dialog.getByRole('button', { name: text.addQuestion, exact: true }).click();
    await dialog.getByLabel(text.questionKey, { exact: true }).fill(command.document.quiz[0].key);
    await dialog.getByLabel(text.question, { exact: true }).fill(command.document.quiz[0].prompt);
    await dialog.getByLabel(text.options, { exact: true }).fill(command.document.quiz[0].options.join('\n'));
    await dialog.getByLabel(text.correctOption, { exact: true }).fill('2');
    await dialog.getByLabel(text.explanation, { exact: true }).fill(command.document.quiz[0].explanation);
    await dialog.getByRole('button', { name: text.addCriterion, exact: true }).click();
    await dialog.getByLabel(text.criterionKey, { exact: true }).fill('fidelity');
    await dialog.getByLabel(text.criterion, { exact: true }).fill(command.document.rubric[0].label);
    await dialog.locator('#cms-reason').fill(command.reason);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: text.create, exact: true }).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/content/[a-f0-9-]{36}/edit$`));
    await expect(page.locator('#cms-title')).toHaveValue(command.title);
    await expect(page.locator('#cms-summary')).toHaveValue(command.summary);
    await capture(page, `${locale}-390-editor-created`, false);
    for (const section of ['blocks', 'exercise', 'quiz', 'rubric', 'media']) {
      await captureSection(page, page.locator(`#cms-${section}`), `${locale}-390-editor-${section}`);
    }
    const id = /\/content\/([a-f0-9-]{36})\/edit$/.exec(page.url())![1];
    await editorAction(page, text.toReview); await editorAction(page, text.markReady); await editorAction(page, text.publish);
    expect((await currentContent(context.request, id)).value.state).toBe('PUBLISHED');
    await capture(page, `${locale}-390-editor-published`, false);
    await page.locator('#cms-summary').fill(`${command.summary} ${locale === 'fr' ? 'Correction éditoriale de test.' : 'Test editorial correction.'}`);
    await page.locator('#cms-reason').fill('Minor summary correction, unchanged learning objectives and assessment.');
    await page.getByRole('button', { name: text.save, exact: true }).click();
    await expect(page.locator('[data-cms-save-state]')).toHaveAttribute('data-cms-save-state', 'saved');
    expect((await currentContent(context.request, id)).value.state).toBe('DRAFT');
    await editorAction(page, text.toReview); await editorAction(page, text.markReady); await editorAction(page, text.publish);
    const published = await currentContent(context.request, id);
    expect((await context.request.get(`/api/v1/contents/${published.value.resourceId}?locale=${locale}`)).status()).toBe(200);
    await page.getByRole('button', { name: text.archive, exact: true }).click();
    const archive = page.getByRole('dialog', { name: text.archive, exact: true });
    await expect(archive.getByText(text.consequences.HISTORY_RETAINED, { exact: true })).toBeVisible();
    await capture(page, `${locale}-390-archive-consequences`, false);
    await archive.locator('#cms-action-reason').fill('Archive the disposable P05 browser activity; preserve its history.');
    await archive.getByRole('button', { name: text.archive, exact: true }).click();
    await expect(archive).toHaveCount(0);
    expect((await context.request.get(`/api/v1/contents/${published.value.resourceId}?locale=${locale}`)).status()).toBe(404);
    await page.goto(`/${locale}/admin/content`);
    await page.getByLabel(text.search, { exact: true }).fill(command.slug);
    await page.getByRole('button', { name: text.filter, exact: true }).click();
    await expect(page.getByRole('link', { name: command.title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `${locale}-390-catalogue`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await capture(page, `${locale}-1440-catalogue`);
    for (const suffix of ['second', 'third']) {
      const next = editorialContent(locale); next.slug = `${command.slug}-${suffix}`; next.title = `${command.title} (${suffix})`;
      await createContent(context.request, next);
    }
    await page.goto(`/${locale}/admin/content?q=${command.slug}&size=1`);
    const firstPageTitle = await page.getByRole('table').locator('tbody tr').first().textContent();
    await page.getByRole('link', { name: text.next, exact: true }).click();
    await expect(page).toHaveURL(/page=1/);
    expect((await page.getByRole('table').locator('tbody tr').first().textContent()) !== firstPageTitle).toBe(true);
    await page.goto(`/${locale}/admin/content?verifiedBefore=2026-02-31`);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('link', { name: text.clearFilters, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('aperçu authentifié sûr et projection protégée sans texte ni corrigé', async ({ page, context, browser }) => {
  await loginEditor(context.request);
  const copy = getCmsDictionary('fr');
  const missing = editorialContent('fr'); missing.document.media = [{ assetId: randomUUID(), kind: 'FILE', required: true, label: 'Référence fictive non vérifiée de recette P05' }];
  const blocked = await createContent(context.request, missing);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/fr/admin/content/${blocked.value.id}/edit`);
  const readiness = page.getByRole('region', { name: copy.readiness, exact: true });
  await expect(readiness.getByText(copy.issues.MEDIA_UNVERIFIED, { exact: true })).toBeVisible();
  await readiness.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, 'fr-390-missing-media-readiness.png'), animations: 'disabled' });
  await readiness.getByRole('listitem').filter({ hasText: copy.issues.MEDIA_UNVERIFIED }).getByRole('button', { name: copy.fix, exact: true }).click();
  await expect(page.getByLabel(copy.assetId, { exact: true })).toBeFocused();
  const command = editorialContent('fr', 'PROTECTED');
  const privateMarker = `p05-private-${randomUUID()}`;
  const xssText = '<img src=x onerror="window.p05Executed=true">';
  command.document.blocks = [{ type: 'PARAGRAPH', text: privateMarker, url: null }, { type: 'PARAGRAPH', text: xssText, url: null }];
  const created = await createContent(context.request, command);
  const published = await publishContent(context.request, created);
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = await page.goto(`/fr/admin/content/${published.value.id}/preview`);
  expect(preview?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByText(privateMarker, { exact: true })).toBeVisible();
  await expect(page.getByText(xssText, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, 'p05Executed'))).toBe(false);
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'fr-390-private-preview');
  const anonymous = await browser.newContext();
  try {
    const request = anonymous.request;
    expect((await request.get(`/api/v1/admin/contents/${published.value.id}/preview?preview=true`)).status()).toBe(401);
    const projection = await request.get(`/api/v1/contents/${published.value.resourceId}?locale=fr`);
    expect(projection.status()).toBe(200);
    const data = await projection.json() as { access: string; document: unknown };
    expect(data.access).toBe('PROTECTED'); expect(data.document).toBeNull();
    expect(!(await projection.text()).includes(privateMarker)).toBe(true);
    const other = await anonymous.newPage();
    await other.goto(`${process.env.COURSES_BROWSER_ORIGIN}/fr/admin/content/${published.value.id}/preview?preview=true`);
    await expect(other).toHaveURL(/\/fr\/connexion/);
    expect(!(await other.content()).includes(privateMarker)).toBe(true);
  } finally { await anonymous.close(); }
  const free = await publishContent(context.request, await createContent(context.request, editorialContent('en')));
  const response = await context.request.get(`/api/v1/contents/${free.value.resourceId}?locale=en`);
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(!text.includes('correctOption') && !text.includes('"correction"') && !text.includes('"explanation"')).toBe(true);
});
