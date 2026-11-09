import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Locator, type Page, type Request, type Response } from '@playwright/test';
import type { CreateOffer, OfferView, OrderView, ProjectView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { offersPath } from '../../apps/web/src/lib/commerce/routes';
import { isMemberResourceDetail } from '../../apps/web/src/lib/api/member-content-validation';
import { isLearningActivity, isVisitView } from '../../apps/web/src/lib/api/learning-validation';
import { commerceHeaders, commerceSql, checkedUuid, fixtureOfferFields } from './commerce-fixture';
import { prepareCourseFixture, publishCourseFixture, courseRecord, preparedActivity, sha256, type CourseFixture, type CourseLocale } from './course-content-fixture';
import { methodLearner, loginMethodAccount } from './methods-fixture';
import { projectRecord } from './projects-fixture';
import { openLesson } from './course-content-flow';

export type ScenarioId = 'P19-01' | 'P19-02' | 'P19-03' | 'P19-04';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const evidenceJson = (name: string, value: unknown) => writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
export async function pressEnabled(button: Locator) { await expect(button).toBeEnabled(); await button.press('Enter'); }

export async function prepareReleaseFixture(editor: APIRequestContext) {
  const course = await prepareCourseFixture(editor); await publishCourseFixture(editor, course);
  const role = randomUUID(), actor = checkedUuid(course.editor.id);
  expect(commerceSql(`BEGIN; INSERT INTO roles(id,code) VALUES('${role}','P19_OFFERS_${role.replaceAll('-', '').toUpperCase()}');
    INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('commerce.offers.read','commerce.offers.write','commerce.offers.activate');
    INSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}'); COMMIT;
    SELECT count(*) FROM role_permissions WHERE role_id='${role}';`)).toBe('3');
  const fields = fixtureOfferFields([courseRecord(course, 'course-client-proposal', 'fr')], 100);
  fields.copies = [{ locale: 'fr', title: 'P19 · offre fictive contrôlée', summary: 'Un euro fictif de recette isolée ; aucun tarif commercial.' },
    { locale: 'en', title: 'P19 · controlled fictional offer', summary: 'One fictional euro in isolated verification; no commercial price.' }];
  fields.conditions!.termsVersion = 'p19-controlled-v1';
  const command: CreateOffer = { code: `demo-p19-${randomUUID()}`, kind: 'COURSE', fields, reason: 'Explicit isolated P19 technical fixture, no commercial terms or human review' };
  const created = await editor.post('/api/v1/admin/offers', { headers: await commerceHeaders(editor, actor), data: command }); expect(created.status()).toBe(201);
  const draft = await created.json() as OfferView;
  const ready = await editor.get(`/api/v1/admin/offers/${draft.id}/readiness`); expect(ready.status()).toBe(200); expect((await ready.json() as { summaryReady: boolean }).summaryReady).toBe(true);
  const activated = await editor.post(`/api/v1/admin/offers/${draft.id}/activate`, { headers: await commerceHeaders(editor, actor, created.headers().etag), data: { reason: 'Explicit controlled transport test only, not an offer for sale' } });
  expect(activated.status()).toBe(200);
  return { course, actor, offer: { value: await activated.json() as OfferView, etag: activated.headers().etag } };
}
export type ReleaseFixture = Awaited<ReturnType<typeof prepareReleaseFixture>>;

export async function prepareReleaseOrder(page: Page, fixture: ReleaseFixture) {
  const request = page.context().request, owner = await methodLearner(request); await loginMethodAccount(request, owner);
  const t = getCommerceDictionary('fr'); await page.goto(offersPath('fr', fixture.offer.value.id));
  const prepare = page.getByRole('button', { name: t.prepare, exact: true }); await expect(prepare).toBeEnabled();
  await page.getByRole('checkbox', { name: t.acceptTerms, exact: true }).check();
  const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v1/me/orders');
  await prepare.press('Enter'); const created = await response; expect(created.status()).toBe(201); const value = await created.json() as OrderView;
  expect(value.snapshot.total).toEqual({ amountMinor: 100, currency: 'EUR' }); expect(value.snapshot.locales).toEqual(['fr', 'en']);
  expect(value.snapshot.resources).toHaveLength(1); expect(value.acceptedTermsVersion).toBe('p19-controlled-v1');
  expect(value.fulfillmentStatus).toBe('NOT_STARTED');
  return { owner, offer: fixture.offer, order: { value, etag: created.headers().etag, key: randomUUID() }, locale: 'fr' as const };
}
export type ReleasePayment = Awaited<ReturnType<typeof prepareReleaseOrder>>;

/** Safe facts only, captured synchronously if an unexpected refusal occurs. */
function paidDatabase(course: CourseFixture, ownerId: string, key: string, locale: CourseLocale) {
  const owner = checkedUuid(ownerId), target = checkedUuid(courseRecord(course, `activity-${key}`, locale).value.versionId);
  try { return JSON.parse(commerceSql(`WITH RECURSIVE paths(grant_id,version_id,depth) AS (
    SELECT id,version_id,0 FROM access_grants WHERE owner_id='${owner}'
    UNION ALL SELECT p.grant_id,c.child_version_id,p.depth+1 FROM paths p JOIN version_compositions c ON c.parent_version_id=p.version_id WHERE p.depth<2)
    SELECT jsonb_build_object('available',true,'accountActive',(SELECT status='ACTIVE' FROM user_accounts WHERE id='${owner}'),
      'manualTestGrants',(SELECT count(*) FROM access_grants WHERE owner_id='${owner}' AND origin_type='MANUAL_TEST'),
      'orderLineGrants',(SELECT count(*) FROM access_grants WHERE owner_id='${owner}' AND origin_type='ORDER_LINE'),
      'paths',coalesce((SELECT jsonb_agg(jsonb_build_object('depth',p.depth,'target',p.version_id='${target}',
        'localeIncluded',g.locales @> '["${locale}"]'::jsonb,'started',g.starts_at<=clock_timestamp(),
        'unexpired',g.expires_at IS NULL OR g.expires_at>clock_timestamp(),'unrevoked',g.revoked_at IS NULL,
        'published',t.published_revision_id IS NOT NULL,'editorialState',t.editorial_state,'sourceCurrent',t.source_translation_id IS NULL OR t.published_source_revision_id=s.current_revision_id))
        FROM paths p JOIN access_grants g ON g.id=p.grant_id LEFT JOIN content_translations t ON t.pedagogical_version_id=p.version_id AND t.locale='${locale}'
        LEFT JOIN content_translations s ON s.id=t.source_translation_id),'[]'::jsonb));`)) as unknown;
  } catch { return { available: false }; }
}
export async function recordReleaseFailure(request: APIRequestContext, course: CourseFixture, owner: string, scenarioId: ScenarioId) {
  let principal: unknown = { available: false };
  try { const response = await request.get('/api/v1/auth/me'), value: unknown = await response.json().catch(() => null); principal = { status: response.status(), expectedOwner: record(value) && value.id === owner, learningRead: record(value) && Array.isArray(value.permissions) && value.permissions.includes('learning.read') }; } catch { /* No transport details are exported. */ }
  evidenceJson(`${scenarioId}-failure-before-cleanup.json`, { scenarioId, recordedAfterTestBeforeCleanup: true, principal,
    database: paidDatabase(course, owner, 'm04', 'fr'), automaticRetry: false,
    privacy: 'Only statuses, contract flags and current isolated SQL facts; no URL, identity, cookie, provider payload, personal text or secret.' });
}
export async function openPaidCourseLesson(page: Page, course: CourseFixture, owner: string, key: string, locale: CourseLocale, requireLearning = true, navigate?: () => Promise<void>) {
  const target = courseRecord(course, `activity-${key}`, locale).value, expectedText = preparedActivity(course, key, locale).document.blocks[0].text;
  const observations: unknown[] = [], pending = new Set<Promise<void>>(), startedRequests = new WeakSet<Request>(); let failed = false, snapshot: unknown = null, memberSeen = false, learningSeen = false;
  const category = (error: unknown) => { const message = error instanceof Error ? error.message : ''; return /abort/i.test(message) ? 'ABORT' : /No resource|No data found for resource/i.test(message) ? 'NO_RESOURCE' : /Target.*closed|context.*closed|page.*closed/i.test(message) ? 'TARGET_CLOSED' : error ? 'OTHER' : 'NONE'; };
  const fail = () => { failed = true; snapshot ??= paidDatabase(course, owner, key, locale); };
  async function observe(response: Response, kind: 'member' | 'learning' | 'visit') {
    const requestStartedBeforeObservation = !startedRequests.has(response.request());
    if (response.status() !== 200) fail();
    let value: unknown = null, bodyReadError = 'NONE', jsonDecoded = false;
    try { const bytes = await response.body(); try { value = JSON.parse(bytes.toString('utf8')) as unknown; jsonDecoded = true; } catch { bodyReadError = 'INVALID_JSON'; } } catch (error) { bodyReadError = category(error); }
    let completion: unknown; try { completion = await response.finished(); } catch (error) { completion = error; }
    const failureText = response.request().failure()?.errorText ?? '';
    const requestFailure = /^net::(ERR_ABORTED|ERR_FAILED|ERR_NETWORK_CHANGED)$/.exec(failureText)?.[1] ?? (failureText ? 'OTHER' : 'NONE');
    const resource = record(value) && kind === 'learning' ? value.resource : value;
    const document = record(resource) && record(resource.document) ? resource.document : null;
    const valid = kind === 'member' ? isMemberResourceDetail(value) : kind === 'learning' ? isLearningActivity(value) : isVisitView(value);
    const identity = kind === 'visit' ? record(value) && value.activityId === target.resourceId && value.activityVersionId === target.versionId
      : record(resource) && resource.resourceId === target.resourceId && resource.versionId === target.versionId && resource.locale === locale;
    const bodyPresent = Boolean(document), expectedBlockPresent = Boolean(document && Array.isArray(document.blocks) && document.blocks.some(block => record(block) && block.text === expectedText));
    const active = kind !== 'learning' || record(value) && value.accessStatus === 'ACTIVE';
    if (!valid || !identity || !active || kind !== 'visit' && !expectedBlockPresent) fail();
    if (kind === 'member') memberSeen = true; if (kind === 'learning') learningSeen = true;
    if (observations.length >= 12) fail(); else observations.push({ kind, status: response.status(), requestStartedBeforeObservation, finished: !completion, completionError: category(completion), bodyReadError, jsonDecoded, requestFailure, valid, identity, active, bodyPresent, expectedBlockPresent,
      code: record(value) && typeof value.code === 'string' && /^[A-Z_]{1,64}$/.test(value.code) ? value.code : 'NONE' });
  }
  const listener = (response: Response) => {
    const url = new URL(response.url()), method = response.request().method();
    const kind = method === 'GET' && url.pathname === `/api/v1/me/resources/${target.resourceId}/versions/${target.versionId}` && url.searchParams.get('locale') === locale ? 'member'
      : method === 'GET' && url.pathname.endsWith(`/activities/${target.resourceId}`) && url.pathname.startsWith('/api/v1/me/enrollments/') && url.searchParams.get('activityVersionId') === target.versionId && url.searchParams.get('locale') === locale ? 'learning'
        : method === 'POST' && /^\/api\/v1\/me\/enrollments\/[a-f0-9-]{36}\/visits$/.test(url.pathname) ? 'visit' : null;
    if (!kind) return; const task = observe(response, kind).catch(fail); pending.add(task); void task.finally(() => pending.delete(task));
  };
  const requestListener = (request: Request) => { startedRequests.add(request); };
  page.on('request', requestListener); page.on('response', listener);
  try {
    if (navigate) {
      await navigate();
      const prepared = preparedActivity(course, key, locale), compact = (text: string) => text.replace(/\s+/gu, ' ').trim();
      await expect(page.getByRole('heading', { level: 1, name: prepared.title, exact: true })).toBeVisible();
      await expect.poll(async () => { const visible = compact(await page.getByRole('main').innerText()); return prepared.document.blocks.every(block => block.text.split('\n').filter(Boolean).every(line => visible.includes(compact(line)))); }, { message: 'The teaching blocks must render after the single language navigation.' }).toBe(true);
    } else await openLesson(page, course, key, locale);
    await expect.poll(async () => { await Promise.all([...pending]); return !failed && memberSeen && (!requireLearning || learningSeen); }, { message: 'Every observed paid-content response must succeed without a hidden refusal.' }).toBe(true);
  } catch {
    await Promise.all([...pending]); snapshot ??= paidDatabase(course, owner, key, locale);
    let principal: unknown = { available: false };
    try { const me = await page.context().request.get('/api/v1/auth/me'), value: unknown = await me.json().catch(() => null); principal = { status: me.status(), expectedOwner: record(value) && value.id === owner }; } catch { /* Sanitized transport observation only. */ }
    const diagnostic = { recordedBeforeCleanup: true, failed, observations, principal, database: snapshot, automaticRetry: false };
    evidenceJson(`paid-${locale}-${key}-failure-before-cleanup.json`, diagnostic);
    throw new Error(`Paid course observation failed: ${JSON.stringify(diagnostic)}`);
  } finally { page.off('response', listener); page.off('request', requestListener); await Promise.all([...pending]); }
}

export async function saveReleaseProject(page: Page) {
  const form = page.locator('[data-project-save-state]'), button = form.locator('button[type="submit"]'); await expect(button).toBeEnabled();
  const response = page.waitForResponse(value => value.request().method() === 'PATCH' && /^\/api\/v1\/me\/projects\/[a-f0-9-]{36}$/.test(new URL(value.url()).pathname));
  await button.press('Enter'); const saved = await response; expect(saved.status()).toBe(200); await expect(form).toHaveAttribute('data-project-save-state', 'saved');
  const project = await saved.json() as ProjectView; expect((await projectRecord(page.context().request, project.id)).currentRevisionId).toBe(project.currentRevisionId); return project;
}
export async function confirmReleaseDialog(page: Page, title: string, confirm: string, cancel: string) {
  const dialog = page.getByRole('alertdialog', { name: title, exact: true }); await expect(dialog).toBeVisible();
  const back = dialog.getByRole('button', { name: cancel, exact: true }), action = dialog.getByRole('button', { name: confirm, exact: true });
  await expect(back).toBeFocused(); await page.keyboard.press('Tab'); await expect(action).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(back).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();
}

const allowedCaptures = new Set(['fr-390-catalogue-empty', 'fr-390-catalogue-unavailable', 'fr-390-paid-original-note', 'en-390-paid-original-note',
  'en-390-paid-french-quiz-history', 'fr-390-project-conflict', 'en-390-participation-provenance', 'en-390-contextual-support']);
export async function captureRelease(page: Page, scenarioId: ScenarioId, name: string, target?: Locator) {
  const current = new URL(page.url()), expected = new URL(process.env.COURSES_BROWSER_ORIGIN!);
  if (current.origin !== expected.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(current.hostname) || !allowedCaptures.has(name)) throw new Error('Only allowlisted synthetic application captures on the owned loopback origin are permitted.');
  await page.setViewportSize({ width: 390, height: 1000 }); await page.getByRole('main').focus();
  if (target) await target.scrollIntoViewIfNeeded(); else await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.skip-link')).toHaveCount(1); expect(await page.locator('.skip-link').evaluate(node => node.getBoundingClientRect().bottom <= 0)).toBe(true);
  const filename = `${name}.png`, file = join(process.env.COURSES_BROWSER_EVIDENCE!, filename);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  const bytes = readFileSync(file), manifestFile = join(process.env.COURSES_BROWSER_EVIDENCE!, 'capture-manifest.json');
  const captures: unknown[] = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as { captures: unknown[] }).captures : [];
  if (!Array.isArray(captures)) throw new Error('Existing capture manifest must remain valid.');
  captures.push({ scenarioId, path: filename, sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), syntheticApp: true, provider: false, capturedFromLoopbackApp: true });
  evidenceJson('capture-manifest.json', { schemaVersion: 1, fixtureDataOnly: true, captures });
}
