import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { MediaAccessContext, MediaProgressView, VideoPlaybackAccess } from '../../apps/web/src/lib/api/generated/types.gen';
import { getVideoDictionary } from '../../apps/web/src/lib/i18n/video';
import { activityDiscoveryHref } from '../../apps/web/src/lib/public/routes';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publishPublicContent } from './public-content-fixture';
import { loginMethodAccount, methodLearner } from './methods-fixture';

type Locale = 'fr' | 'en';
type VideoFixture = Record<Locale, { id: string; content: RecordedContent; context: MediaAccessContext }>;
const mediaQuery = (context: MediaAccessContext) => new URLSearchParams({ resourceId: context.resourceId, versionId: context.versionId, locale: context.locale }).toString();
async function fixture(request: APIRequestContext): Promise<VideoFixture> {
  const actor = await loginEditor(request), ids = { fr: randomUUID(), en: randomUUID() };
  const command = editorialContent('fr'); command.title = 'P10 · fixture vidéo CC0, aucune leçon commerciale';
  command.document.media = [{ assetId: ids.fr, kind: 'VIDEO', label: 'Fixture MP4 CC0 de test uniquement', required: true }];
  let fr = await createContent(request, command);
  const translated = editorialContent('en'); translated.document.media = [{ assetId: ids.en, kind: 'VIDEO', label: 'CC0 MP4 test fixture only', required: true }];
  let en = await contentAction(request, fr, 'translations', { locale: 'en', slug: `p10-video-${randomUUID()}`, title: 'P10 · CC0 video test fixture, no commercial lesson', summary: translated.summary, document: translated.document, reason: 'P10 explicit equivalent test video, separate media identity' }, 201);
  const directory = process.env.COURSES_BROWSER_PRIVATE_DIRECTORY;
  if (!directory || process.env.APP_ENV !== 'test') throw new Error('Owned private browser directory required for local test video.');
  const filename = `fixture-${randomUUID()}.mp4`; copyFileSync(join(process.cwd(), 'tests/fixtures/media/flower.mp4'), join(directory, filename));
  const manifest = join(directory, `manifest-${randomUUID()}.json`);
  writeFileSync(manifest, JSON.stringify({ actorId: actor.id, items: (['fr', 'en'] as const).map((locale) => ({
    id: ids[locale], resourceId: fr.value.resourceId, versionId: fr.value.versionId, locale, file: filename,
    transcript: locale === 'fr' ? 'Texte technique synthétique pour la fixture CC0 de test. Ce fichier ne constitue pas une leçon de formation.' : 'Synthetic technical text for the CC0 test fixture. This file is not a training lesson.',
    captionsVtt: `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${locale === 'fr' ? 'Fixture de test CC0, pas une leçon.' : 'CC0 test fixture, not a lesson.'}\n`,
  })) }), { flag: 'wx', mode: 0o600 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const imported = spawnSync(process.execPath, [join(process.cwd(), 'scripts/video-import.mjs'), manifest], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
    expect(imported.status === 0, 'The real local importer succeeds, including an identical replay; private output is not printed').toBe(true);
  }
  fr = await publishPublicContent(request, await currentContent(request, fr.value.id));
  en = await publishPublicContent(request, await currentContent(request, en.value.id));
  return Object.fromEntries((['fr', 'en'] as const).map((locale) => [locale, { id: ids[locale], content: locale === 'fr' ? fr : en, context: { locale, resourceId: fr.value.resourceId, versionId: fr.value.versionId, enrollmentId: null } }])) as VideoFixture;
}
async function progress(request: APIRequestContext, item: VideoFixture[Locale]) {
  const response = await request.get(`/api/v1/me/media-progress/${item.id}?${mediaQuery(item.context)}`); expect(response.status()).toBe(200);
  return { value: await response.json() as MediaProgressView, etag: response.headers().etag };
}
async function capture(page: Page, name: string) {
  await page.getByRole('main').focus();
  await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}

export function registerVideoPlaybackScenarios() {
  test.describe('P10 lecteur local réel et positions propres aux médias', () => {
    let editor: APIRequestContext, pair: VideoFixture;
    test.beforeAll(async ({ playwright }) => { editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); pair = await fixture(editor); });
    test.afterAll(async () => { await editor?.dispose(); });
    for (const locale of ['fr', 'en'] as const) test(`${locale} · MP4 décodé dans Chromium, Range proxy et reprise indépendante`, async ({ page, context }) => {
      const t = getVideoDictionary(locale), item = pair[locale], other = pair[locale === 'fr' ? 'en' : 'fr'];
      const account = await methodLearner(context.request, locale); await loginMethodAccount(context.request, account);
      const initial = await progress(context.request, item); expect(initial.value.revision).toBe(0); expect(initial.value.updatedAt).toBeNull();
      await page.setViewportSize({ width: 390, height: 844 }); await page.goto(activityDiscoveryHref(locale, item.content.value.resourceId, item.content.value.versionId));
      const panel = page.locator(`[data-video-player="${item.id}"]`); await panel.getByRole('button', { name: t.loadVideo, exact: true }).click();
      const video = panel.locator('video'); await expect(video).toBeVisible();
      await expect.poll(() => video.evaluate((node) => { const media = node as HTMLVideoElement; return Number.isFinite(media.duration) && media.duration > 0 && media.readyState >= 1; })).toBe(true);
      const duration = await video.evaluate((node) => (node as HTMLVideoElement).duration); expect(Math.abs(duration - initial.value.durationSeconds) < 0.1).toBe(true);
      await video.evaluate(async (node) => { const media = node as HTMLVideoElement; media.muted = true; await media.play(); });
      await expect.poll(() => video.evaluate((node) => { const media = node as HTMLVideoElement; return media.currentTime > 0.25 && !media.paused; })).toBe(true);
      await video.evaluate((node) => { const media = node as HTMLVideoElement; media.pause(); media.currentTime = Math.min(2, media.duration / 3); });
      await expect(panel.locator('[data-media-progress-state]')).toHaveAttribute('data-media-progress-state', 'modified');
      await panel.getByRole('button', { name: t.savePosition, exact: true }).click();
      await expect(panel.locator('[data-media-progress-state]')).toHaveAttribute('data-media-progress-state', 'saved');
      const saved = await progress(context.request, item); expect(saved.value.positionSeconds > 0).toBe(true); expect(saved.value.revision).toBe(1);
      const untouched = await progress(context.request, other); expect(untouched.value.positionSeconds).toBe(0); expect(untouched.value.updatedAt).toBeNull();
      await capture(page, `${locale}-390-video-real-position-saved`);
      await page.reload(); const restored = page.locator(`[data-video-player="${item.id}"]`);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await restored.getByRole('button', { name: t.resumePosition, exact: true }).click();
      const resumed = restored.locator('video'); await expect.poll(() => resumed.evaluate((node, position) => { const media = node as HTMLVideoElement; return media.error === null && media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !media.seeking && media.videoWidth > 0 && Math.abs(media.currentTime - position) < 0.2; }, saved.value.positionSeconds)).toBe(true);
      await capture(page, `${locale}-1440-video-resumed`);

      const headers = { ...await csrfHeaders(context.request), 'X-Account-Context': account.id };
      expect((await context.request.put(`/api/v1/me/media-progress/${item.id}`, { headers, data: { context: item.context, positionSeconds: 0 } })).status()).toBe(428);
      expect((await context.request.put(`/api/v1/me/media-progress/${item.id}`, { headers: { ...headers, 'If-Match': initial.etag }, data: { context: item.context, positionSeconds: 0 } })).status()).toBe(412);
      const access = await context.request.post(`/api/v1/media/${item.id}/playback-access`, { headers, data: item.context }); expect(access.status()).toBe(200);
      const link = await access.json() as VideoPlaybackAccess;
      const stream = new URL(link.url, process.env.COURSES_BROWSER_ORIGIN); expect(stream.origin).toBe(process.env.COURSES_BROWSER_ORIGIN);
      expect(stream.pathname).toBe(`/api/v1/media/${item.id}/stream`);
      const partial = await context.request.get(stream.toString(), { headers: { Range: 'bytes=0-31' } }).catch(() => { throw new Error('The real media Range request failed; bearer URL is intentionally omitted.'); }); expect(partial.status()).toBe(206);
      expect((await partial.body()).length).toBe(32); expect(partial.headers()['content-range']).toBe(`bytes 0-31/${link.sizeBytes}`);
      expect(partial.headers()['cache-control']).toContain('no-store'); expect(partial.headers()['content-type']).toBe('video/mp4');
      expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].every((value) => !String(value).includes('grant=')))).toBe(true);
    });
  });
}
