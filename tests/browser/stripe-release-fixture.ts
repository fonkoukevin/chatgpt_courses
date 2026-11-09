import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import type { CreateOffer, OfferView, OrderView, RefundAllocation, RefundContext, RefundOperationView, RefundPreview, RefundRequestView } from '../../apps/web/src/lib/api/generated/types.gen';
import { orderStatusPath, ordersPath } from '../../apps/web/src/lib/commerce/routes';
import { courseActivityHref } from '../../apps/web/src/lib/public/routes';
import { commerceHeaders, commerceSql, checkedUuid } from './commerce-fixture';
import { createContent, contentAction, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { publishPublicContent } from './public-content-fixture';
import { assertStripeExternalFixtureIsolation, createStripeExternalFixture } from './stripe-external-fixture';

export type ExternalCourse = { course: RecordedContent; activity: RecordedContent; secret: string; memberPath: string; activityHref: string };
export type HostedOrder = { owner: { id: string }; order: { value: OrderView; etag: string }; summaryHref: string; statusHref: string; termsVersion: string };
export type CheckoutReference = { orderId: string; operationId: string; sessionId: string; checkoutOperationExists: boolean };
export type CheckoutCleanupReference = Omit<CheckoutReference, 'sessionId'> & { sessionId: string | null };

/** All local fixtures are isolated before any identity, role or editorial mutation. No provider call occurs here. */
export async function createStripeReleaseFixture(editor: APIRequestContext, learner: APIRequestContext) {
  await assertStripeExternalFixtureIsolation([editor, learner]);
  const individual = await createStripeExternalFixture(editor, learner, { locale: 'fr', amountMinor: 100, currency: 'EUR', accessDays: 2, termsVersion: 'p19-external-individual-test-v1' });
  const actor = checkedUuid(individual.actor), owner = individual.owner;
  expect(commerceSql(`INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code='REFUND_OPERATOR'; SELECT count(*) FROM user_roles x JOIN roles r ON r.id=x.role_id WHERE x.user_id='${actor}' AND r.code='REFUND_OPERATOR' AND x.revoked_at IS NULL;`)).toBe('1');
  const principal = await editor.get('/api/v1/auth/me'); expect(principal.status()).toBe(200);
  expect(((await principal.json()) as { permissions: string[] }).permissions.includes('refunds.execute')).toBe(true);
  const marker = `p19-external-b-${randomUUID()}`, secret = `P19-EXTERNAL-PRIVATE-${randomUUID()}`;
  let fileId = ''; const fileBytes = new TextEncoder().encode('# Ressource de recette TEST\nFichier privé B à réautoriser après remboursement.\n');
  async function publish(kind: 'ACTIVITY'|'MODULE'|'COURSE', children: RecordedContent[] = []) {
    const command = editorialContent('fr', 'PROTECTED'); command.kind = kind; command.slug = `${marker}-${kind.toLowerCase()}`;
    command.title = `STRIPE TEST · ressource fictive B · ${kind}`; command.summary = 'Fixture temporaire de recette TEST, aucun contenu ou tarif commercial.';
    command.childVersionIds = children.map(value => value.value.versionId); command.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
    command.reason = 'Publication technique explicite dans la seule base tmpfs de recette externe TEST';
    let draft = await createContent(editor, command);
    if (kind === 'ACTIVITY') {
      const intent = await editor.post('/api/v1/admin/assets/upload-intents', { headers: await commerceHeaders(editor, actor), data: { resourceId: draft.value.resourceId, versionId: draft.value.versionId, locale: 'fr', filename: 'p19-test-resource.md', contentType: 'text/plain', sizeBytes: fileBytes.length, purpose: 'RESOURCE' } }); expect(intent.status()).toBe(201);
      const upload = await intent.json() as { asset: { id: string }; uploadUrl: string; headers: Record<string,string> }; fileId = checkedUuid(upload.asset.id);
      const written = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: fileBytes, credentials: 'omit', redirect: 'error' }); expect(written.ok).toBe(true); await written.body?.cancel();
      const ready = await editor.post(`/api/v1/admin/assets/${fileId}/confirmations`, { headers: await commerceHeaders(editor, actor) }); expect(ready.status()).toBe(200); expect((await ready.json() as { state: string }).state).toBe('READY');
      draft = await contentAction(editor, draft, 'revisions', { title: draft.value.title, summary: draft.value.summary, document: { ...draft.value.document!, media: [{ assetId: fileId, kind: 'FILE', required: true, label: 'Ressource Markdown fictive B' }] }, reason: 'Lier le vrai fichier de la seule fixture S3 privée' });
    }
    return publishPublicContent(editor, draft);
  }
  const activity = await publish('ACTIVITY'), module = await publish('MODULE', [activity]), course = await publish('COURSE', [module]);
  const a: ExternalCourse = { course: individual.course, activity: individual.activity, secret: individual.secret, memberPath: individual.memberActivityPath, activityHref: individual.activityHref };
  const b: ExternalCourse = { course, activity, secret, memberPath: `/api/v1/me/resources/${activity.value.resourceId}/versions/${activity.value.versionId}?locale=fr`, activityHref: courseActivityHref('fr', course.value.slug, activity.value.slug, activity.value.resourceId, activity.value.versionId, course.value.versionId) };
  expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${checkedUuid(owner.id)}';`)).toBe('0');
  return { editor, learner, actor, owner, a, b, fileId, fileBytes, individual: { ...individual, termsVersion: 'p19-external-individual-test-v1' } };
}
export type StripeReleaseFixture = Awaited<ReturnType<typeof createStripeReleaseFixture>>;

