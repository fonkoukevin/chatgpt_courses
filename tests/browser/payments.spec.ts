import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { getPaymentDictionary } from '../../apps/web/src/lib/i18n/payments';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { offersPath, ordersPath, orderStatusPath } from '../../apps/web/src/lib/commerce/routes';
import { checkedUuid, commerceHeaders, commerceSql, createCommerceSources, type CommerceSources } from './commerce-fixture';
import { controlApi } from './control';
import { methodLearner, loginMethodAccount } from './methods-fixture';
import { enrollLearning } from './learning-fixture';
import { advancePayment, capturePayment, createPaymentCheckout, openPaidLearningActivity, openPaymentCheckoutUi, paymentCount, paymentOrder, paymentStatus, preparePaymentFixture, verifyConcurrentPaymentContent, verifyPaymentContent, waitForPayment } from './payments-fixture';

test.describe('P12 · paiement contrôlé, confirmation et droits réels', () => {
  test.describe.configure({ mode: 'serial' });
  let editor: APIRequestContext, sources: CommerceSources, workerStarted = false;
  async function worker() { if (!workerStarted) { expect((await controlApi('start-payment-worker')).ok).toBe(true); workerStarted = true; } }
  test.beforeAll(async ({ playwright }, testInfo) => { testInfo.setTimeout(300_000); editor = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN }); sources = await createCommerceSources(editor); });
  test.afterAll(async () => { await editor?.dispose(); });

  test('01 · fr : événement durable avant worker, reprise, attribution et contenu privé', async ({ page, context }) => {
    test.setTimeout(480_000);
    expect((await controlApi('stop-payment-worker')).ok).toBe(true); workerStarted = false;
    const t = getPaymentDictionary('fr'), fixture = await preparePaymentFixture(context.request, editor, sources);
    await verifyPaymentContent(context.request, sources, 'fr', false);
    await openPaymentCheckoutUi(page, fixture, true);
    expect(paymentCount(fixture.order.value.id, 'operations')).toBe(1);
    await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.completed');
    expect(paymentCount(fixture.order.value.id, 'events')).toBe(1); expect(paymentCount(fixture.order.value.id, 'grants')).toBe(0); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(0);
    expect((await paymentOrder(context.request, fixture.order.value.id)).paymentStatus).not.toBe('PAID');
    await page.goto(orderStatusPath('fr', fixture.order.value.id, 'success'));
    await expect(page.getByText(t.returnSuccess, { exact: true })).toBeVisible(); await expect(page.getByText(t.readyTitle, { exact: true })).toHaveCount(0);
    await capturePayment(page, 'fr-1440-durable-event-before-worker', 1440);
    // A real PostgreSQL outbox fault separates financial confirmation from access activation.
    const fault = `p12_activation_${checkedUuid(fixture.order.value.id).replaceAll('-', '')}`;
    commerceSql(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.business_key='access:activated:${checkedUuid(fixture.order.value.id)}' THEN RAISE EXCEPTION 'Controlled isolated activation fault' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $$; CREATE TRIGGER ${fault} BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION ${fault}();`);
    try {
      await worker();
      await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'RETRYING');
      expect(paymentCount(fixture.order.value.id, 'grants')).toBe(0); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(0);
      await page.goto(orderStatusPath('fr', fixture.order.value.id, 'success'));
      await expect(page.getByText(t.activationTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(t.readyTitle, { exact: true })).toHaveCount(0);
      await capturePayment(page, 'fr-1440-paid-activation-delayed', 1440);
    } finally { commerceSql(`DROP TRIGGER ${fault} ON notification_outbox; DROP FUNCTION ${fault}();`); }
    await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'READY');
    expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
    await verifyConcurrentPaymentContent(context.request, sources, 'fr');
    await page.goto(orderStatusPath('fr', fixture.order.value.id, 'success'));
    await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible(); await expect(page.getByText(t.readyTitle, { exact: true })).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) await capturePayment(page, `fr-${width}-payment-ready-after-worker-restart`, width);
    await enrollLearning(context.request, sources.learning, fixture.owner.id, 'fr');
    await openPaidLearningActivity(page, sources, 'fr', fixture.owner.id);
    await expect(page.getByText(getLearningDictionary('fr').noSavedNote, { exact: true })).toBeVisible();
    await capturePayment(page, 'fr-390-premium-content-after-payment');
    // The event and reconciliation job may both observe the purchase; business effects remain unique.
    expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
  });

  test('02 · en : paiement différé sans droit puis confirmation et activation', async ({ page, context }) => {
    await worker(); const t = getPaymentDictionary('en'), fixture = await preparePaymentFixture(context.request, editor, sources, 'en');
    await openPaymentCheckoutUi(page, fixture, true);
    await advancePayment(fixture.order.value.id, 'PROCESSING', 'checkout.session.completed');
    await waitForPayment(context.request, fixture.order.value.id, 'PROCESSING', 'NOT_STARTED'); expect(paymentCount(fixture.order.value.id, 'grants')).toBe(0);
    await verifyPaymentContent(context.request, sources, 'en', false);
    await page.goto(orderStatusPath('en', fixture.order.value.id, 'success')); await expect(page.getByText(t.processingTitle, { exact: true })).toBeVisible(); await expect(page.getByText(t.readyTitle, { exact: true })).toHaveCount(0);
    await capturePayment(page, 'en-1440-deferred-payment-processing', 1440); await capturePayment(page, 'en-390-deferred-payment-processing');
    await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.async_payment_succeeded'); await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'READY');
    await page.getByRole('button', { name: t.refresh, exact: true }).click(); await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible();
    await verifyConcurrentPaymentContent(context.request, sources, 'en');
    for (const width of [1440, 390, 320]) await capturePayment(page, `en-${width}-deferred-payment-ready`, width);
    await enrollLearning(context.request, sources.learning, fixture.owner.id, 'en');
    await openPaidLearningActivity(page, sources, 'en', fixture.owner.id);
    await expect(page.getByText(getLearningDictionary('en').noSavedNote, { exact: true })).toBeVisible();
    await capturePayment(page, 'en-390-premium-content-after-payment');
    expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
  });

  test('03 · doublons et anciens événements ne dupliquent pas les droits', async ({ page, context }) => {
    await worker(); const fixture = await preparePaymentFixture(context.request, editor, sources);
    await createPaymentCheckout(context.request, fixture);
    const old = await advancePayment(fixture.order.value.id, 'PROCESSING', 'checkout.session.completed'); await waitForPayment(context.request, fixture.order.value.id, 'PROCESSING');
    const paid = await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.async_payment_succeeded');
    await Promise.all([
      advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.async_payment_succeeded', paid),
      advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.async_payment_succeeded', paid),
      advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.completed', old),
    ]);
    await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.completed'); await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'READY');
    await expect.poll(() => paymentCount(fixture.order.value.id, 'events')).toBe(3);
    expect(paymentCount(fixture.order.value.id, 'operations')).toBe(1); expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
    await page.goto(orderStatusPath('fr', fixture.order.value.id)); await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible(); await capturePayment(page, 'fr-390-duplicates-remain-one-activation');
  });

  test('04 · retour forgé et identifiant d’autrui ne confirment aucun paiement', async ({ page, context, browser }) => {
    await worker(); const t = getPaymentDictionary('fr'), c = getCommerceDictionary('fr'), fixture = await preparePaymentFixture(context.request, editor, sources);
    await page.goto(orderStatusPath('fr', fixture.order.value.id, 'success')); await expect(page.getByText(t.returnSuccess, { exact: true })).toBeVisible(); await expect(page.getByText(t.awaitingTitle, { exact: true })).toBeVisible();
    expect((await paymentStatus(context.request, fixture.order.value.id)).checkoutState).toBe('NONE'); expect(paymentCount(fixture.order.value.id, 'operations')).toBe(0); expect(paymentCount(fixture.order.value.id, 'grants')).toBe(0);
    await capturePayment(page, 'fr-390-forged-success-without-payment');
    const other = await browser.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
    try {
      const b = await methodLearner(other.request); await loginMethodAccount(other.request, b);
      expect((await other.request.get(`/api/v1/me/orders/${fixture.order.value.id}/payment-status`)).status()).toBe(404);
      const denied = await other.request.post(`/api/v1/me/orders/${fixture.order.value.id}/checkout`, { headers: { ...await commerceHeaders(other.request, b.id, fixture.order.etag), 'Idempotency-Key': randomUUID() }, data: { acceptedTermsVersion: fixture.order.value.acceptedTermsVersion } }); expect(denied.status()).toBe(404);
      const foreign = await other.newPage(); await foreign.goto(orderStatusPath('fr', fixture.order.value.id, 'success')); await expect(foreign.getByText(c.orderUnavailable, { exact: true })).toBeVisible(); await expect(foreign.locator('[data-order-payment-status]')).toHaveCount(0); await capturePayment(foreign, 'fr-390-other-owner-payment-refused');
      await verifyPaymentContent(other.request, sources, 'fr', false);
    } finally { await other.close(); }
    expect(paymentCount(fixture.order.value.id, 'operations')).toBe(0);
  });

  test('05 · échec et expiration confirmés restent sans droit ni reprise payante implicite', async ({ page, context }) => {
    await worker();
    for (const terminal of [{ locale: 'fr', state: 'FAILED', type: 'checkout.session.async_payment_failed' }, { locale: 'en', state: 'EXPIRED', type: 'checkout.session.expired' }] as const) {
      const fixture = await preparePaymentFixture(context.request, editor, sources, terminal.locale), t = getPaymentDictionary(terminal.locale);
      await createPaymentCheckout(context.request, fixture); await advancePayment(fixture.order.value.id, terminal.state, terminal.type); await waitForPayment(context.request, fixture.order.value.id, terminal.state, 'NOT_STARTED');
      const status = await paymentStatus(context.request, fixture.order.value.id); expect(status.checkoutAvailable).toBe(false); expect(status.canRetry).toBe(false);
      expect(paymentCount(fixture.order.value.id, 'grants')).toBe(0); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(0); expect(paymentCount(fixture.order.value.id, 'operations')).toBe(1);
      await page.goto(orderStatusPath(terminal.locale, fixture.order.value.id, 'cancel')); await expect(page.getByText(t.returnCancel, { exact: true })).toBeVisible(); await expect(page.getByRole('status').getByText(t.failedTitle, { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: t.openCheckout, exact: true })).toHaveCount(0);
      await expect(page.getByText(`${getCommerceDictionary(terminal.locale).orderReference} : ${fixture.order.value.id}`, { exact: true })).toBeVisible();
      await expect(page.getByText(t.sessionExpires, { exact: false })).toHaveCount(0);
      await capturePayment(page, `${terminal.locale}-390-confirmed-${terminal.state.toLowerCase()}`);
      expect(commerceSql(`SELECT active_intention_key IS NULL FROM orders WHERE id='${checkedUuid(fixture.order.value.id)}';`)).toBe('t');
    }
  });

  test('06 · panne SMTP : accès activé et incident email indépendant', async ({ page, context }) => {
    await worker(); const t = getPaymentDictionary('fr'), fixture = await preparePaymentFixture(context.request, editor, sources);
    await createPaymentCheckout(context.request, fixture);
    await expect.poll(() => commerceSql(`SELECT status FROM notification_outbox WHERE business_key='identity:registered:${checkedUuid(fixture.owner.id)}';`), { timeout: 20_000 }).toBe('SENT');
    await controlApi('pause-mailpit');
    try {
      await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.completed'); await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'READY');
      await expect.poll(async () => (await paymentStatus(context.request, fixture.order.value.id)).notificationStatus, { timeout: 20_000, intervals: [250, 500, 1000] }).toBe('ISSUE');
      await verifyPaymentContent(context.request, sources, 'fr', true);
      await page.goto(orderStatusPath('fr', fixture.order.value.id)); await expect(page.getByText(t.readyTitle, { exact: true })).toBeVisible(); await expect(page.getByText(t.notificationIssue, { exact: true })).toBeVisible(); await capturePayment(page, 'fr-390-email-incident-access-still-ready');
      expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
    } finally { await controlApi('resume-mailpit'); }
    expect((await paymentStatus(context.request, fixture.order.value.id)).fulfillmentStatus).toBe('READY');
    const role = randomUUID();
    expect(commerceSql(`BEGIN; INSERT INTO roles(id,code) VALUES('${role}','P12_MAIL_${role.replaceAll('-', '').toUpperCase()}'); INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('notifications.read','notifications.manage'); INSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${checkedUuid(sources.actor)}','${role}'); COMMIT; SELECT count(*) FROM role_permissions WHERE role_id='${role}';`)).toBe('2');
    const notification = checkedUuid(commerceSql(`SELECT id FROM notification_outbox WHERE business_key='access:activated:${checkedUuid(fixture.order.value.id)}';`));
    const retried = await editor.post(`/api/v1/admin/notifications/${notification}/retry`, { headers: await commerceHeaders(editor, sources.actor), data: { reason: 'MANUAL_RECONCILIATION', ackDuplicate: true } }); expect(retried.status()).toBe(200);
    await expect.poll(async () => (await paymentStatus(context.request, fixture.order.value.id)).notificationStatus, { timeout: 20_000 }).toBe('SENT');
    await page.getByRole('button', { name: t.refresh, exact: true }).click(); await expect(page.getByText(t.notificationSent, { exact: true })).toBeVisible();
    await capturePayment(page, 'fr-390-email-retried-access-unchanged');
    expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
  });

  test('07 · panne de l’API et reprise conservent commande, droit et suivi', async ({ page, context }) => {
    await worker(); const t = getPaymentDictionary('en'), c = getCommerceDictionary('en'), fixture = await preparePaymentFixture(context.request, editor, sources, 'en');
    await createPaymentCheckout(context.request, fixture); await advancePayment(fixture.order.value.id, 'PAID', 'checkout.session.completed'); await waitForPayment(context.request, fixture.order.value.id, 'PAID', 'READY');
    await page.goto(orderStatusPath('en', fixture.order.value.id)); await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible();
    await controlApi('stop-api');
    try { await page.getByRole('button', { name: t.refresh, exact: true }).click(); await expect(page.getByText(c.unavailable, { exact: true })).toBeVisible(); await expect(page.getByText(c.orderUnavailable, { exact: true })).toHaveCount(0); await capturePayment(page, 'en-390-payment-api-unavailable'); }
    finally { await controlApi('start-api'); }
    const healthy = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/me/orders/${fixture.order.value.id}/payment-status` && response.status() === 200);
    await page.getByRole('button', { name: t.refresh, exact: true }).click(); await healthy; await expect(page.getByText(c.unavailable, { exact: true })).toHaveCount(0); await expect(page.locator('[data-order-payment-status="ready"]')).toBeVisible();
    await capturePayment(page, 'en-390-payment-api-recovered'); await verifyPaymentContent(context.request, sources, 'en', true);
    expect(paymentCount(fixture.order.value.id, 'operations')).toBe(1); expect(paymentCount(fixture.order.value.id, 'grants')).toBe(1); expect(paymentCount(fixture.order.value.id, 'notifications')).toBe(1);
    await page.goto(offersPath('en', fixture.offer.value.id)); await expect(page.getByText(getCommerceDictionary('en').alreadyAccessible, { exact: true })).toBeVisible();
    await expect(page.getByText(t.orderStates.CONFIRMED, { exact: true })).toBeVisible();
    await expect(page.getByText(t.operationPending, { exact: true })).toHaveCount(0);
    await capturePayment(page, 'en-390-owned-offer-after-payment');
  });

  test('08 · offre modifiée : consentement à revoir, aucun Checkout créé', async ({ page, context }) => {
    const t = getPaymentDictionary('fr'), fixture = await preparePaymentFixture(context.request, editor, sources);
    await page.goto(ordersPath('fr', fixture.order.value.id));
    await expect(page.getByRole('button', { name: t.openCheckout, exact: true })).toBeEnabled();
    await page.getByRole('checkbox', { name: t.terms, exact: true }).check();
    await capturePayment(page, 'fr-390-checkout-consent');
    const save = await editor.patch(`/api/v1/admin/offers/${fixture.offer.value.id}`, { headers: await commerceHeaders(editor, sources.actor, fixture.offer.etag), data: { fields: { ...fixture.offer.value.fields, price: { amountMinor: 1499, currency: 'EUR' } }, reason: 'Explicit isolated price change, not a commercial offer' } });
    expect(save.status()).toBe(200);
    const activate = await editor.post(`/api/v1/admin/offers/${fixture.offer.value.id}/activate`, { headers: await commerceHeaders(editor, sources.actor, save.headers().etag), data: { reason: 'Explicit isolated reactivation for checkout conflict' } }); expect(activate.status()).toBe(200);
    const rejected = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/me/orders/${fixture.order.value.id}/checkout`);
    await page.getByRole('button', { name: t.openCheckout, exact: true }).click(); expect((await rejected).status()).toBe(409);
    await expect(page.getByText(t.orderChanged, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: t.terms, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t.openCheckout, exact: true })).toHaveCount(0);
    expect(paymentCount(fixture.order.value.id, 'operations')).toBe(0);
    await capturePayment(page, 'fr-390-checkout-offer-change-review');
    const en = await preparePaymentFixture(context.request, editor, sources, 'en'), english = getPaymentDictionary('en');
    await page.goto(ordersPath('en', en.order.value.id)); await expect(page.getByRole('button', { name: english.openCheckout, exact: true })).toBeEnabled();
    await capturePayment(page, 'en-320-checkout-consent', 320);
    expect(paymentCount(en.order.value.id, 'operations')).toBe(0);
  });
});
