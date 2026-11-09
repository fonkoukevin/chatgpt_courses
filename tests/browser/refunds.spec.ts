import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { getRefundsDictionary, getRefundStateDictionary } from '../../apps/web/src/lib/i18n/refunds';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { orderStatusPath } from '../../apps/web/src/lib/commerce/routes';
import { adminRefundOperationPath, adminRefundsPath, entitlementsPath, orderRefundsPath } from '../../apps/web/src/lib/refunds/routes';
import { commerceHeaders, commerceSql, checkedUuid } from './commerce-fixture';
import { controlApi, controlRefund } from './control';
import { advancePayment, verifyPaymentContent } from './payments-fixture';
import { captureRefund, allocations, approveRefund, executeRefund, memberPath, operation, operations, paidRefundOrder, refundContext, refundSources, requestRefund, type RefundSources } from './refunds-fixture';

test.describe('P13 · demandes, finances et origines distinctes (fournisseur contrôlé)', () => {
  test.describe.configure({ mode: 'serial' });
  let sources: RefundSources;
  test.beforeAll(async ({ playwright }, info) => { info.setTimeout(300_000); sources = await refundSources(playwright); });
  test.afterAll(async () => { await sources?.operator.dispose(); await sources?.secondEditor.dispose(); });

  test('01 · FR : demande et décision par interface, pack A+B, A indépendant conservé', async ({ page, context, browser }) => {
    test.setTimeout(240_000);
    const t = getRefundsDictionary('fr'), s = getRefundStateDictionary('fr');
    const individual = await paidRefundOrder(context.request, sources);
    const pack = await paidRefundOrder(context.request, sources, 'fr', [sources.a.learning.course.fr, sources.b.course.fr], individual.owner);
    expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
    expect((await context.request.get(memberPath(sources.b))).status()).toBe(200);
    await page.goto(orderRefundsPath('fr', pack.order.value.id));
    await page.getByRole('textbox', { name: t.requestReason, exact: true }).fill('Recette P13 : demande sur le pack, achat individuel conservé.');
    await page.locator('[data-refund-request-form]').getByRole('button', { name: t.create, exact: true }).click();
    await expect(page.locator('[data-refund-request]')).toHaveCount(1);
    const requestId = await page.locator('[data-refund-request]').getAttribute('data-refund-request'); expect(requestId).toBeTruthy();
    const opContext = await browser.newContext({ storageState: await sources.operator.storageState() });
    try {
      const admin = await opContext.newPage(); await admin.goto(adminRefundsPath('fr'));
      await admin.getByRole('button', { name: s.view, exact: true }).click();
      await expect(admin.locator(`[data-refund-list-item="${requestId}"]`)).toBeVisible();
      await admin.goto(adminRefundsPath('fr', requestId!));
      const financial = await refundContext(sources.operator, pack.order.value.id, true), total = financial.paidAmountMinor;
      await admin.getByRole('textbox', { name: `${t.amount} (${financial.currency})`, exact: true }).fill((total / 100).toFixed(2));
      for (const [index, line] of financial.lines.entries()) {
        const row = admin.locator(`[data-refund-allocation="${line.orderResourceId}"]`);
        await row.getByRole('checkbox').check(); await row.getByRole('textbox', { name: `${s.allocation} (${financial.currency})`, exact: true }).fill(index === 0 ? (total / 100).toFixed(2) : '0');
        await row.getByRole('combobox', { name: t.accessEffect, exact: true }).selectOption('REVOKE');
      }
      await admin.getByRole('textbox', { name: t.decisionReason, exact: true }).fill('Décision explicite de recette, totalité du pack et ses seules origines.');
      await admin.getByRole('button', { name: t.preview, exact: true }).click(); await expect(admin.locator('[data-refund-preview]')).toBeVisible();
      await captureRefund(admin, 'fr-1440-operator-preview-pack', 1440);
      await admin.getByRole('button', { name: t.approve, exact: true }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: t.approve, exact: true }).click();
      await expect(admin.locator('[data-refund-request]').getByText(s.requests.APPROVED, { exact: true })).toBeVisible();
      const prepared = (await operations(sources.operator, pack.order.value.id, true)).items[0]; expect(prepared.state).toBe('PREPARED');
      expect((await refundContext(sources.operator, pack.order.value.id, true)).reservedMinor).toBe(total);
      expect((await context.request.get(memberPath(sources.b))).status()).toBe(200);
      await admin.goto(adminRefundOperationPath('fr', prepared.id));
      await admin.getByRole('textbox', { name: s.actionReason, exact: true }).fill('Exécution explicite du remboursement TEST du pack.');
      await admin.getByRole('button', { name: t.execute, exact: true }).click();
      await expect(admin.getByRole('alertdialog').getByRole('button', { name: t.cancel, exact: true })).toBeFocused();
      await admin.keyboard.press('Shift+Tab'); await expect(admin.getByRole('alertdialog').getByRole('button', { name: t.execute, exact: true })).toBeFocused();
      await admin.keyboard.press('Tab'); await expect(admin.getByRole('alertdialog').getByRole('button', { name: t.cancel, exact: true })).toBeFocused();
      await captureRefund(admin, 'fr-390-financial-confirmation', 390);
      await admin.getByRole('alertdialog').getByRole('button', { name: t.execute, exact: true }).click();
      await expect.poll(async () => (await operation(context.request, prepared.id)).state).toBe('SUCCEEDED');
      await expect(admin.locator('[data-refund-financial-state="SUCCEEDED"]')).toBeVisible(); await captureRefund(admin, 'fr-1440-refund-confirmed', 1440);
      expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
      expect((await context.request.get(memberPath(sources.b))).status()).toBe(403);
      await verifyPaymentContent(context.request, sources.a, 'fr', true);
      await verifyPaymentContent(context.request, sources.a, 'en', true);
      expect((await context.request.get(memberPath(sources.b, 'en'))).status()).toBe(403);
      // A newly signed old payment event consults current provider/refund facts;
      // neither it nor duplicate refund delivery may recreate the pack origins.
      await advancePayment(pack.order.value.id, 'PAID', 'checkout.session.completed');
      await controlRefund('advance-refund', { orderId: pack.order.value.id, operationId: prepared.id, state: 'SUCCEEDED', type: 'refund.updated' });
      await page.goto(orderStatusPath('fr', pack.order.value.id));
      await expect(page.locator('[data-order-refund-status="updated"]')).toBeVisible();
      await expect(page.getByRole('link').filter({ hasText: getCommerceDictionary('fr').resume })).toHaveCount(0);
      await captureRefund(page, 'fr-390-old-payment-view-refund-aware');
      await page.goto(entitlementsPath('fr')); await expect(page.locator('[data-entitlement-state="ACTIVE"]')).toHaveCount(1); await expect(page.locator('[data-entitlement-state="REVOKED"]')).toHaveCount(2);
      for (const width of [1440, 390, 320]) await captureRefund(page, `fr-${width}-origins-pack-refunded`, width);
      expect((await context.request.get(memberPath(sources.b))).status()).toBe(403);
    } finally { await opContext.close(); }
  });

  test('02 · EN : remboursement partiel en attente puis échoué, aucun droit retiré', async ({ page, context }) => {
    const t = getRefundsDictionary('en'), s = getRefundStateDictionary('en'), fixture = await paidRefundOrder(context.request, sources, 'en');
    const financial = await refundContext(context.request, fixture.order.value.id), request = await requestRefund(context.request, fixture);
    const prepared = await approveRefund(sources, request.value.id, 300, allocations(financial, 300, 'REVOKE'));
    await controlRefund('configure-refund', { orderId: fixture.order.value.id, state: 'PENDING' }); await executeRefund(sources, prepared.id);
    await expect.poll(async () => (await operation(context.request, prepared.id)).state).toBe('PENDING');
    await page.goto(orderRefundsPath('en', fixture.order.value.id)); await expect(page.locator('[data-refund-financial-state="PENDING"]').getByRole('definition').filter({ hasText: s.operations.PENDING })).toHaveText(s.operations.PENDING); await expect(page.getByText(s.operations.SUCCEEDED, { exact: true })).toHaveCount(0);
    expect((await refundContext(context.request, fixture.order.value.id)).reservedMinor).toBe(300); expect((await context.request.get(memberPath(sources.a.learning, 'en'))).status()).toBe(200);
    await captureRefund(page, 'en-1440-partial-pending', 1440); await captureRefund(page, 'en-390-partial-pending', 390);
    await controlRefund('advance-refund', { orderId: fixture.order.value.id, operationId: prepared.id, state: 'FAILED', type: 'refund.failed' });
    await expect.poll(async () => (await operation(context.request, prepared.id)).state).toBe('FAILED');
    await page.getByRole('button', { name: t.refresh, exact: true }).click(); await expect(page.locator('[data-refund-financial-state="FAILED"]').getByRole('definition').filter({ hasText: s.operations.FAILED })).toHaveText(s.operations.FAILED); await expect(page.getByText(s.operations.SUCCEEDED, { exact: true })).toHaveCount(0);
    const failed = await refundContext(context.request, fixture.order.value.id); expect(failed.reservedMinor).toBe(0); expect(failed.confirmedRefundedMinor).toBe(0);
    expect((await context.request.get(memberPath(sources.a.learning, 'en'))).status()).toBe(200); await captureRefund(page, 'en-320-partial-failed-access-kept', 320);
  });

  test('03 · geste commercial KEEP et remboursement Dashboard partiel à examiner', async ({ page, context, browser }) => {
    const fixture = await paidRefundOrder(context.request, sources), financial = await refundContext(context.request, fixture.order.value.id), request = await requestRefund(context.request, fixture);
    const prepared = await approveRefund(sources, request.value.id, 200, allocations(financial, 200, 'KEEP')); await executeRefund(sources, prepared.id);
    await expect.poll(async () => (await operation(context.request, prepared.id)).accessState).toBe('KEPT');
    await controlRefund('external-refund', { orderId: fixture.order.value.id, state: 'SUCCEEDED', amountMinor: 100 });
    await expect.poll(async () => (await operations(context.request, fixture.order.value.id)).total).toBe(2);
    const external = (await operations(context.request, fixture.order.value.id)).items.find(value => value.origin === 'STRIPE_DASHBOARD')!;
    expect(external.state).toBe('SUCCEEDED'); expect(external.accessState).toBe('NEEDS_REVIEW'); expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
    const adminContext = await browser.newContext({ storageState: await sources.operator.storageState() });
    try {
      const admin = await adminContext.newPage(), t = getRefundsDictionary('en'), s = getRefundStateDictionary('en');
      await admin.goto(adminRefundOperationPath('en', external.id)); await expect(admin.getByText(s.externalReview, { exact: true })).toBeVisible(); await captureRefund(admin, 'en-1440-dashboard-partial-needs-review', 1440);
      const row = admin.locator('[data-refund-allocation]').first(); await row.getByRole('checkbox').check(); await row.getByRole('textbox', { name: `${s.allocation} (${financial.currency})`, exact: true }).fill('1.00'); await row.getByRole('combobox', { name: t.accessEffect, exact: true }).selectOption('KEEP');
      await admin.getByRole('textbox', { name: s.actionReason, exact: true }).fill('Explicit test-only KEEP decision for external partial refund.');
      await admin.getByRole('button', { name: s.externalAccess, exact: true }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: s.externalAccess, exact: true }).click();
      await expect.poll(async () => (await operation(context.request, external.id)).accessState).toBe('KEPT');
    } finally { await adminContext.close(); }
    await page.goto(orderRefundsPath('fr', fixture.order.value.id)); await expect(page.locator('[data-refund-financial-state="SUCCEEDED"]')).toHaveCount(2); await captureRefund(page, 'fr-390-partial-keep-no-revocation');
    expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
  });

  test('04 · timeout ambigu : UNKNOWN, rapprochement GET et une seule création', async ({ page, context }) => {
    test.setTimeout(240_000);
    const fixture = await paidRefundOrder(context.request, sources), financial = await refundContext(context.request, fixture.order.value.id), request = await requestRefund(context.request, fixture);
    const prepared = await approveRefund(sources, request.value.id, financial.paidAmountMinor, allocations(financial, financial.paidAmountMinor, 'REVOKE'));
    const observations: unknown[] = [];
    function leaseSnapshot(phase: string) {
      const orderId = checkedUuid(fixture.order.value.id), operationId = checkedUuid(prepared.id);
      const value = JSON.parse(commerceSql(`SELECT jsonb_build_object('jobState',coalesce(j.state,'NONE'),'operationState',p.state,
        'sameOrder',p.order_id='${orderId}','hasLease',j.lease_until IS NOT NULL,
        'leaseActive',coalesce(j.lease_until>clock_timestamp(),false),
        'leaseRemainingMs',coalesce(greatest(0,ceil(extract(epoch FROM(j.lease_until-clock_timestamp()))*1000)),0),
        'nextAttemptDue',coalesce(j.next_attempt_at<=clock_timestamp(),false),
        'nextAttemptDelayMs',coalesce(greatest(0,ceil(extract(epoch FROM(j.next_attempt_at-clock_timestamp()))*1000)),0),
        'operationCount',(SELECT count(*) FROM refund_operations WHERE order_id='${orderId}'))
        FROM refund_operations p LEFT JOIN refund_reconciliation_jobs j ON j.order_id=p.order_id WHERE p.id='${operationId}';`)) as {
          jobState: string; operationState: string; sameOrder: boolean; hasLease: boolean; leaseActive: boolean; leaseRemainingMs: number; nextAttemptDue: boolean; nextAttemptDelayMs: number; operationCount: number;
        };
      if (!value.sameOrder || !Number.isSafeInteger(value.leaseRemainingMs) || value.leaseRemainingMs < 0 || value.leaseRemainingMs > 600_000) throw new Error('The exact isolated refund lease must be bounded and mapped.');
      observations.push({ phase, ...value });
      writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'refund-unknown-lease-observations.json'), JSON.stringify({ readOnly: true, noLeaseOrDateModified: true, observations }, null, 2) + '\n', 'utf8');
      return value;
    }
    leaseSnapshot('before-stop');
    let abandonedLeaseObserved = false;
    await controlApi('stop-refund-worker');
    try {
      await controlRefund('configure-refund', { orderId: fixture.order.value.id, state: 'TIMEOUT' }); await executeRefund(sources, prepared.id);
      expect((await operation(context.request, prepared.id)).state).toBe('UNKNOWN');
      const stopped = leaseSnapshot('unknown-worker-stopped'); abandonedLeaseObserved = stopped.jobState === 'PROCESSING' && stopped.leaseActive;
      await page.goto(orderRefundsPath('fr', fixture.order.value.id)); await expect(page.locator('[data-refund-financial-state="UNKNOWN"]').getByRole('definition').filter({ hasText: getRefundStateDictionary('fr').operations.UNKNOWN })).toHaveText(getRefundStateDictionary('fr').operations.UNKNOWN); await expect(page.getByText(getRefundsDictionary('fr').confirmed, { exact: true })).toHaveCount(0); await captureRefund(page, 'fr-390-ambiguous-response-not-confirmed');
      expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
    } finally { await controlApi('start-refund-worker'); }
    const resumed = leaseSnapshot('after-restart');
    // A process kill deliberately leaves a durable claim intact. Only an
    // observed abandoned lease extends this assertion: its real remaining
    // lifetime plus 30s for maintenance/poll and bounded controlled GETs.
    const waitMs = abandonedLeaseObserved && resumed.jobState === 'PROCESSING' && resumed.leaseActive ? resumed.leaseRemainingMs + 30_000 : 10_000;
    if (waitMs > 180_000) throw new Error('The observed lease exceeds this scenario budget; no lease is shortened to pass.');
    try { await expect.poll(async () => (await operation(context.request, prepared.id)).state, { timeout: waitMs }).toBe('SUCCEEDED'); }
    finally { observations.push({ abandonedLeaseObserved, waitMs }); leaseSnapshot('after-wait'); }
    expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(403);
    expect((await operations(context.request, fixture.order.value.id)).total).toBe(1);
  });

  test('05 · refus de permission/propriété et panne API : motif conservé sans succès fictif', async ({ page, context, browser }) => {
    test.setTimeout(240_000);
    const fixture = await paidRefundOrder(context.request, sources), t = getRefundsDictionary('fr');
    const foreign = await browser.newContext();
    try { expect((await foreign.request.get(`/api/v1/me/orders/${fixture.order.value.id}/refund-context`)).status()).toBe(401); } finally { await foreign.close(); }
    expect((await context.request.get('/api/v1/admin/refund-requests')).status()).toBe(403);
    const denied = await context.request.post(`/api/v1/admin/refunds/${randomUUID()}/execute`, { headers: { ...await commerceHeaders(context.request, fixture.owner.id), 'Idempotency-Key': randomUUID(), 'If-Match': '"test"' }, data: { reason: 'Not an operator.' } }); expect(denied.status()).toBe(403);
    await page.goto(orderRefundsPath('fr', fixture.order.value.id)); const reason = 'Mon motif reste dans le formulaire pendant une panne.'; await page.getByRole('textbox', { name: t.requestReason, exact: true }).fill(reason);
    await controlApi('stop-api');
    try {
      await page.locator('[data-refund-request-form]').getByRole('button', { name: t.create, exact: true }).click();
      await expect(page.getByText(t.unavailable, { exact: true }).first()).toBeVisible(); await expect(page.getByRole('textbox', { name: t.requestReason, exact: true })).toHaveValue(reason); await expect(page.getByText(t.requested, { exact: true })).toHaveCount(0); await captureRefund(page, 'fr-390-api-unavailable-preserves-reason');
    } finally { await controlApi('start-api'); }
    await page.getByRole('button', { name: t.refresh, exact: true }).click(); await expect(page.getByRole('textbox', { name: t.requestReason, exact: true })).toHaveValue(reason);
    await page.locator('[data-refund-request-form]').getByRole('button', { name: t.retry, exact: true }).click(); await expect(page.locator('[data-refund-request]')).toHaveCount(1);
  });

  test('06 · incident email après confirmation : finances et droits restent distincts', async ({ page, context }) => {
    const fixture = await paidRefundOrder(context.request, sources), financial = await refundContext(context.request, fixture.order.value.id), request = await requestRefund(context.request, fixture);
    const prepared = await approveRefund(sources, request.value.id, 200, allocations(financial, 200, 'KEEP'));
    await controlApi('pause-mailpit');
    try {
      await executeRefund(sources, prepared.id);
      await expect.poll(async () => (await operation(context.request, prepared.id)).notificationStatus, { timeout: 30_000 }).toBe('ISSUE');
      expect((await operation(context.request, prepared.id)).state).toBe('SUCCEEDED');
      expect((await context.request.get(memberPath(sources.a.learning))).status()).toBe(200);
      await page.goto(orderRefundsPath('fr', fixture.order.value.id));
      await expect(page.locator('[data-refund-financial-state="SUCCEEDED"]')).toBeVisible();
      await expect(page.getByText(`${getRefundsDictionary('fr').notification} : ${getRefundStateDictionary('fr').notificationIssue}`, { exact: true })).toBeVisible();
      await captureRefund(page, 'fr-390-refund-confirmed-email-incident');
    } finally { await controlApi('resume-mailpit'); }
  });
});
