import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { getGalleryCopy } from '../../apps/web/src/lib/i18n/gallery';
import { getShowcaseDictionary } from '../../apps/web/src/lib/i18n/showcase';
import { domainDictionary } from '../../apps/web/src/lib/i18n/domain';

async function capture(page: Page, name: string) {
  const directory = process.env.COURSES_BROWSER_EVIDENCE;
  if (!directory || !/^[a-z0-9-]+$/.test(name)) throw new Error('Destination de capture invalide.');
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
  });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true, animations: 'disabled' });
}

for (const locale of ['fr', 'en'] as const) {
  for (const width of [1440, 1024, 768, 390, 320]) {
    test(`${locale} ${width}px : quatre espaces, reflow et captures`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['public', 'learning', 'admin', 'components']) {
        const response = await page.goto(`/${locale}/dev/${route}`);
        expect(response?.status()).toBe(200);
        expect(response?.headers()['x-robots-tag']).toContain('noindex');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // The table alone may scroll horizontally; text and work areas must reflow.
        const overflowingText = await page.locator('main p, main h1, main h2, main h3, main label').evaluateAll((elements) => elements.filter((element) => {
          if (!element.getClientRects().length || element.closest('table')) return false;
          return element.scrollWidth > element.clientWidth + 2;
        }).map((element) => element.textContent?.slice(0, 70)));
        expect(overflowingText).toEqual([]);
        const smallControls = await page.locator('main button, main input, main textarea, main select').evaluateAll((elements) => elements.filter((element) => {
          if (!element.getClientRects().length || element.getAttribute('type') === 'hidden') return false;
          const label = element.closest('label');
          const box = (label ?? element).getBoundingClientRect();
          return box.width < 43.9 || box.height < 43.9;
        }).map((element) => ({ tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent?.slice(0, 50) })));
        expect(smallControls).toEqual([]);
        await capture(page, `${locale}-${width}-${route}`);
      }
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} : formulaire, focus, dialogue, panneau et confirmation`, async ({ page }) => {
    const c = getGalleryCopy(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${locale}/dev/components`);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    const name = page.locator('#example-name');
    await name.fill('Méthode / method — ' + 'texte long '.repeat(16));
    await page.getByRole('button', { name: c.submit, exact: true }).click();
    await expect(page.locator('#example-goal')).toBeFocused();
    await expect(name).toHaveValue(/texte long/);
    await expect(page.locator('#example-goal')).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-form-error.png`), fullPage: false });
    await page.locator('#example-goal').fill(c.longText);
    await page.getByRole('checkbox', { name: c.consent }).check();
    await page.getByRole('button', { name: c.submit, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: c.nothingSent })).toBeVisible();
    await expect(page.getByRole('button', { name: c.disabled, exact: true })).toBeDisabled();
    const busy = page.getByRole('button', { name: c.busyLabel, exact: true });
    await expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(await busy.locator('svg').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');

    for (const trigger of [c.dialog, c.sheet]) {
      const button = page.getByRole('button', { name: trigger, exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-${trigger === c.dialog ? 'dialog' : 'sheet'}.png`), fullPage: false });
      for (let index = 0; index < 4; index++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
      expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle !== 'none' || getComputedStyle(element).boxShadow !== 'none')).toBe(true);
    }
    const confirm = page.getByRole('button', { name: c.confirm, exact: true });
    await confirm.click();
    await page.getByRole('button', { name: c.cancel, exact: true }).click();
    await expect(name).toHaveValue(/texte long/);
    await confirm.click();
    await page.getByRole('button', { name: c.confirmAction, exact: true }).click();
    await expect(name).toHaveValue('');
    await expect(confirm).toBeFocused();
    await page.getByRole('tab', { name: c.tabs[0], exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: c.tabs[1], exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: c.faqTitle, exact: true }).click();
    await expect(page.getByText(c.faqBody, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: c.toastAction, exact: true }).click();
    await expect(page.getByText(c.toastBody, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: c.dismiss, exact: true }).click();
    await expect(page.getByText(c.toastBody, { exact: true })).toBeHidden();
    await capture(page, `${locale}-gallery-interactions`);
  });

  test(`${locale} : navigation mobile et saisie conservée entre étapes`, async ({ page }) => {
    const c = getShowcaseDictionary(locale);
    const domain = domainDictionary(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/dev/learning`);
    const menu = page.getByRole('button', { name: c.common.openMenu, exact: true });
    await menu.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-mobile-navigation.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    const reference = page.getByRole('button', { name: c.learning.reference, exact: true });
    await reference.click();
    await expect(page.getByRole('dialog', { name: c.learning.reference, exact: true })).toBeVisible();
    await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-mobile-reference.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(reference).toBeFocused();
    await page.getByRole('tab', { name: c.learning.write, exact: true }).click();
    const draft = page.getByRole('textbox', { name: c.learning.draftLabel, exact: true });
    await draft.fill(c.learning.goalBody.repeat(4));
    await page.getByRole('tab', { name: c.learning.check, exact: true }).click();
    await page.getByRole('checkbox').first().check();
    await expect(page.getByText(domain.rubric.declared, { exact: false }).first()).toBeVisible();
    await page.getByRole('tab', { name: c.learning.write, exact: true }).click();
    await expect(draft).toHaveValue(c.learning.goalBody.repeat(4));
    await page.getByRole('button', { name: c.learning.reset, exact: true }).click();
    await page.getByRole('button', { name: c.learning.cancel, exact: true }).click();
    await expect(draft).toHaveValue(c.learning.goalBody.repeat(4));
    await page.getByRole('button', { name: c.learning.reset, exact: true }).click();
    await page.getByRole('button', { name: c.learning.resetConfirm, exact: true }).click();
    await expect(draft).toHaveValue('');
    const generate = page.getByRole('button', { name: domain.method.generate, exact: true });
    await page.getByRole('textbox', { name: domain.method.labels.objective, exact: false }).fill('');
    await generate.click();
    await expect(page.getByRole('textbox', { name: domain.method.labels.objective, exact: false })).toBeFocused();
    await page.getByRole('textbox', { name: domain.method.labels.objective, exact: false }).fill(c.learning.goalBody);
    await generate.click();
    expect(await page.getByRole('textbox', { name: domain.method.output, exact: true }).inputValue()).toContain(domain.method.verify);
    await expect(page.getByText(domain.method.generated, { exact: true })).toBeVisible();
    await capture(page, `${locale}-workshop-written`);

    await page.goto(`/${locale}/dev/admin`);
    await page.getByRole('searchbox', { name: c.admin.search, exact: true }).fill('no-match-xxxxxxxx');
    await expect(page.getByRole('table')).toBeHidden();
    await page.getByRole('searchbox', { name: c.admin.search, exact: true }).fill('');
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button', { name: c.admin.view, exact: false }).first().click();
    await expect(page.getByRole('heading', { name: c.admin.detailTitle, exact: true })).toBeFocused();
    await expect(page.locator('#content-detail')).toBeInViewport();
  });
}
