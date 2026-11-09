import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, cpus, freemem, platform, release, totalmem } from 'node:os';
import { expect, type Browser, type CDPSession, type Locator, type Page } from '@playwright/test';

export const qualityWidths = [1440, 1024, 768, 390, 320] as const;
export type QualityLocale = 'fr' | 'en';
export type QualityPageKind = 'catalogue' | 'workshop';
type ObservedPerformance = { largestContentfulPaintMs: number | null; layoutShift: number; longTasks: number[] };
declare global { interface Window { __coursesQualityPerformance?: ObservedPerformance } }

export async function observeColdPage(page: Page): Promise<{ session: CDPSession; transport: () => Record<string, unknown> }> {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.clearBrowserCache');
  await session.send('Network.setBypassServiceWorker', { bypass: true });
  await session.send('Performance.enable');
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const statusCounts: Record<string, number> = {}, typeCounts: Record<string, number> = {};
  let transferredBytes = 0, cacheResponses = 0, failedRequests = 0;
  session.on('Network.responseReceived', ({ type, response }) => {
    const family = `${Math.floor(response.status / 100)}xx`;
    statusCounts[family] = (statusCounts[family] ?? 0) + 1;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (response.fromDiskCache || response.fromServiceWorker) cacheResponses++;
  });
  session.on('Network.loadingFinished', ({ encodedDataLength }) => { transferredBytes += encodedDataLength; });
  session.on('Network.loadingFailed', () => { failedRequests++; });
  await page.addInitScript(() => {
    const result: ObservedPerformance = { largestContentfulPaintMs: null, layoutShift: 0, longTasks: [] };
    window.__coursesQualityPerformance = result;
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint') result.largestContentfulPaintMs = entry.startTime;
          else if (type === 'layout-shift') {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) result.layoutShift += shift.value;
          } else if (type === 'longtask') result.longTasks.push(entry.duration);
        }
      });
      observer.observe({ type, buffered: true });
    }
  });
  return { session, transport: () => ({ transferredBytes, cacheResponses, failedRequests, statusCounts, typeCounts }) };
}

export async function settleRenderedPage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export async function measuredPage(page: Page, observation: Awaited<ReturnType<typeof observeColdPage>>, readyMs: number) {
  await settleRenderedPage(page);
  const browser = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const groups: Record<string, { count: number; transferBytes: number; encodedBytes: number; decodedBytes: number; totalDurationMs: number }> = {};
    for (const entry of resources) {
      const pathname = new URL(entry.name).pathname;
      const group = /\.m?js$/.test(pathname) ? 'javascript' : /\.css$/.test(pathname) ? 'stylesheet' : /\.(woff2?|ttf|otf)$/.test(pathname) ? 'font'
        : entry.initiatorType === 'img' ? 'image' : ['fetch', 'xmlhttprequest'].includes(entry.initiatorType) ? 'data' : 'other';
      const current = groups[group] ??= { count: 0, transferBytes: 0, encodedBytes: 0, decodedBytes: 0, totalDurationMs: 0 };
      current.count++; current.transferBytes += entry.transferSize; current.encodedBytes += entry.encodedBodySize; current.decodedBytes += entry.decodedBodySize; current.totalDurationMs += entry.duration;
    }
    const observed = window.__coursesQualityPerformance;
    return {
      navigation: { ttfbMs: navigation.responseStart - navigation.startTime, domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd, responseEndMs: navigation.responseEnd, transferBytes: navigation.transferSize,
        encodedBytes: navigation.encodedBodySize, decodedBytes: navigation.decodedBodySize },
      paints: Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])),
      largestContentfulPaintAtReadinessMs: observed?.largestContentfulPaintMs ?? null,
      layoutShiftAtReadiness: observed?.layoutShift ?? null,
      longTasks: observed ? { count: observed.longTasks.length, totalMs: observed.longTasks.reduce((a, b) => a + b, 0), maxMs: Math.max(0, ...observed.longTasks) } : null,
      resources: groups, totalResources: resources.length, externalResourceCount: resources.filter((entry) => new URL(entry.name).origin !== location.origin).length,
      fontStatus: document.fonts.status,
      domElements: document.querySelectorAll('*').length,
    };
  });
  const metrics = await observation.session.send('Performance.getMetrics');
  const allowed = new Set(['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']);
  return { readyMs, ...browser, cdp: Object.fromEntries(metrics.metrics.filter((item) => allowed.has(item.name)).map((item) => [item.name, item.value])), transport: observation.transport() };
}

type PerformanceSample = Awaited<ReturnType<typeof measuredPage>>;
type BudgetMetric = 'javascriptEncodedBytes' | 'javascriptDecodedBytes' | 'stylesheetDecodedBytes' | 'readyMedianMs' | 'readyMaxMs' | 'largestContentfulPaintSnapshotMaxMs' | 'layoutShiftSnapshotMax';

