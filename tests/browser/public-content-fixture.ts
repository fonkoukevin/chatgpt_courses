import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateContent, PublicMetadata } from '../../apps/web/src/lib/api/generated/types.gen';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { br01MethodDefinition } from './method-definition-fixture';

type Locale = 'fr' | 'en';
export type PublicPair = Record<Locale, RecordedContent>;

export async function savePublicMetadata(request: APIRequestContext, content: RecordedContent, metadata: PublicMetadata) {
  const response = await request.put(`/api/v1/admin/contents/${content.value.id}/metadata`, {
    headers: { ...await csrfHeaders(request), 'If-Match': content.etag }, data: { metadata, reason: 'P06 disposable public metadata fixture' },
  });
  expect(response.status()).toBe(200);
  const value = await response.json() as RecordedContent['value'];
  const etag = response.headers().etag;
  expect(etag === `"content-${value.id}-r${value.revision}"`).toBe(true);
  return { value, etag } as RecordedContent;
}

export async function publishPublicContent(request: APIRequestContext, input: RecordedContent) {
  let content = await currentContent(request, input.value.id);
  if (['DRAFT', 'STALE'].includes(content.value.state)) content = await contentAction(request, content, 'transition', { state: 'TO_REVIEW', reason: 'P06 fixture review requested', sourceRevisionId: null });
  const source = content.value.sourceTranslationId ? await currentContent(request, content.value.sourceTranslationId) : null;
  content = await contentAction(request, content, 'transition', { state: 'READY', reason: 'P06 fixture exact revision reviewed', sourceRevisionId: source?.value.currentRevisionId ?? null });
  return contentAction(request, content, 'publish', { revisionId: content.value.currentRevisionId, reason: 'P06 fixture actual publication' });
}

export function publicFixtureMetadata(locale: Locale, goal: PublicMetadata['goalCodes'][number] = 'understand-brief'): PublicMetadata {
  return { goalCodes: [goal], level: 'BEGINNER', audience: [locale === 'fr' ? 'Indépendants de services · exemple fictif' : 'Independent service providers · fictional example'],
    tools: [{ name: 'ChatGPT', url: 'https://chatgpt.com' }], sources: [],
    faq: [{ question: locale === 'fr' ? 'Que produit cet exercice ?' : 'What does this exercise produce?', answer: locale === 'fr' ? 'Une liste factuelle de demandes et de points à clarifier.' : 'A factual list of requests and points to clarify.' }],
    evaluationDescription: locale === 'fr' ? 'Contrôle déclaratif avec les critères fournis.' : 'A declared check using the supplied criteria.' };
}

export async function createPublicFixture(request: APIRequestContext, _baseURL?: string) {
  const account = await loginEditor(request);
  const marker = `p06-${randomUUID()}`;
  async function pair(kind: CreateContent['kind'], names: Record<Locale, string>, children: string[] = [], access: 'FREE' | 'PROTECTED' = 'FREE'): Promise<PublicPair> {
    const command = editorialContent('fr', access);
    command.kind = kind; command.slug = `${marker}-${kind.toLowerCase().replace('_', '-')}-fr`; command.title = names.fr;
    command.childVersionIds = children; command.reason = 'P06 disposable browser publication, not production learning content';
    if (kind === 'METHOD_TEMPLATE') command.document.methodDefinition = br01MethodDefinition('fr');
    let fr = await createContent(request, command);
    fr = await savePublicMetadata(request, fr, publicFixtureMetadata('fr'));
    fr = await publishPublicContent(request, fr);
    const translated = editorialContent('en', access);
    if (kind === 'METHOD_TEMPLATE') translated.document.methodDefinition = br01MethodDefinition('en');
    let en = await contentAction(request, fr, 'translations', { locale: 'en', slug: `${marker}-${kind.toLowerCase().replace('_', '-')}-en`, title: names.en,
      summary: 'Fictional BR01 resource for P06 public verification.', document: translated.document, reason: 'Explicit English fixture, same learning version' }, 201);
    en = await savePublicMetadata(request, en, publicFixtureMetadata('en'));
    en = await publishPublicContent(request, en);
    return { fr: await currentContent(request, fr.value.id), en };
  }
  const activity = await pair('ACTIVITY', { fr: 'BR01 · clarifier la demande', en: 'BR01 · clarify the request' });
  const module = await pair('MODULE', { fr: 'BR01 · comprendre le brief', en: 'BR01 · understand the brief' }, [activity.fr.value.versionId]);
  const course = await pair('COURSE', { fr: 'BR01 · du brief à la proposition', en: 'BR01 · from brief to proposal' }, [module.fr.value.versionId]);
  const guide = await pair('GUIDE', { fr: 'BR01 · repérer les informations manquantes', en: 'BR01 · identify missing information' });
  const method = await pair('METHOD_TEMPLATE', { fr: 'BR01 · méthode de lecture du brief', en: 'BR01 · method for reading a brief' });
  const secret = `PRIVATE-P06-${randomUUID()}`;
  const protectedCommand = editorialContent('fr', 'PROTECTED');
  protectedCommand.title = 'BR01 · activité protégée'; protectedCommand.slug = `${marker}-premium`;
  protectedCommand.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
  const premium = await publishPublicContent(request, await createContent(request, protectedCommand));
  return { editor: { email: account.address, password: account.password, userId: account.id }, marker, secret,
    resources: { course, module, activity, guide, method, premium } };
}

export type PublicFixture = Awaited<ReturnType<typeof createPublicFixture>>;
