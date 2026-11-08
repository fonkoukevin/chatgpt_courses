import { expect, type APIRequestContext } from '@playwright/test';
import type { ContentView, CreateContent } from '../../apps/web/src/lib/api/generated/types.gen';
import { csrfHeaders } from './editorial-fixture';

export type RecordedContent = { value: ContentView; etag: string };
async function recorded(response: Awaited<ReturnType<APIRequestContext['get']>>, status: number): Promise<RecordedContent> {
  expect(response.status()).toBe(status);
  const value = await response.json() as ContentView;
  const etag = response.headers().etag;
  expect(etag === `"content-${value.id}-r${value.revision}"`).toBe(true);
  return { value, etag };
}
export async function createContent(request: APIRequestContext, data: CreateContent) {
  return recorded(await request.post('/api/v1/admin/contents', { headers: await csrfHeaders(request), data }), 201);
}
export async function currentContent(request: APIRequestContext, id: string) {
  return recorded(await request.get(`/api/v1/admin/contents/${id}`), 200);
}
export async function contentAction(request: APIRequestContext, content: RecordedContent, action: string, data: unknown, status = 200) {
  return recorded(await request.post(`/api/v1/admin/contents/${content.value.id}/${action}`, {
    headers: { ...await csrfHeaders(request), 'If-Match': content.etag }, data,
  }), status);
}
export async function publishContent(request: APIRequestContext, initial: RecordedContent) {
  let content = await contentAction(request, initial, 'transition', { state: 'TO_REVIEW', reason: 'Automated P05 fixture review request', sourceRevisionId: null });
  content = await contentAction(request, content, 'transition', { state: 'READY', reason: 'Automated P05 fixture review', sourceRevisionId: null });
  return contentAction(request, content, 'publish', { revisionId: content.value.currentRevisionId, reason: 'Automated P05 fixture publication' });
}