export async function evaluatePerformanceBudgets(samples: PerformanceSample[]) {
  const file = 'docs/performance-budgets.json';
  const budget = JSON.parse(await readFile(file, 'utf8')) as { version: number; sourceBaselineRun: string; limits: Record<BudgetMetric, number> };
  if (samples.length !== 3 || samples.some((sample) => !sample.resources.javascript || !sample.resources.stylesheet
    || sample.largestContentfulPaintAtReadinessMs === null || sample.layoutShiftAtReadiness === null)) {
    throw new Error('Three complete cold-browser measurements, including JavaScript/CSS and paint observers, are required.');
  }
  const ready = samples.map((sample) => sample.readyMs).sort((a, b) => a - b);
  const observed: Record<BudgetMetric, number> = {
    javascriptEncodedBytes: Math.max(...samples.map((sample) => sample.resources.javascript.encodedBytes)),
    javascriptDecodedBytes: Math.max(...samples.map((sample) => sample.resources.javascript.decodedBytes)),
    stylesheetDecodedBytes: Math.max(...samples.map((sample) => sample.resources.stylesheet.decodedBytes)),
    readyMedianMs: ready[1], readyMaxMs: ready[2],
    largestContentfulPaintSnapshotMaxMs: Math.max(...samples.map((sample) => sample.largestContentfulPaintAtReadinessMs!)),
    layoutShiftSnapshotMax: Math.max(...samples.map((sample) => sample.layoutShiftAtReadiness!)),
  };
  const checks = (Object.keys(observed) as BudgetMetric[]).map((metric) => ({ metric, observed: observed[metric], limit: budget.limits[metric],
    passed: Number.isFinite(observed[metric]) && Number.isFinite(budget.limits[metric]) && budget.limits[metric] > 0 && observed[metric] <= budget.limits[metric] }));
  return { file, version: budget.version, sourceBaselineRun: budget.sourceBaselineRun, status: checks.every((check) => check.passed) ? 'passed' : 'failed', checks,
    policy: 'Fixed limits selected after the preserved baseline; investigate a different machine/profile, never auto-increase or retry away a failure.' };
}

export function assertPerformanceBudgets(evaluation: Awaited<ReturnType<typeof evaluatePerformanceBudgets>>) {
  for (const check of evaluation.checks) expect(check.passed,
    `${check.metric}: observed ${check.observed}, fixed limit ${check.limit}. Investigate the profile; do not auto-increase the limit or retry to hide a failure.`).toBe(true);
}

export async function assertPageStructure(page: Page) {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const missing = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type="hidden"]),textarea,select')]
    .filter((node) => node.getClientRects().length > 0)
    // Radix form proxies keep a rectangle but are explicitly aria-hidden.
    // Opacity alone never excludes an otherwise exposed, unnamed control.
    .filter((node) => !node.closest('[aria-hidden="true"],[inert],[hidden]') && !['hidden', 'collapse'].includes(getComputedStyle(node).visibility))
    .filter((node) => !node.labels?.length && !node.getAttribute('aria-label')?.trim() && !node.getAttribute('aria-labelledby')?.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim()))
    .map((node) => ({ tag: node.tagName, type: node.getAttribute('type') })));
  expect(missing, 'Visible form controls have a persistent associated name; no field contents are reported').toEqual([]);
  for (const role of ['checkbox', 'radio', 'radiogroup'] as const) {
    for (const control of await page.getByRole(role).all()) await expect(control).toHaveAccessibleName(/\S/);
  }
}

export async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(dimensions.document, 'The page must reflow without horizontal document scrolling').toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, 'The body must fit the viewport').toBeLessThanOrEqual(dimensions.viewport);
  return dimensions;
}

export async function captureQuality(page: Page, name: string, fullPage = true) {
  if (fullPage) {
    await page.getByRole('main').focus();
    await page.evaluate(() => scrollTo(0, 0));
  }
  await settleRenderedPage(page);
  expect(await page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage, animations: 'disabled' });
}

/** Browser reflow experiment: double the root font, then prove actual control text grew twofold.
 * It is recorded as root-font scaling, not native browser zoom or a full WCAG audit. */
export async function enlargeText200(page: Page, control: Locator) {
  const before = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = `${Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
  await settleRenderedPage(page);
  const after = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(after / before, 'The measured form control text really doubles in this resize experiment').toBeCloseTo(2, 1);
  return { mechanism: 'root-font-size-doubled', beforePx: before, afterPx: after, ratio: after / before };
}

export async function expectVisibleFocus(control: Locator) {
  await expect(control).toBeFocused();
  expect(await control.evaluate((node) => { const style = getComputedStyle(node); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; }), 'Keyboard focus has a visible outline or ring').toBe(true);
}

export async function checkDialogKeyboard(page: Page, trigger: Locator, title: string) {
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true }); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab'); expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expectVisibleFocus(trigger);
}

export async function writePerformanceEvidence(browser: Browser, locale: QualityLocale, kind: QualityPageKind, value: Record<string, unknown>) {
  const directory = process.env.COURSES_BROWSER_EVIDENCE!;
  await mkdir(directory, { recursive: true });
  const processor = cpus();
  await writeFile(join(directory, `${locale}-${kind}-performance.json`), JSON.stringify({
    phase: 'P17', locale, page: kind, measuredAt: new Date().toISOString(),
    environment: { platform: platform(), release: release(), architecture: arch(), cpuModel: processor[0]?.model, logicalProcessors: processor.length,
      totalMemoryBytes: totalmem(), freeMemoryBytesAtReport: freemem(), browserVersion: browser.version(), nodeVersion: process.version },
    protocol: { network: 'unthrottled HTTP loopback', cpuRate: 1, viewport: { width: 1440, height: 1000 }, coldBrowserNavigations: 3,
      browserCacheDisabled: true, browserCacheClearedBeforeEachNavigation: true, serviceWorkersBypassed: true,
      serverCache: 'Running API and Next production server; fixture preparation warms the backend. This is not a cold machine/server benchmark.',
      boundaries: 'Page readiness is the observed ready UI, not networkidle. LCP is a snapshot at readiness; interaction durations are local laboratory actions, not field INP. CDP heap sizes are bytes; ScriptDuration/LayoutDuration/RecalcStyleDuration/TaskDuration are seconds.',
      privacy: 'No URLs, query strings, headers, identities, cookies, form contents or response bodies are written to this measurement.' },
    ...value,
  }, null, 2) + '\n', 'utf8');
}
