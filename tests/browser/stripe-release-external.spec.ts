import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RefundOperationView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { commerceHeaders, commerceSql, checkedUuid } from './commerce-fixture';
import { controlApi, inspectExternalStripeOrder, replayExternalStripeEvent } from './control';
import { paymentCount, paymentStatus } from './payments-fixture';
import { fillHostedTestCard } from './stripe-hosted-test';
import { closeExternalPage, externalFailure, protectExternalArtifacts } from './stripe-privacy';
import { accessMetadata, assertExternalMember, checkoutReference, findCheckoutReference, createStripeReleaseFixture, executeRealRefund, openExternalLesson, prepareExternalPack, prepareRealRefund, refundFinancialContext, type CheckoutCleanupReference, type CheckoutReference, type HostedOrder, type StripeReleaseFixture } from './stripe-release-fixture';
test.afterEach(async ({ page }, info) => { await protectExternalArtifacts(page, info); });

test('P19-EXT-01 · deux Hosted Checkout TEST et remboursements réels partiel puis intégral, origines indépendantes', async ({ playwright, page, context }) => {
  test.setTimeout(900_000);
  if (process.env.COURSES_BROWSER_PHASE !== 'P19_EXTERNAL' || Object.keys(process.env).some(key => key.startsWith('STRIPE_'))) throw new Error('Explicit external TEST runner with server-only credentials required.');
  const report: Record<string, unknown> = { schemaVersion: 1, externalStripe: true, testMode: true, stage: 'fixture', result: 'running', testAmountsMinor: { individual: 100, pack: 200, partialRefund: 100, remainingRefund: 100 }, currency: 'EUR', sessions: [], secretsPrinted: false, providerScreenshots: false, cardDataRecorded: false };
  const proof = join(process.env.COURSES_BROWSER_EVIDENCE!, 'stripe-test-proof.json');
  const save = () => writeFileSync(proof, JSON.stringify(report, null, 2) + '\n');
  const stage = (value: string) => { report.stage = value; save(); };
  const diagnose = (value: unknown) => { const values = Array.isArray(report.accessDiagnostics) ? report.accessDiagnostics : []; if (values.length < 8) values.push(value); report.accessDiagnostics = values; save(); };
  const sessions: CheckoutCleanupReference[] = [], orderIds: string[] = [];
  const editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  let fixture: StripeReleaseFixture | undefined;
  save();
  try {
    fixture = await createStripeReleaseFixture(editor, context.request); const f = fixture;
    const individual = f.individual; orderIds.push(checkedUuid(individual.order.value.id));
    stage('unpaid'); await assertExternalMember(context.request, f.a, f.owner.id, false, diagnose);
    await page.goto(individual.statusHref + '?checkout=success&session_id=cs_test_forged'); expect(paymentCount(individual.order.value.id, 'grants')).toBe(0);
    const first = await payHosted(page, individual, stage, reference => { sessions.push(reference); report.sessions = sessions; save(); });
    const firstEvent = await checkoutEvent(first); report.individualPaymentEventId = firstEvent;
    expect(paymentCount(first.orderId, 'grants')).toBe(0); expect(paymentCount(first.orderId, 'notifications')).toBe(0);
    report.durableBeforeWorker = true; save();
    const firstProvider = await inspectExternalStripeOrder(first.orderId, first.operationId, first.sessionId); expect(firstProvider.testMode && firstProvider.paymentIntentStatus === 'succeeded' && firstProvider.amountMinor === 100).toBe(true);
    stage('start-workers'); expect((await controlApi('start-payment-worker')).ok).toBe(true); expect((await controlApi('start-refund-worker')).ok).toBe(true);
    await paidReady(page, individual, stage); expect(paymentCount(first.orderId, 'grants')).toBe(1);
    await enroll(f, f.a.course.value.resourceId, f.a.course.value.versionId);
    await Promise.all([assertExternalMember(context.request, f.a, f.owner.id, true, diagnose), openExternalLesson(page, f.a, f.owner.id, diagnose)]);
    stage('prepare-overlapping-pack'); const pack = await prepareExternalPack(f); orderIds.push(checkedUuid(pack.order.value.id));
    const second = await payHosted(page, pack, stage, reference => { sessions.push(reference); report.sessions = sessions; save(); });
    const packEvent = await checkoutEvent(second); report.packPaymentEventId = packEvent;
    await paidReady(page, pack, stage);
    const initialPack = await inspectExternalStripeOrder(second.orderId, second.operationId, second.sessionId); expect(initialPack.testMode && initialPack.amountMinor === 200 && initialPack.refundCount === 0).toBe(true);
    expect(paymentCount(second.orderId, 'grants')).toBe(2);
    expect(commerceSql(`SELECT count(*) FROM access_grants WHERE owner_id='${checkedUuid(f.owner.id)}' AND origin_type='MANUAL_TEST';`)).toBe('0');
    await assertExternalMember(context.request, f.a, f.owner.id, true, diagnose); await assertExternalMember(context.request, f.b, f.owner.id, true, diagnose);
    await enroll(f, f.b.course.value.resourceId, f.b.course.value.versionId); await openExternalLesson(page, f.b, f.owner.id, diagnose);
    const noteText = `P19 note personnelle conservée ${randomUUID()}`;
    const noteReply = await context.request.post('/api/v1/me/activity-notes', { headers: await commerceHeaders(context.request, f.owner.id), data: { activityId: f.b.activity.value.resourceId, activityVersionId: f.b.activity.value.versionId, locale: 'fr', text: noteText } }); expect(noteReply.status()).toBe(201); const note = await noteReply.json() as { id: string };
    const fileBefore = await context.request.post(`/api/v1/assets/${f.fileId}/download-access`, { headers: await commerceHeaders(context.request, f.owner.id), data: { locale: 'fr', resourceId: f.b.activity.value.resourceId, versionId: f.b.activity.value.versionId } }); expect(fileBefore.status()).toBe(200);
    const link = await fileBefore.json() as { url: string }; const fileResponse = await fetch(link.url, { credentials: 'omit', redirect: 'error' }); expect(fileResponse.status).toBe(200); expect(Buffer.from(await fileResponse.arrayBuffer()).equals(Buffer.from(f.fileBytes))).toBe(true);
    const financial = await refundFinancialContext(context.request, second.orderId), a = financial.lines.find(line => line.resourceId === f.a.course.value.resourceId), b = financial.lines.find(line => line.resourceId === f.b.course.value.resourceId);
    if (!a || !b) throw new Error('Exact A/B refund lines missing.');
    stage('partial-explicit-decision');
    const partial = await prepareRealRefund(f, pack, 100, [{ orderResourceId: a.orderResourceId, amountMinor: 0, accessAction: 'KEEP' }, { orderResourceId: b.orderResourceId, amountMinor: 100, accessAction: 'REVOKE' }]);
    await executeRealRefund(f, partial); await succeededRefund(context.request, partial.operation.id); await executeRealRefund(f, partial);
    const partialFacts = await inspectExternalStripeOrder(second.orderId, second.operationId, second.sessionId);
    expect(partialFacts.refundCount).toBe(1); expect(partialFacts.refundedMinor).toBe(100); expect(partialFacts.refunds?.every(value => value.metadataOrderMatches && value.operationId === partial.operation.id && value.status === 'succeeded')).toBe(true);
    await assertExternalMember(context.request, f.a, f.owner.id, true, diagnose); await assertExternalMember(context.request, f.b, f.owner.id, false, diagnose);
    if (!/^ch_[A-Za-z0-9]+$/.test(partialFacts.chargeId ?? '')) throw new Error('Verified charge reference missing.');
    await expect.poll(() => commerceSql(`SELECT count(*) FROM stripe_event_inbox WHERE object_id='${partialFacts.chargeId}' AND event_type='charge.refunded';`), { timeout: 60_000 }).not.toBe('0');
    const chargeEvent = commerceSql(`SELECT event_id FROM stripe_event_inbox WHERE object_id='${partialFacts.chargeId}' AND event_type='charge.refunded' ORDER BY created_at,event_id LIMIT 1;`);
    const fileAfter = await context.request.post(`/api/v1/assets/${f.fileId}/download-access`, { headers: await commerceHeaders(context.request, f.owner.id), data: { locale: 'fr', resourceId: f.b.activity.value.resourceId, versionId: f.b.activity.value.versionId } }); expect(fileAfter.status()).toBe(403);
    report.partial = { operationId: partial.operation.id, refundCount: 1, confirmedMinor: 100, accessA: 'ALLOWED', accessB: 'DENIED', executionReplaySameOperation: true }; save();
    stage('full-cumulative-explicit-decision');
    const remainder = await prepareRealRefund(f, pack, 100, [{ orderResourceId: a.orderResourceId, amountMinor: 100, accessAction: 'REVOKE' }, { orderResourceId: b.orderResourceId, amountMinor: 0, accessAction: 'REVOKE' }]);
    await executeRealRefund(f, remainder); await succeededRefund(context.request, remainder.operation.id); await executeRealRefund(f, remainder);
    const fullFacts = await inspectExternalStripeOrder(second.orderId, second.operationId, second.sessionId);
    expect(fullFacts.refundCount).toBe(2); expect(fullFacts.refundedMinor).toBe(200); expect(fullFacts.refunds?.every(value => value.metadataOrderMatches && [partial.operation.id, remainder.operation.id].includes(value.operationId ?? '') && value.status === 'succeeded')).toBe(true);
    const full = await refundFinancialContext(context.request, second.orderId); expect(full.confirmedRefundedMinor).toBe(200); expect(full.availableMinor).toBe(0); expect(full.reservedMinor).toBe(0); expect(full.paymentStatus).toBe('PAID');
    const originCounts = JSON.parse(commerceSql(`SELECT jsonb_build_object('total',count(*),'active',count(*) FILTER(WHERE revoked_at IS NULL),'revoked',count(*) FILTER(WHERE revoked_at IS NOT NULL)) FROM access_grants WHERE owner_id='${checkedUuid(f.owner.id)}';`)); expect(originCounts).toEqual({ total: 3, active: 1, revoked: 2 });
    stage('provider-refund-events');
    const refundRows = fullFacts.refunds ?? []; const refundEvents: string[] = [];
    for (const row of refundRows) { if (!/^re_[A-Za-z0-9]+$/.test(row.refundId)) throw new Error('Real refund reference missing.'); await expect.poll(() => commerceSql(`SELECT count(*) FROM stripe_event_inbox WHERE object_id='${row.refundId}' AND event_type IN('refund.created','refund.updated');`), { timeout: 60_000 }).not.toBe('0'); const event = commerceSql(`SELECT event_id FROM stripe_event_inbox WHERE object_id='${row.refundId}' AND event_type IN('refund.created','refund.updated') ORDER BY created_at,event_id LIMIT 1;`); if (!/^evt_[A-Za-z0-9]+$/.test(event)) throw new Error('Real refund event missing.'); refundEvents.push(event); }
    stage('old-provider-replays'); const before = ledger(second.orderId, partial.operation.id, remainder.operation.id);
    expect(before).toEqual({ checkoutOperations: 1, refundOperations: 2, packGrants: 2, packRevoked: 2, accessNotifications: 1, refundNotifications: 2 });
    if (!/^evt_[A-Za-z0-9]+$/.test(chargeEvent)) throw new Error('Real partial charge event missing.');
    for (const event of [packEvent, ...refundEvents, chargeEvent]) { const replay = await replayExternalStripeEvent(event, second.orderId); expect(replay.ok && replay.externalReplayRequested && replay.replayHttpAcknowledged && replay.metadataOrderMatches).toBe(true); }
    await expect.poll(() => refundEvents.every(id => commerceSql(`SELECT state FROM stripe_event_inbox WHERE event_id='${id}';`) === 'PROCESSED'), { timeout: 60_000 }).toBe(true);
    expect(ledger(second.orderId, partial.operation.id, remainder.operation.id)).toEqual(before);
    await Promise.all([assertExternalMember(context.request, f.a, f.owner.id, true, diagnose), openExternalLesson(page, f.a, f.owner.id, diagnose)]); await assertExternalMember(context.request, f.b, f.owner.id, false, diagnose);
    const publicView = await context.request.get(`/api/v1/contents/${f.a.activity.value.resourceId}?locale=fr`); expect(publicView.status()).toBe(200); expect((await publicView.json() as { document: unknown }).document).toBeNull();
    const last = await inspectExternalStripeOrder(second.orderId, second.operationId, second.sessionId); expect(last.refundCount).toBe(2); expect(last.refundedMinor).toBe(200);
    const retained = await context.request.get(`/api/v1/me/activity-notes/${checkedUuid(note.id)}`); expect(retained.status()).toBe(200); const retainedValue = await retained.json() as { text: string; locale: string }; expect(retainedValue.text === noteText && retainedValue.locale === 'fr').toBe(true);
    Object.assign(report, { result: 'passed', stage: 'completed', hostedCheckoutCount: 2, localRefundOperationCount: 2, providerRefundObjectCount: 2, refundTotalMinor: 200, origins: originCounts, partialAndCumulativeFullConfirmed: true, oldPaymentAndRefundReplaysAcknowledged: true, independentAAfterReplay: true, bDeniedAfterReplay: true, publicBodyStillRedacted: true, newFileAccessDeniedAfterRefund: true, originalNoteRetained: true, ledger: before, completedAt: new Date().toISOString() }); save();
  } catch {
    if (fixture) diagnose({ kind: 'FINAL_FAILURE_CONTEXT', a: accessMetadata(fixture.owner.id, fixture.a.activity.value.versionId), b: accessMetadata(fixture.owner.id, fixture.b.activity.value.versionId) });
    for (const id of orderIds) { try { const ref = findCheckoutReference(id); if (ref && !sessions.some(value => value.orderId === id)) sessions.push(ref); } catch { report.checkoutOperationLookupFailed = true; } }
    Object.assign(report, { result: 'failed', sessions, failedAt: new Date().toISOString() }); save();
    // Never attach the original error/cause: hosted locator failures can contain form values or bearer URLs.
    await closeExternalPage(page);
    throw externalFailure('EXTERNAL_STRIPE_TEST_NOT_VALIDATED');
  } finally { await editor.dispose(); }
});

