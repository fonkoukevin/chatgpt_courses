import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext } from '@playwright/test';
import { csrfHeaders } from './editorial-fixture';
import type { RecordedContent } from './editorial-api';
import type { OfferView } from '../../apps/web/src/lib/api/generated/types.gen';

// Simulate an editorial selection only inside the supervisor-owned, disposable
// database. This helper is never a way to approve the existing staging fixtures.
export async function showcaseFixtureActor(request: APIRequestContext) {
  const origin = process.env.COURSES_BROWSER_ORIGIN;
  const container = process.env.COURSES_BROWSER_DB_ID;
  const runId = process.env.COURSES_BROWSER_RUN_ID;
  if (process.env.APP_ENV !== 'test' || !origin || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin)
    || !container || !/^[a-f0-9]{64}$/.test(container) || !runId) throw new Error('Owned loopback showcase simulation required.');
  const owner = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.chatgptcourses.browser-run" }}', container],
    { windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
  if (owner.status !== 0 || owner.stdout.trim() !== runId) throw new Error('Showcase simulation database ownership not confirmed.');
  const current = await request.get('/api/v1/auth/me');
  if (new URL(current.url()).origin !== origin || current.status() !== 200) throw new Error('Owned authenticated showcase origin required.');
  const actor = await current.json() as { id: string };
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(actor.id)) throw new Error('Showcase simulation actor required.');
  return actor.id;
}

export async function approveShowcaseContent(request: APIRequestContext, content: RecordedContent) {
  const actor = await showcaseFixtureActor(request);
  const revisionId = content.value.publishedRevisionId;
  if (!revisionId) throw new Error('Published revision required for editorial simulation.');
  const path = `/api/v1/admin/contents/${content.value.id}/public-selection`;
  const current = await request.get(path);
  expect(current.status()).toBe(200);
  expect((await current.json() as { revisionId: string }).revisionId).toBe(revisionId);
  const selected = await request.put(path, {
    headers: { ...await csrfHeaders(request), 'X-Account-Context': actor, 'If-Match': current.headers().etag },
    data: { revisionId, provenance: 'EDITORIAL', approved: true, reason: 'Explicit editorial selection simulation in the owned disposable browser database only.' },
  });
  expect(selected.status()).toBe(200);
  expect((await selected.json() as { approved: boolean }).approved).toBe(true);
  return content;
}

export async function approveShowcaseOffer(request: APIRequestContext, offer: { value: OfferView; etag: string }) {
  const actor = await showcaseFixtureActor(request);
  const path = `/api/v1/admin/offers/${offer.value.id}/public-selection`;
  const current = await request.get(path);
  expect(current.status()).toBe(200);
  expect((await current.json() as { revisionId: string }).revisionId).toBe(offer.value.currentRevisionId);
  const selected = await request.put(path, {
    headers: { ...await csrfHeaders(request), 'X-Account-Context': actor, 'If-Match': current.headers().etag },
    data: { revisionId: offer.value.currentRevisionId, provenance: 'EDITORIAL', approved: true, reason: 'Explicit offer selection simulation in the owned disposable browser database only.' },
  });
  expect(selected.status()).toBe(200);
  expect((await selected.json() as { approved: boolean }).approved).toBe(true);
  return offer;
}