/** Called after individual A is paid: the pack deliberately overlaps that exact resource/version. */
export async function prepareExternalPack(f: StripeReleaseFixture): Promise<HostedOrder> {
  const original = f.individual.offer.value.fields; if (!original.conditions) throw new Error('Explicit TEST terms missing.');
  const termsVersion = 'p19-external-pack-test-v1';
  const command: CreateOffer = { code: `p19-external-pack-${randomUUID()}`, kind: 'PACK', reason: 'Pack de recette TEST uniquement ; aucun prix commercial', fields: {
    ...original, copies: [{ locale: 'fr', title: 'STRIPE TEST · pack fictif A+B', summary: 'Deux ressources de recette ; montant TEST sans valeur de tarif commercial.' }],
    resources: [f.a.course, f.b.course].map(value => ({ resourceId: value.value.resourceId, versionId: value.value.versionId })),
    price: { amountMinor: 200, currency: 'EUR' }, conditions: { ...original.conditions, termsVersion, terms: [{ locale: 'fr', text: 'Conditions fictives de recette TEST ; achat individuel A et origines du pack restent distincts.' }] },
  } };
  const created = await f.editor.post('/api/v1/admin/offers', { headers: await commerceHeaders(f.editor, f.actor), data: command }); expect(created.status()).toBe(201);
  const draft = await created.json() as OfferView;
  const active = await f.editor.post(`/api/v1/admin/offers/${checkedUuid(draft.id)}/activate`, { headers: await commerceHeaders(f.editor, f.actor, created.headers().etag), data: { reason: 'Activation explicite de la seule offre fictive TEST' } }); expect(active.status()).toBe(200);
  const offer = await active.json() as OfferView;
  const prepared = await f.learner.post('/api/v1/me/orders', { headers: { ...await commerceHeaders(f.learner, f.owner.id), 'Idempotency-Key': randomUUID() }, data: { offerId: offer.id, offerRevision: offer.revision, locale: 'fr', acceptedTermsVersion: termsVersion } }); expect(prepared.status()).toBe(201);
  const value = await prepared.json() as OrderView; expect(value.snapshot.total).toEqual({ amountMinor: 200, currency: 'EUR' }); expect(value.snapshot.resources).toHaveLength(2);
  return { owner: f.owner, order: { value, etag: prepared.headers().etag }, summaryHref: ordersPath('fr', value.id), statusHref: orderStatusPath('fr', value.id), termsVersion };
}

export function findCheckoutReference(orderId: string): CheckoutCleanupReference | null {
  const id = checkedUuid(orderId);
  const value = JSON.parse(commerceSql(`SELECT coalesce((SELECT jsonb_build_object('orderId',order_id,'operationId',id,'sessionId',session_id,'checkoutOperationExists',true) FROM checkout_operations WHERE order_id='${id}'),'null'::jsonb);`));
  if (value === null) return null;
  if (value.orderId !== id || value.checkoutOperationExists !== true || typeof value.operationId !== 'string') throw new Error('Checkout operation reference unavailable.');
  checkedUuid(value.operationId); if (value.sessionId !== null && !/^cs_test_[A-Za-z0-9]+$/.test(value.sessionId)) throw new Error('A real TEST session was not confirmed.');
  return value;
}

export function checkoutReference(orderId: string): CheckoutReference {
  const value = findCheckoutReference(orderId);
  if (!value || value.sessionId === null) throw new Error('Checkout session reference unavailable.');
  return { ...value, sessionId: value.sessionId };
}

