import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fillHostedTestCard } from './stripe-hosted-test';
import { closeExternalPage, externalFailure, protectExternalArtifacts } from './stripe-privacy';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { commerceHeaders, commerceSql, checkedUuid } from './commerce-fixture';
import { controlApi, replayExternalStripeEvent } from './control';
import { createStripeExternalFixture } from './stripe-external-fixture';
import { paymentCount, paymentStatus, waitForPayment } from './payments-fixture';
test.afterEach(async ({ page }, info) => { await protectExternalArtifacts(page, info); });

// Actual hosted Checkout TEST. No request interception, test transport or synthetic event.
test('P12 · achat Stripe TEST réel, événement durable, reprise et rejeu sans duplication', async ({ playwright, page, context }) => {
  test.setTimeout(600000);
  if (process.env.COURSES_BROWSER_PHASE !== 'P12_EXTERNAL' || Object.keys(process.env).some(key => key === 'STRIPE_SECRET_KEY' || key === 'STRIPE_WEBHOOK_SECRET')) throw new Error('External TEST runner with server-only credentials required.');
  const evidence = process.env.COURSES_BROWSER_EVIDENCE!;
  const report: Record<string, unknown> = { externalStripe: true, testMode: true, testAmountMinor: 100, currency: 'EUR', stage: 'fixture', result: 'running', bearerUrlsWritten: false, secretsPrinted: false };
  const save = () => writeFileSync(join(evidence, 'stripe-test-proof.json'), JSON.stringify(report, null, 2) + '\n');
  const editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  const screenshot = async (name: string) => { await page.getByRole('main').focus(); await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true, animations: 'disabled' }); };
  save();
  try {
    const fixture = await createStripeExternalFixture(editor, context.request, { locale: 'fr', amountMinor: 100, currency: 'EUR', accessDays: 2, termsVersion: 'p12-external-test-v1' });
    const order = checkedUuid(fixture.order.value.id), t = getPaymentDictionary('fr');
    Object.assign(report, { orderId: order, offerId: fixture.offer.value.id, resourceId: fixture.course.value.resourceId, versionId: fixture.course.value.versionId, stage: 'unpaid-return' }); save();
    expect((await context.request.get(fixture.memberActivityPath)).status()).toBe(403);
    await page.goto(fixture.statusHref + '?checkout=success&session_id=cs_test_forged');
    expect(paymentCount(order, 'grants')).toBe(0);
    await expect(page.locator('[data-order-payment-status="ready"]')).toHaveCount(0);
    report.forgedReturnCreatesNoGrant = true;
    await page.goto(fixture.summaryHref);
    await page.getByRole('button', { name: t.openCheckout, exact: true }).click();
    await expect(page.getByText(t.termsRequired, { exact: true })).toBeVisible();
    expect(paymentCount(order, 'operations')).toBe(0);
    await page.getByRole('checkbox', { name: t.terms, exact: true }).check();
    await page.getByRole('button', { name: t.openCheckout, exact: true }).click();
    await page.waitForURL(url => url.origin === 'https://checkout.stripe.com', { timeout: 60000 });
    report.stage = 'hosted-checkout'; save();
    const safeRef = JSON.parse(commerceSql(`SELECT jsonb_build_object('operationId',id,'sessionId',session_id,'testMode',NOT livemode,'amountMinor',amount_minor,'currency',currency) FROM checkout_operations WHERE order_id='${order}';`)) as { operationId: string; sessionId: string; testMode: boolean; amountMinor: number; currency: string };
    expect(safeRef.testMode && safeRef.sessionId.startsWith('cs_test_') && safeRef.amountMinor === 100 && safeRef.currency === 'EUR').toBe(true);
    Object.assign(report, safeRef, { checkoutOperationExists: true }); save();
    // The secret-bearing hosted URL stays only in memory. The server must return
    // this same session when a second checkout request is made for the same order.
    const current = await context.request.get(`/api/v1/me/orders/${order}`);
    const repeat = await context.request.post(`/api/v1/me/orders/${order}/checkout`, { headers: { ...await commerceHeaders(context.request, fixture.owner.id, current.headers().etag), 'Idempotency-Key': randomUUID() }, data: { acceptedTermsVersion: 'p12-external-test-v1' } });
    expect(repeat.status()).toBe(200);
    const repeated = await repeat.json() as { operationId: string; url: string };
    expect(repeated.operationId === safeRef.operationId && new URL(repeated.url).origin === 'https://checkout.stripe.com' && new URL(repeated.url).pathname === new URL(page.url()).pathname).toBe(true);
    expect(paymentCount(order, 'operations')).toBe(1);
    report.secondCheckoutReusesSameSession = true;
    await fillHostedTestCard(page, stage => { report.stage = stage; save(); }, steps => { report.hostedKeyboardSteps = steps; save(); });
    report.stage = 'hosted-test-submission'; save();
    const pay = page.locator('button[type="submit"]').filter({ hasText: /payer|pay|acheter/i });
    await expect(pay.first()).toBeEnabled(); await pay.first().click();
    await page.waitForURL(url => url.origin === process.env.COURSES_BROWSER_ORIGIN && url.pathname.endsWith('/statut'), { timeout: 120000 });
    report.hostedReturnObserved = true; report.stage = 'durable-event'; save();
    const session = safeRef.sessionId;
    if (!/^cs_test_[A-Za-z0-9]+$/.test(session)) throw new Error('Expected real TEST session identifier.');
    const eventQuery = `SELECT coalesce((SELECT event_id FROM stripe_event_inbox WHERE object_id='${session}' AND event_type='checkout.session.completed' LIMIT 1),'');`;
    await expect.poll(() => /^evt_[A-Za-z0-9]+$/.test(commerceSql(eventQuery)), { timeout: 60000 }).toBe(true);
    const eventId = commerceSql(eventQuery);
    report.eventId = eventId;
    const deliveredVersion = commerceSql(`SELECT api_version FROM stripe_event_inbox WHERE event_id='${eventId}';`);
    expect(deliveredVersion).toBe('2026-10-28.endive'); report.deliveredEventApiVersion = deliveredVersion;
    expect(paymentCount(order, 'grants')).toBe(0); expect(paymentCount(order, 'notifications')).toBe(0);
    expect((await paymentStatus(context.request, order)).paymentStatus).not.toBe('PAID');
    report.durableReceiptBeforeWorkerWithoutGrants = true; save();
    await screenshot('fr-event-durable-before-worker');
    expect((await controlApi('start-payment-worker')).ok).toBe(true);
    await waitForPayment(context.request, order, 'PAID', 'READY');
    await page.goto(fixture.statusHref);
    await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible();
    await screenshot('fr-paid-ready');
    report.workerRestartPaidReady = true;
    const member = await context.request.get(fixture.memberActivityPath); expect(member.status()).toBe(200);
    const privateBody = await member.json() as { document: { blocks: { text: string }[] } };
    expect(privateBody.document.blocks.some(block => block.text === fixture.secret)).toBe(true);
    const publicView = await context.request.get(`/api/v1/contents/${fixture.activity.value.resourceId}?locale=fr`);
    expect(publicView.status()).toBe(200); expect((await publicView.json() as { document: unknown }).document).toBeNull();
    const enrollment = await context.request.post('/api/v1/me/enrollments', { headers: await commerceHeaders(context.request, fixture.owner.id), data: { courseResourceId: fixture.course.value.resourceId, courseVersionId: fixture.course.value.versionId, locale: 'fr' } });
    expect([200, 201]).toContain(enrollment.status());
    await page.goto(fixture.activityHref); await expect(page.getByText(fixture.secret, { exact: true })).toBeVisible();
    await screenshot('fr-private-activity-after-real-stripe');
    report.privateMemberAndActivityVisible = true; report.publicStillRedacted = true;
    expect(paymentCount(order, 'operations')).toBe(1); expect(paymentCount(order, 'grants')).toBe(1); expect(paymentCount(order, 'notifications')).toBe(1);
    Object.assign(report, { operationCount: 1, grantCount: 1, notificationIntentCount: 1, paymentStatus: 'PAID', fulfillmentStatus: 'READY' });
    report.stage = 'provider-replay'; save();
    const replays = await Promise.all([replayExternalStripeEvent(eventId, order), replayExternalStripeEvent(eventId, order)]);
    expect(replays.every(value => value.ok && value.externalReplayRequested && value.replayHttpAcknowledged && value.metadataOrderMatches && value.sessionId === session && value.amountMinor === 100 && value.currency === 'eur' && typeof value.sourceEventApiVersion === 'string' && /^pi_[A-Za-z0-9]+$/.test(value.paymentIntentId ?? ''))).toBe(true);
    await expect.poll(() => commerceSql(`SELECT state FROM stripe_event_inbox WHERE event_id='${eventId}';`), { timeout: 30000 }).toBe('PROCESSED');
    expect(paymentCount(order, 'operations')).toBe(1); expect(paymentCount(order, 'grants')).toBe(1); expect(paymentCount(order, 'notifications')).toBe(1); expect(paymentCount(order, 'events')).toBe(1);
    expect(commerceSql(`SELECT api_version FROM stripe_event_inbox WHERE event_id='${eventId}';`)).toBe('2026-10-28.endive');
    expect((await context.request.get(fixture.memberActivityPath)).status()).toBe(200);
    Object.assign(report, { paymentIntentId: replays[0].paymentIntentId, sourceEventApiVersion: replays[0].sourceEventApiVersion, realProviderReplaysRequested: 2, operationCount: 1, grantCount: 1, notificationIntentCount: 1, eventCount: 1, paymentStatus: 'PAID', fulfillmentStatus: 'READY', stage: 'completed', result: 'passed', completedAt: new Date().toISOString() }); save();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    report.failureDiagnostics = { timeout: /timeout|timed out/i.test(message), notEditable: /not editable|readonly|read-only/i.test(message), notEnabled: /not enabled|disabled/i.test(message), notVisible: /not visible|not stable/i.test(message), pointerIntercepted: /intercepts pointer events/i.test(message), interceptorTag: message.match(/<([a-z]+)[^>\r\n]*>\s+intercepts pointer events/i)?.[1] ?? null, locatorFill: /locator\.fill/i.test(message), locatorCheck: /locator\.check/i.test(message), locatorClick: /locator\.click/i.test(message) };
    if (typeof report.orderId === 'string' && /^[a-f0-9-]{36}$/.test(report.orderId)) {
      try {
        const references = JSON.parse(commerceSql(`SELECT coalesce((SELECT jsonb_build_object('operationId',id,'sessionId',session_id) FROM checkout_operations WHERE order_id='${checkedUuid(report.orderId)}'),'null'::jsonb);`));
        report.checkoutOperationExists = references !== null;
        if (references) Object.assign(report, references);
      } catch { report.checkoutOperationLookupFailed = true; }
    }
    if (new URL(page.url()).origin === 'https://checkout.stripe.com') {
      const allowedNames = new Set(['email', 'cardNumber', 'number', 'cardExpiry', 'expiry', 'cardCvc', 'cvc', 'billingName', 'billingCountry', 'billingPostalCode', 'postalCode']);
      report.hostedFieldDiagnostics = await Promise.all(page.frames().map(async frame => ({
        stripeFrame: /^https:\/\/[^/]*(?:stripe\.com|stripe\.network)(?:\/|$)/.test(frame.url()),
        inputs: await frame.locator('input,select').evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute('name') ?? '', type: node.getAttribute('type') ?? node.tagName.toLowerCase(), visible: (node as HTMLElement).offsetWidth > 0, readOnly: node.hasAttribute('readonly'), disabled: node.hasAttribute('disabled') }))).then(values => values.map(value => ({ ...value, name: allowedNames.has(value.name) ? value.name : 'unclassified' }))).catch(() => []),
      })));
    }
    report.result = 'failed'; report.failedAt = new Date().toISOString(); save();
    // Do not let Playwright report a bearer Checkout URL, customer/card fields or provider payload.
    await closeExternalPage(page);
    throw externalFailure('EXTERNAL_STRIPE_TEST_NOT_VALIDATED');
  } finally { await editor.dispose(); }
});
