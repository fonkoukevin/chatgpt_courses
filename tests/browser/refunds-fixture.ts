import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, type APIRequestContext, type PlaywrightWorkerArgs, type Page } from '@playwright/test';
import type { DecideRefund, RefundAllocation, RefundContext, RefundOperationPage, RefundOperationView, RefundPreview, RefundRequestView } from '../../apps/web/src/lib/api/generated/types.gen';
import { commerceHeaders, commerceSql, checkedUuid, createCommerceSources, createFixtureOffer, prepareOrder, type CommerceSources } from './commerce-fixture';
import { createLearningFixture, type LearningFixture } from './learning-fixture';
import { methodLearner, loginMethodAccount } from './methods-fixture';
import { advancePayment, capturePayment, createPaymentCheckout, waitForPayment, type PaymentLocale } from './payments-fixture';
import type { RecordedContent } from './editorial-api';

export async function refundSources(playwright: PlaywrightWorkerArgs['playwright']) {
  const operator = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }), secondEditor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  const a = await createCommerceSources(operator), b = await createLearningFixture(secondEditor), actor = checkedUuid(a.actor);
  expect(commerceSql(`INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code='REFUND_OPERATOR'; SELECT count(*) FROM user_roles x JOIN roles r ON r.id=x.role_id WHERE x.user_id='${actor}' AND r.code='REFUND_OPERATOR' AND x.revoked_at IS NULL;`)).toBe('1');
  const me = await operator.get('/api/v1/auth/me'); expect(me.status()).toBe(200);
  expect((await me.json() as { permissions: string[] }).permissions.includes('refunds.execute')).toBe(true);
  return { operator, secondEditor, actor, a, b };
}
export type RefundSources = Awaited<ReturnType<typeof refundSources>>;
export async function paidRefundOrder(request: APIRequestContext, sources: RefundSources, locale: PaymentLocale = 'fr', resources: RecordedContent[] = [sources.a.learning.course.fr], existingOwner?: Awaited<ReturnType<typeof methodLearner>>) {
  const owner = existingOwner ?? await methodLearner(request, locale); await loginMethodAccount(request, owner);
  const offer = await createFixtureOffer(sources.operator, sources.actor, resources);
  const order = await prepareOrder(request, owner.id, offer.value, locale);
  const fixture = { owner, order, offer, locale };
  await createPaymentCheckout(request, fixture);
  await advancePayment(order.value.id, 'PAID', 'checkout.session.completed'); await waitForPayment(request, order.value.id, 'PAID', 'READY');
  return fixture;
}
export type RefundOrder = Awaited<ReturnType<typeof paidRefundOrder>>;
export async function refundContext(request: APIRequestContext, orderId: string, admin = false): Promise<RefundContext> {
  const response = await request.get(`/api/v1/${admin ? 'admin' : 'me'}/orders/${checkedUuid(orderId)}/refund-context`); expect(response.status()).toBe(200); return await response.json() as RefundContext;
}
export async function requestRefund(request: APIRequestContext, fixture: RefundOrder) {
  const response = await request.post(`/api/v1/me/orders/${fixture.order.value.id}/refund-requests`, { headers: { ...await commerceHeaders(request, fixture.owner.id), 'Idempotency-Key': randomUUID() }, data: { reason: 'P13 explicit disposable verification request only.' } });
  expect(response.status()).toBe(201); return { value: await response.json() as RefundRequestView, etag: response.headers().etag };
}
export async function approveRefund(sources: RefundSources, requestId: string, amountMinor: number, allocations: RefundAllocation[]) {
  const current = await sources.operator.get(`/api/v1/admin/refund-requests/${checkedUuid(requestId)}`); expect(current.status()).toBe(200);
  const preview = await sources.operator.post(`/api/v1/admin/refund-requests/${requestId}/preview`, { headers: await commerceHeaders(sources.operator, sources.actor, current.headers().etag), data: { amountMinor, allocations } });
  expect(preview.status()).toBe(200); const proposal = await preview.json() as RefundPreview;
  const command: DecideRefund = { outcome: 'APPROVE', reason: 'P13 explicit test-only operator decision.', previewFingerprint: proposal.fingerprint, amountMinor, allocations };
  const decision = await sources.operator.post(`/api/v1/admin/refund-requests/${requestId}/decision`, { headers: { ...await commerceHeaders(sources.operator, sources.actor, current.headers().etag), 'Idempotency-Key': randomUUID() }, data: command });
  expect(decision.status()).toBe(200); const value = await decision.json() as { operation: RefundOperationView | null }; expect(value.operation?.state).toBe('PREPARED'); return value.operation!;
}
export async function executeRefund(sources: RefundSources, operationId: string) {
  const current = await sources.operator.get(`/api/v1/admin/refunds/${checkedUuid(operationId)}`); expect(current.status()).toBe(200);
  const response = await sources.operator.post(`/api/v1/admin/refunds/${operationId}/execute`, { headers: { ...await commerceHeaders(sources.operator, sources.actor, current.headers().etag), 'Idempotency-Key': randomUUID() }, data: { reason: 'P13 explicit TEST execution only.' } });
  expect([200, 202]).toContain(response.status()); return await response.json() as RefundOperationView;
}
export async function operation(request: APIRequestContext, id: string, admin = false) {
  const response = await request.get(`/api/v1/${admin ? 'admin' : 'me'}/refunds/${checkedUuid(id)}`); expect(response.status()).toBe(200); return await response.json() as RefundOperationView;
}
export async function operations(request: APIRequestContext, orderId: string, admin = false) {
  const response = await request.get(`/api/v1/${admin ? 'admin' : 'me'}/refunds?orderId=${checkedUuid(orderId)}`); expect(response.status()).toBe(200); return await response.json() as RefundOperationPage;
}
export function memberPath(fixture: LearningFixture | CommerceSources['learning'], locale: PaymentLocale = 'fr') { const target = fixture.premium[locale].value; return `/api/v1/me/resources/${target.resourceId}/versions/${target.versionId}?locale=${locale}`; }
export function allocations(context: RefundContext, total: number, action: 'KEEP'|'REVOKE'): RefundAllocation[] {
  // Explicit test allocation, never an invented per-course price: all money is
  // assigned to the first listed line and zero to the others, with one effect each.
  return context.lines.map((line, index) => ({ orderResourceId: line.orderResourceId, amountMinor: index === 0 ? total : 0, accessAction: action }));
}
export async function captureRefund(page: Page, name: string, width = 390) {
  const dialog = page.getByRole('alertdialog');
  if (!await dialog.count()) return capturePayment(page, name, width);
  await page.setViewportSize({ width, height: 1000 });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), animations: 'disabled' });
}
