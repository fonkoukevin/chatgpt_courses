import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Request, Response } from '@playwright/test';
import { getVideoDictionary } from '../../apps/web/src/lib/i18n/video';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import type { BilingualFixture } from './bilingual-fixture';

/** Observe original requests only: no retry, extra metadata request, cookie, URL or response body is exported. */
export function observeBilingualMedia(page: Page, fixture: BilingualFixture) {
  const started = performance.now(), events: Record<string, unknown>[] = [], tasks: Promise<void>[] = [];
  const counts = { started: 0, responded: 0, failed: 0 }, requests = new Map<Request, number>();
  let publicContext: unknown = null;
  function route(request: Request) {
    if (request.method() !== 'GET') return null;
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/me') return { kind: 'ACCOUNT' as const };
    const locale = (['fr', 'en'] as const).find(value => url.pathname === `/api/v1/media/${fixture.mediaIds[value]}`);
    return locale ? { kind: 'VIDEO_METADATA' as const, locale, contextMatches: url.searchParams.get('resourceId') === fixture.activity.fr.value.resourceId
      && url.searchParams.get('versionId') === fixture.activity.fr.value.versionId && url.searchParams.get('locale') === locale,
      enrollmentPresent: url.searchParams.has('enrollmentId') } : null;
  }
  function record(event: Record<string, unknown>) {
    const entry = { elapsedMs: Math.round(performance.now() - started), ...event };
    if (events.length < 100) events.push(entry); return entry as Record<string, unknown>;
  }
  const onRequest = (request: Request) => {
    const target = route(request); if (!target) return;
    const requestNumber = ++counts.started; requests.set(request, requestNumber); record({ event: 'REQUEST', requestNumber, ...target });
  };
  const onResponse = (response: Response) => {
    const request = response.request(), target = route(request); if (!target) return;
    counts.responded++; const data = record({ event: 'RESPONSE', requestNumber: requests.get(request), ...target, status: response.status() });
    tasks.push((async () => {
      try {
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object') { data.jsonObject = false; return; }
        const value = body as Record<string, unknown>;
        data.jsonObject = true;
        if (!response.ok()) data.problemCode = typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code) ? value.code : 'UNAVAILABLE';
        else if (target.kind === 'ACCOUNT') data.authenticatedIdPresent = typeof value.id === 'string';
        else {
          data.identityMatches = value.mediaId === fixture.mediaIds[target.locale] || value.id === fixture.mediaIds[target.locale];
          data.localeMatches = value.locale === target.locale;
          data.playbackAvailable = value.playbackAvailable === true;
          data.durationFinitePositive = typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0;
          data.reason = value.unavailableReason === null ? null : typeof value.unavailableReason === 'string' && /^[A-Z_]{1,50}$/.test(value.unavailableReason) ? value.unavailableReason : 'UNAVAILABLE';
        }
      } catch { data.bodyUnavailable = true; }
    })());
  };
  const onFailed = (request: Request) => {
    const target = route(request); if (!target) return;
    counts.failed++; const failure = request.failure()?.errorText;
    record({ event: 'REQUEST_FAILED', requestNumber: requests.get(request), ...target,
      networkCode: failure && /^net::[A-Z_]+$/.test(failure) ? failure : 'UNAVAILABLE' });
  };
  page.on('request', onRequest); page.on('response', onResponse); page.on('requestfailed', onFailed);
  return {
    context(value: { availability: string; courseResourceId: string; courseVersionId: string; activityResourceId: string; activityVersionId: string }) {
      publicContext = { availability: value.availability, identitiesMatch: value.courseResourceId === fixture.missingParentCourse.fr.value.resourceId
        && value.courseVersionId === fixture.missingParentCourse.fr.value.versionId && value.activityResourceId === fixture.activity.fr.value.resourceId
        && value.activityVersionId === fixture.activity.fr.value.versionId };
    },
    async save(outcome: 'PASSED' | 'FAILED') {
      await Promise.race([Promise.allSettled(tasks), new Promise(resolve => setTimeout(resolve, 1000))]);
      const ui = [];
      for (const locale of ['fr', 'en'] as const) {
        const panel = page.locator(`[data-video-player="${fixture.mediaIds[locale]}"]`);
        ui.push({ locale, panelCount: await panel.count(), loadingCount: await panel.getByText(getVideoDictionary(locale).loadingVideo, { exact: true }).count(),
          visibleLoadingCount: await panel.getByText(getVideoDictionary(locale).loadingVideo, { exact: true }).filter({ visible: true }).count(),
          loadButtonCount: await panel.getByRole('button', { name: getVideoDictionary(locale).loadVideo, exact: true }).count(),
          nativeVideoCount: await panel.locator('video').count(), privateWorkspaceLoading: await page.getByText(getLearningDictionary(locale).privateLoading, { exact: true }).count() });
      }
      writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, 'case03-media-diagnostic.json'), JSON.stringify({ capturedAt: new Date().toISOString(),
        outcome, scope: 'Original synthetic fixture requests and completion DOM only; no extra authorization/metadata call', counters: counts,
        pendingOriginalRequests: counts.started - counts.responded - counts.failed, truncated: counts.started > 100, publicContext,
        htmlLanguage: await page.locator('html').getAttribute('lang'), ui, events, secretsPrinted: false, bodiesExported: false,
        signedOrBearerUrlsExported: false }, null, 2) + '\n');
    },
    stop() { page.off('request', onRequest); page.off('response', onResponse); page.off('requestfailed', onFailed); },
  };
}