export async function refundFinancialContext(request: APIRequestContext, orderId: string): Promise<RefundContext> {
  const reply = await request.get(`/api/v1/me/orders/${checkedUuid(orderId)}/refund-context`); expect(reply.status()).toBe(200); return await reply.json() as RefundContext;
}
export async function prepareRealRefund(f: StripeReleaseFixture, order: HostedOrder, amountMinor: number, allocations: RefundAllocation[]) {
  const request = await f.learner.post(`/api/v1/me/orders/${checkedUuid(order.order.value.id)}/refund-requests`, { headers: { ...await commerceHeaders(f.learner, f.owner.id), 'Idempotency-Key': randomUUID() }, data: { reason: 'Demande explicite de recette fournisseur TEST, sans règle commerciale supposée.' } }); expect(request.status()).toBe(201);
  const requested = await request.json() as RefundRequestView;
  const current = await f.editor.get(`/api/v1/admin/refund-requests/${checkedUuid(requested.id)}`); expect(current.status()).toBe(200);
  const preview = await f.editor.post(`/api/v1/admin/refund-requests/${requested.id}/preview`, { headers: await commerceHeaders(f.editor, f.actor, current.headers().etag), data: { amountMinor, allocations } }); expect(preview.status()).toBe(200);
  const checked = await preview.json() as RefundPreview;
  const decision = await f.editor.post(`/api/v1/admin/refund-requests/${requested.id}/decision`, { headers: { ...await commerceHeaders(f.editor, f.actor, current.headers().etag), 'Idempotency-Key': randomUUID() }, data: { outcome: 'APPROVE', reason: 'Décision opérateur explicite, allocation TEST sans prix unitaire inventé.', amountMinor, allocations, previewFingerprint: checked.fingerprint } }); expect(decision.status()).toBe(200);
  const selected = await decision.json() as { operation: RefundOperationView | null }; if (!selected.operation) throw new Error('Explicit refund operation missing.'); expect(selected.operation.state).toBe('PREPARED');
  return { operation: selected.operation, executeKey: randomUUID(), executeReason: 'Exécution financière explicitement autorisée pour cette seule opération TEST.' };
}
export async function executeRealRefund(f: StripeReleaseFixture, prepared: Awaited<ReturnType<typeof prepareRealRefund>>) {
  const current = await f.editor.get(`/api/v1/admin/refunds/${checkedUuid(prepared.operation.id)}`); expect(current.status()).toBe(200);
  const response = await f.editor.post(`/api/v1/admin/refunds/${prepared.operation.id}/execute`, { headers: { ...await commerceHeaders(f.editor, f.actor, current.headers().etag), 'Idempotency-Key': prepared.executeKey }, data: { reason: prepared.executeReason } }); expect([200, 202]).toContain(response.status());
  return await response.json() as RefundOperationView;
}