async function payHosted(page: Page, order: HostedOrder, stage: (value: string) => void, record: (value: CheckoutReference) => void) {
  try {
  const t = getPaymentDictionary('fr'); stage('hosted-open'); await page.goto(order.summaryHref); await page.getByRole('checkbox', { name: t.terms, exact: true }).check(); await page.getByRole('button', { name: t.openCheckout, exact: true }).click();
  await page.waitForURL(url => url.origin === 'https://checkout.stripe.com', { timeout: 60_000 }); const reference = checkoutReference(order.order.value.id); record(reference);
  const old = await page.context().request.get(`/api/v1/me/orders/${checkedUuid(order.order.value.id)}`); expect(old.status()).toBe(200);
  const repeat = await page.context().request.post(`/api/v1/me/orders/${order.order.value.id}/checkout`, { headers: { ...await commerceHeaders(page.context().request, order.owner.id, old.headers().etag), 'Idempotency-Key': randomUUID() }, data: { acceptedTermsVersion: order.termsVersion } }); expect(repeat.status()).toBe(200); expect((await repeat.json() as { operationId: string }).operationId).toBe(reference.operationId);
  await fillHostedTestCard(page, stage, () => {}, 'p19-checkout-test@example.com'); stage('hosted-submit'); const button = page.locator('button[type="submit"]').filter({ hasText: /payer|pay|acheter/i }).first(); await expect(button).toBeEnabled(); await button.click();
  await page.waitForURL(url => url.origin === process.env.COURSES_BROWSER_ORIGIN && url.pathname.endsWith('/statut'), { timeout: 120_000 }); return reference;
  } catch { await closeExternalPage(page); throw externalFailure('HOSTED_TEST_CHECKOUT_NOT_COMPLETED'); }
}
async function checkoutEvent(reference: CheckoutReference) { const session = reference.sessionId; if (!/^cs_test_[A-Za-z0-9]+$/.test(session)) throw new Error('Real TEST Checkout required.'); await expect.poll(() => commerceSql(`SELECT count(*) FROM stripe_event_inbox WHERE object_id='${session}' AND event_type='checkout.session.completed';`), { timeout: 60_000 }).toBe('1'); expect(commerceSql(`SELECT api_version FROM stripe_event_inbox WHERE object_id='${session}' AND event_type='checkout.session.completed';`)).toBe('2026-10-28.endive'); return commerceSql(`SELECT event_id FROM stripe_event_inbox WHERE object_id='${session}' AND event_type='checkout.session.completed';`); }
async function paidReady(page: Page, order: HostedOrder, stage: (value: string) => void) { stage('await-paid-ready'); const deadline = Date.now() + 90_000; while (Date.now() < deadline) { const value = await paymentStatus(page.context().request, order.order.value.id); if (value.fulfillmentStatus === 'NEEDS_REVIEW' || value.paymentStatus === 'FAILED' || value.paymentStatus === 'EXPIRED') throw new Error('An authoritative payment incident stops external validation.'); if (value.paymentStatus === 'PAID' && value.fulfillmentStatus === 'READY') return; await new Promise(resolve => setTimeout(resolve, 500)); } throw new Error('External payment did not become PAID/READY within its bounded observation.'); }
async function enroll(f: StripeReleaseFixture, resourceId: string, versionId: string) { const reply = await f.learner.post('/api/v1/me/enrollments', { headers: await commerceHeaders(f.learner, f.owner.id), data: { courseResourceId: resourceId, courseVersionId: versionId, locale: 'fr' } }); expect([200, 201]).toContain(reply.status()); }
async function succeededRefund(request: import('@playwright/test').APIRequestContext, id: string) { const deadline = Date.now() + 120_000; while (Date.now() < deadline) { const response = await request.get(`/api/v1/me/refunds/${checkedUuid(id)}`); expect(response.status()).toBe(200); const state = await response.json() as RefundOperationView; if (['FAILED','CANCELED','NEEDS_REVIEW','REQUIRES_ACTION'].includes(state.state)) throw new Error('An authoritative refund incident stops external validation.'); if (state.state === 'SUCCEEDED') { expect(state.confirmedAt).not.toBeNull(); return state; } await new Promise(resolve => setTimeout(resolve, 500)); } throw new Error('External refund was not confirmed within its bounded observation.'); }
function ledger(orderId: string, first: string, second: string) { const order = checkedUuid(orderId), a = checkedUuid(first), b = checkedUuid(second); return JSON.parse(commerceSql(`SELECT jsonb_build_object('checkoutOperations',(SELECT count(*) FROM checkout_operations WHERE order_id='${order}'),'refundOperations',(SELECT count(*) FROM refund_operations WHERE order_id='${order}'),'packGrants',(SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id='${order}'),'packRevoked',(SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id='${order}' AND g.revoked_at IS NOT NULL),'accessNotifications',(SELECT count(*) FROM notification_outbox WHERE business_key='access:activated:${order}'),'refundNotifications',(SELECT count(*) FROM notification_outbox WHERE business_key IN('refund:confirmed:${a}','refund:confirmed:${b}')));`)); }
