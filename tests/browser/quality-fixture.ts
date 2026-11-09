import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { ProjectFixture } from './projects-fixture';
import { createProjectFixture, createPersonalProject, projectFields } from './projects-fixture';
import { methodLearner, loginMethodAccount } from './methods-fixture';

let published: Promise<ProjectFixture> | undefined;

/** One real published P09 dataset per worker, shared by quality and performance; no private learner is shared. */
export function qualitySources(request: APIRequestContext): Promise<ProjectFixture> {
  return published ??= createProjectFixture(request);
}

export async function qualityLearner(request: APIRequestContext, locale: 'fr' | 'en' = 'fr') {
  const sources = await qualitySources(request), account = await methodLearner(request, locale);
  await loginMethodAccount(request, account);
  const source = sources.BR01[locale], marker = `P17-${locale}-${randomUUID()}`, fields = projectFields(locale, marker);
  if (locale === 'en') Object.assign(fields, {
    objective: 'Prepare a factual proposal from the fictional brief.', scope: 'Four French website pages; clarify logo work and integration.',
    method: 'Separate provided facts, missing information and choices.', timeline: 'Confirm materials and brief before proposing a start.',
    budget: '180 + 320 + 360 + 220 + 120 = 1,200 EUR excluding tax in this fictional case.',
    clarifications: 'Confirm source materials, validation and scope.', nextStep: 'Ask the client to confirm the open points.',
    externalText: `${marker} · independent personal draft`,
  });
  const project = await createPersonalProject(request, account.id, source, fields, 'DRAFT');
  return { sources, source, account, project, marker };
}
export type QualityLearner = Awaited<ReturnType<typeof qualityLearner>>;

export async function qualityCapture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.COURSES_BROWSER_EVIDENCE!, `${name}.png`), fullPage: true, animations: 'disabled' });
}

export async function privateTextNotStored(page: Page, marker: string) {
  expect(await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(entry => !entry.includes(value)), marker)).toBe(true);
}
