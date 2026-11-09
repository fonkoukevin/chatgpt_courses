import { type Page, type Locator, type Frame } from '@playwright/test';
import { closeExternalPage, externalFailure } from './stripe-privacy';

export async function fillHostedTestCard(page: Page, stage: (value: string) => void, diagnostics: (value: unknown) => void, email = 'p12-checkout-test@example.com') {
  try { await fillHostedFields(page, stage, diagnostics, email); }
  catch { await closeExternalPage(page); throw externalFailure('HOSTED_TEST_FORM_NOT_COMPLETED'); }
}
async function fillHostedFields(page: Page, stage: (value: string) => void, diagnostics: (value: unknown) => void, email: string) {
  // Only the provider's hosted TEST form receives the official fictitious card.
  if (new URL(page.url()).origin !== 'https://checkout.stripe.com') throw new Error('Hosted TEST origin required.');
  stage('hosted-email');
  if (!['p12-checkout-test@example.com', 'p19-checkout-test@example.com'].includes(email)) throw new Error('Synthetic receipt address required.');
  await (await hostedField(page, frame => frame.getByRole('textbox', { name: /e-?mail/i }))).fill(email);
  stage('hosted-card-selection');
  let cardSelected = false;
  const steps: unknown[] = [];
  // Use normal keyboard focus from the email field. No force click or injected
  // DOM event can bypass a provider overlay or human verification challenge.
  for (let attempt = 0; attempt < 16 && !cardSelected; attempt++) {
    await page.keyboard.press('Tab');
    steps.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role') ?? null, type: document.activeElement?.getAttribute('type') ?? null })));
    diagnostics(steps);
    for (const frame of page.frames()) {
      const candidates = frame.getByRole('radio', { name: /carte|card/i }).or(frame.getByRole('button', { name: /payer par carte|pay (?:with|by) card|^carte(?:\s|$)|^card(?:\s|$)/i }));
      for (let index = 0; index < await candidates.count(); index++) {
        const candidate = candidates.nth(index);
        if (await candidate.evaluate(node => node === node.ownerDocument.activeElement)) {
          await page.keyboard.press('Space'); cardSelected = true; break;
        }
      }
      if (cardSelected) break;
    }
  }
  if (!cardSelected) {
    throw new Error('Hosted card payment option unavailable.');
  }
  const number = await hostedField(page, frame => frame.locator('input#cardNumber,input[name="cardNumber"],input[name="number"],input[autocomplete="cc-number"]').or(frame.getByRole('textbox', { name: /numéro de carte|card number/i })));
  // Never capture the hosted form, its field values, DOM snippets or bearer URL.
  stage('hosted-card-number');
  await number.fill('4242' + '4242' + '4242' + '4242');
  stage('hosted-card-expiry');
  await (await hostedField(page, frame => frame.locator('input#cardExpiry,input[name="cardExpiry"],input[name="expiry"],input[autocomplete="cc-exp"]'))).fill('12 / 34');
  stage('hosted-card-cvc');
  await (await hostedField(page, frame => frame.locator('input#cardCvc,input[name="cardCvc"],input[name="cvc"],input[autocomplete="cc-csc"]'))).fill('123');
  stage('hosted-billing-name');
  await (await hostedField(page, frame => frame.locator('input#billingName,input[name="billingName"],input[autocomplete="cc-name"]'))).fill('Recette Stripe TEST P12');
  for (const frame of page.frames()) {
    const country = frame.locator('select[name="billingCountry"]');
    if (await country.count() && await country.isVisible()) await country.selectOption('FR');
    const postal = frame.locator('input[name="billingPostalCode"]');
    if (await postal.count() && await postal.isVisible()) await postal.fill('75001');
  }
}

async function hostedField(page: Page, locate: (frame: Frame) => Locator): Promise<Locator> {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    for (const frame of page.frames()) {
      const candidates = locate(frame);
      for (let index = 0; index < await candidates.count(); index++) {
        const locator = candidates.nth(index);
        if (await locator.isVisible() && await locator.isEnabled() && await locator.evaluate(node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))) return locator;
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Hosted TEST field unavailable; no payment confirmation simulated.');
}
