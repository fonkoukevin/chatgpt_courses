import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { MethodFields, MethodView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getAuthDictionary } from '../../apps/web/src/lib/i18n/auth';
import { authPath } from '../../apps/web/src/lib/auth/routes';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publishPublicContent } from './public-content-fixture';
import { br01MethodDefinition, br01Parameters } from './method-definition-fixture';

export async function methodLearner(request: APIRequestContext, locale: 'fr' | 'en' = 'fr') {
  const email = `p07.${randomUUID()}@example.invalid`, password = `P07-${randomBytes(20).toString('base64url')}!`;
  const response = await request.post('/api/v1/auth/register', { headers: await csrfHeaders(request), data: { email, password, locale } });
  expect(response.status()).toBe(201); const value = await response.json() as { id: string };
  return { email, password, id: value.id };
}
export async function loginMethodAccount(request: APIRequestContext, account: { email: string; password: string }) {
  expect((await request.post('/api/v1/auth/login', { headers: await csrfHeaders(request), form: { email: account.email, password: account.password } })).status()).toBe(200);
}
export async function fillMethodLogin(page: Page, locale: 'fr' | 'en', account: { email: string; password: string }) {
  const text = getAuthDictionary(locale);
  await page.getByRole('textbox', { name: text.email, exact: true }).fill(account.email);
  await page.getByLabel(text.password).fill(account.password);
  await page.getByRole('button', { name: text.signIn, exact: true }).click();
}
export async function createMethodSources(request: APIRequestContext) {
  await loginEditor(request);
  const command = editorialContent('fr'); command.kind = 'METHOD_TEMPLATE'; command.title = 'BR01 · méthode personnelle de proposition';
  command.document.methodDefinition = br01MethodDefinition('fr');
  let fr = await publishPublicContent(request, await createContent(request, command));
  const translated = editorialContent('en'); translated.document.methodDefinition = br01MethodDefinition('en');
  let en = await contentAction(request, fr, 'translations', { locale: 'en', slug: `p07-method-${randomUUID()}`, title: 'BR01 · personal proposal method', summary: 'Explicit fictional BR01 method for P07 verification.', document: translated.document, reason: 'P07 explicit English method definition' }, 201);
  en = await publishPublicContent(request, en); fr = await currentContent(request, fr.value.id);
  return { fr, en };
}
export function methodFields(locale: 'fr' | 'en', marker = `P07-${randomUUID()}`): MethodFields {
  return { title: marker, locale, text: `${marker} · personally edited instruction`, parameters: br01Parameters(locale), generatedFrom: br01Parameters(locale), notes: `${marker} · private personal notes`, category: 'BR01' };
}
export async function createPersonalMethod(request: APIRequestContext, actor: string, fields: MethodFields, source?: RecordedContent) {
  const path = source ? '/api/v1/me/methods/from-template' : '/api/v1/me/methods';
  const data = source ? { fields, sourceResourceId: source.value.resourceId, sourceVersionId: source.value.versionId, sourceRevisionId: source.value.publishedRevisionId, sourceLocale: source.value.locale } : { fields };
  const response = await request.post(path, { headers: { ...await csrfHeaders(request), 'X-Account-Context': actor }, data });
  expect(response.status()).toBe(201);return await response.json() as MethodView;
}
export async function methodRecord(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/v1/me/methods/${id}`);expect(response.status()).toBe(200);
  return { value: await response.json() as MethodView, etag: response.headers().etag };
}
export async function patchPersonalMethod(request: APIRequestContext, actor: string, id: string, fields: MethodFields, etag?: string) {
  const current = etag ?? (await methodRecord(request, id)).etag;
  return request.patch(`/api/v1/me/methods/${id}`, { headers: { ...await csrfHeaders(request), 'X-Account-Context': actor, 'If-Match': current }, data: { fields } });
}
export const methodSourceHref = (source: RecordedContent, locale: 'fr' | 'en') => `/${locale}/${locale === 'fr' ? 'methodes' : 'methods'}/${source.value.slug}?version=${source.value.versionId}`;
export { authPath };
