import type { Page, TestInfo } from '@playwright/test';

/** No original error/cause/stack reaches Playwright's artifact recorder. Failure status is unchanged. */
export function externalFailure(code: string): Error {
  const error = new Error(/^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : 'EXTERNAL_TEST_NOT_VALIDATED');
  error.stack = undefined;
  return error;
}
export async function closeExternalPage(page: Page) { try { if (!page.isClosed()) await page.close({ runBeforeUnload: false }); } catch { /* no raw cleanup error */ } }
/** Runs before context teardown/artifact persistence, including action or test timeouts. */
export async function protectExternalArtifacts(page: Page, info: TestInfo) {
  await closeExternalPage(page);
  for (const error of info.errors) {
    const value = error as unknown as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) Reflect.deleteProperty(value, key);
    value.message = 'EXTERNAL_STRIPE_TEST_NOT_VALIDATED';
  }
}