export function accessMetadata(ownerId: string, targetVersion: string): unknown {
  try {
    const owner = checkedUuid(ownerId), target = checkedUuid(targetVersion);
    return { available: true, sampledAfterObservation: true, value: JSON.parse(commerceSql(`WITH RECURSIVE paths(grant_id,version_id,depth) AS (
      SELECT g.id,g.version_id,0 FROM access_grants g WHERE g.owner_id='${owner}'
      UNION ALL SELECT p.grant_id,c.child_version_id,p.depth+1 FROM paths p JOIN version_compositions c ON c.parent_version_id=p.version_id WHERE p.depth<2
    ) SELECT jsonb_build_object('accountActive',(SELECT status='ACTIVE' FROM user_accounts WHERE id='${owner}'),'grantCount',(SELECT count(*) FROM access_grants WHERE owner_id='${owner}'),'paths',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'depth',p.depth,'target',p.version_id='${target}','localeIncluded',g.locales @> '["fr"]'::jsonb,'started',g.starts_at<=clock_timestamp(),'unexpired',g.expires_at IS NULL OR g.expires_at>clock_timestamp(),'unrevoked',g.revoked_at IS NULL,'originOrder',g.origin_type='ORDER_LINE','resourceActive',r.archived_at IS NULL,'published',t.published_revision_id IS NOT NULL,
      'editorialState',CASE WHEN t.editorial_state IN('DRAFT','TO_REVIEW','READY','PUBLISHED','STALE','ARCHIVED') THEN t.editorial_state ELSE 'UNVERIFIED' END,'sourceCurrent',t.source_translation_id IS NULL OR t.published_source_revision_id=s.current_revision_id,'structuredDocument',e.document_json IS NOT NULL,
      'sourceActive',t.source_translation_id IS NULL OR s.editorial_state NOT IN('ARCHIVED','STALE'),'rootCourse',p.depth<>0 OR r.kind='COURSE','rootResourceMatches',p.depth<>0 OR g.resource_id=v.resource_id,
      'rootVersionCovered',p.depth<>0 OR g.version_id=v.id OR(g.version_policy='UPDATES_DURING_PERIOD' AND v.frozen_at>=g.starts_at AND v.frozen_at<=g.updates_until)))
      FROM paths p JOIN access_grants g ON g.id=p.grant_id JOIN pedagogical_versions v ON v.id=p.version_id JOIN learning_resources r ON r.id=v.resource_id LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale='fr' LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations s ON s.id=t.source_translation_id),'[]'::jsonb));`)) };
  } catch { return { available: false, sampledAfterObservation: true }; }
}
export async function assertExternalMember(request: APIRequestContext, course: ExternalCourse, owner: string, allowed: boolean, diagnose: (value: unknown) => void) {
  const response = await request.get(course.memberPath), body: unknown = await response.json().catch(() => null);
  const visible = Boolean(body && typeof body === 'object' && 'document' in body && body.document && typeof body.document === 'object' && 'blocks' in body.document && Array.isArray(body.document.blocks) && body.document.blocks.some(block => block?.text === course.secret));
  if (response.status() !== (allowed ? 200 : 403) || allowed && !visible || !allowed && visible) {
    const problem = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' && /^[A-Z_]{1,64}$/.test(body.code) ? body.code : 'UNVERIFIED';
    let principal: unknown = { available: false }; try { const me = await request.get('/api/v1/auth/me'), payload = await me.json().catch(() => null); principal = { status: me.status(), expectedOwner: payload?.id === owner, learningRead: Array.isArray(payload?.permissions) && payload.permissions.includes('learning.read') }; } catch { /* retain original observation */ }
    diagnose({ kind: 'MEMBER', expectedStatus: allowed ? 200 : 403, actualStatus: response.status(), privateBodyPresent: visible, code: problem, principal, database: accessMetadata(owner, course.activity.value.versionId) });
    throw new Error('External TEST member observation failed; no access retry performed.');
  }
}
export async function openExternalLesson(page: Page, course: ExternalCourse, owner: string, diagnose: (value: unknown) => void) {
  const observations: { kind: string; status: number; privateBodyPresent: boolean }[] = [], pending = new Set<Promise<void>>(); let rejected = false;
  const listener = (response: Response) => {
    const url = new URL(response.url()), resource = checkedUuid(course.activity.value.resourceId);
    const kind = response.request().method() === 'GET' && url.pathname === new URL(course.memberPath, 'https://fixture.invalid').pathname ? 'MEMBER'
      : response.request().method() === 'GET' && /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/activities\//.test(url.pathname) && url.pathname.endsWith('/' + resource) && url.searchParams.get('activityVersionId') === course.activity.value.versionId ? 'LEARNING'
        : response.request().method() === 'POST' && /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/visits$/.test(url.pathname) ? 'VISIT' : null;
    if (!kind) return;
    const task = (async () => { const body: unknown = await response.json().catch(() => null); const resourceBody = body && typeof body === 'object' && 'resource' in body ? body.resource : body;
      const visible = kind === 'VISIT' || Boolean(resourceBody && typeof resourceBody === 'object' && 'document' in resourceBody && resourceBody.document && typeof resourceBody.document === 'object' && 'blocks' in resourceBody.document && Array.isArray(resourceBody.document.blocks) && resourceBody.document.blocks.some(block => block?.text === course.secret));
      observations.push({ kind, status: response.status(), privateBodyPresent: visible }); if (response.status() !== 200 || !visible) { rejected = true; diagnose({ kind: 'LESSON_RESPONSE', observations, database: accessMetadata(owner, course.activity.value.versionId) }); }
    })().catch(() => { rejected = true; diagnose({ kind: 'LESSON_RESPONSE_UNREADABLE', observations, database: accessMetadata(owner, course.activity.value.versionId) }); }); pending.add(task); void task.finally(() => pending.delete(task));
  };
  page.on('response', listener);
  try { await page.goto(course.activityHref); await expect.poll(async () => { await Promise.all([...pending]); return !rejected && ['MEMBER','LEARNING','VISIT'].every(kind => observations.some(value => value.kind === kind)) && (await page.getByRole('main').innerText()).includes(course.secret); }).toBe(true); }
  catch { diagnose({ kind: 'LESSON', observations, database: accessMetadata(owner, course.activity.value.versionId) }); throw new Error('External TEST lesson observation failed; no navigation or access retry performed.'); }
  finally { page.off('response', listener); await Promise.all([...pending]); }
}
