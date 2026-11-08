import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import type { PublicMetadata, ResourceDetail } from '../../apps/web/src/lib/api/generated/types.gen';
import { getCmsMetadataDictionary } from '../../apps/web/src/lib/i18n/cms-metadata';
import { createContent, currentContent, publishContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { csrfHeaders, loginEditor } from './editorial-fixture';

export function registerPublicMetadataScenario() {
  test('métadonnées CMS FR/EN : saisie conservée, vrai conflit et publication explicite', async ({ page, context }) => {
    await loginEditor(context.request);
    for (const locale of ['fr', 'en'] as const) {
      const text = getCmsMetadataDictionary(locale);
      const command = editorialContent(locale); command.kind = 'GUIDE';
      command.reason = 'P06 isolated public metadata browser verification';
      let content = await publishContent(context.request, await createContent(context.request, command));
      const publicPath = `/api/v1/catalog/resources/${content.value.resourceId}/versions/${content.value.versionId}?locale=${locale}`;
      const original = await context.request.get(publicPath);
      expect(original.status()).toBe(200);
      const before = await original.json() as ResourceDetail;
      expect(before.metadata.sources).toEqual([]);
      await page.setViewportSize({ width: locale === 'fr' ? 390 : 1440, height: 1000 });
      await page.goto(`/${locale}/admin/content/${content.value.id}/edit`);
      await page.getByRole('button', { name: text.open, exact: true }).click();
      const panel = page.getByRole('dialog', { name: text.title, exact: true });
      const localAudience = locale === 'fr' ? 'Public fictif de recette, jamais publié en production.' : 'Fictional verification audience, never published in production.';
      const localSource = locale === 'fr' ? 'Source fictive de vérification locale' : 'Fictional local verification source';
      await panel.getByLabel(text.audience, { exact: true }).fill(localAudience);
      await panel.getByRole('button', { name: text.addSource, exact: true }).click();
      await panel.getByRole('textbox', { name: text.sourceLabel, exact: true }).fill(localSource);
      await panel.getByRole('textbox', { name: text.url, exact: true }).fill('https://example.invalid/p06-verification');
      await panel.getByRole('textbox', { name: text.reason, exact: true }).fill('P06 explicitly preserve local input across a concurrent metadata revision.');
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(page.getByText(text.dirty, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: text.open, exact: true }).click();
      await expect(panel.getByLabel(text.audience, { exact: true })).toHaveValue(localAudience);

      const serverMetadata: PublicMetadata = { ...content.value.metadata, audience: ['Concurrent isolated browser verification'] };
      const concurrent = await context.request.put(`/api/v1/admin/contents/${content.value.id}/metadata`, {
        headers: { ...await csrfHeaders(context.request), 'If-Match': content.etag },
        data: { metadata: serverMetadata, reason: 'P06 competing metadata revision in the isolated database.' },
      });
      expect(concurrent.status()).toBe(200);
      const rejected = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/${content.value.id}/metadata`));
      await panel.getByRole('button', { name: text.save, exact: true }).click();
      expect((await rejected).status()).toBe(412);
      await expect(panel.getByRole('heading', { name: text.conflict, exact: true })).toBeVisible();
      expect(await panel.getByLabel(text.local, { exact: true }).inputValue()).toContain(localSource);
      expect(await panel.getByLabel(text.server, { exact: true }).inputValue()).toContain('Concurrent isolated browser verification');
      const keep = panel.getByRole('button', { name: text.keep, exact: true });
      await keep.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-metadata-conflict.png`), animations: 'disabled' });
      await keep.click();
      await page.getByRole('alertdialog', { name: text.keep, exact: true }).getByRole('button', { name: text.confirm, exact: true }).click();
      await expect(panel.getByLabel(text.audience, { exact: true })).toHaveValue(localAudience);
      const accepted = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/${content.value.id}/metadata`));
      await panel.getByRole('button', { name: text.save, exact: true }).click();
      expect((await accepted).status()).toBe(200);
      await expect(panel.getByText(text.saved, { exact: true })).toBeVisible();
      const stillPublished = await context.request.get(publicPath);
      expect(stillPublished.status()).toBe(200);
      const unmodified = await stillPublished.json() as ResourceDetail;
      expect(unmodified.revisionId).toBe(before.revisionId);
      expect(unmodified.metadata.sources).toEqual([]);
      await panel.getByRole('button', { name: text.close, exact: true }).click();
      content = await currentContent(context.request, content.value.id);
      expect(content.value.metadata.audience).toEqual([localAudience]);
      content = await publishContent(context.request, content);
      const fresh = await context.request.get(publicPath);
      expect(fresh.status()).toBe(200);
      const published = await fresh.json() as ResourceDetail;
      expect(published.revisionId).toBe(content.value.currentRevisionId);
      expect(published.metadata.sources).toEqual([{ label: localSource, url: 'https://example.invalid/p06-verification' }]);
      await page.goto(`/${locale}/guides/${command.slug}?version=${content.value.versionId}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(command.title);
      await expect(page.getByRole('link', { name: localSource, exact: true })).toHaveAttribute('href', 'https://example.invalid/p06-verification');
      await page.getByRole('main').focus();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-guide-metadata-published.png`), fullPage: true, animations: 'disabled' });
    }
  });
}
