import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { MethodView, ProjectFields, ProjectView, SelfAssessmentView, SolutionRevealView } from '../../apps/web/src/lib/api/generated/types.gen';
import { getAssetsDictionary } from '../../apps/web/src/lib/i18n/assets';
import { getLearningDictionary } from '../../apps/web/src/lib/i18n/learning';
import { getMethodPageDictionary } from '../../apps/web/src/lib/i18n/method-pages';
import { getMethodsDictionary } from '../../apps/web/src/lib/i18n/methods';
import { getProjectsDictionary } from '../../apps/web/src/lib/i18n/projects';
import { methodsPath } from '../../apps/web/src/lib/methods/routes';
import { projectsPath } from '../../apps/web/src/lib/projects/routes';
import { csrfHeaders } from './editorial-fixture';
import { methodLearner, fillMethodLogin } from './methods-fixture';
import { captureCourse, courseLessonHref, courseMethodHref, courseRecord, downloadBytes, freeLessonHref, grantCourseTestAccess,
  preparedActivity, preparedFile, sha256, type CourseFixture, type CourseLocale, type DownloadReceipt } from './course-content-fixture';

const exportLabel = (locale: CourseLocale) => locale === 'fr' ? 'Exporter ma saisie en Markdown (.md)' : 'Export my input as Markdown (.md)';
const compact = (value: string) => value.replace(/\s+/gu, ' ').trim();
async function pressEnabled(button: Locator) { await expect(button).toBeEnabled(); await button.press('Enter'); }

export async function openLesson(page: Page, fixture: CourseFixture, key: string, locale: CourseLocale, standalone = false) {
  await page.goto(standalone ? freeLessonHref(fixture, locale) : courseLessonHref(fixture, key, locale));
  const source = preparedActivity(fixture, key, locale);
  await expect(page.getByRole('heading', { level: 1, name: source.title, exact: true })).toBeVisible();
  await expect.poll(async () => {
    const visible = compact(await page.getByRole('main').innerText());
    return source.document.blocks.every(block => block.text.split('\n').filter(Boolean).every(line => visible.includes(compact(line))));
  }, { message: `${key}/${locale}: all prepared teaching blocks must actually be readable` }).toBe(true);
}
async function keyboardConfirmation(page: Page, trigger: Locator, title: string, cancel: string, confirm: string) {
  await expect(trigger).toBeEnabled(); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: title, exact: true }); await expect(dialog).toBeVisible();
  const cancelButton = dialog.getByRole('button', { name: cancel, exact: true }), confirmButton = dialog.getByRole('button', { name: confirm, exact: true });
  await cancelButton.focus(); await page.keyboard.press('Tab'); await expect(confirmButton).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(cancelButton).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();
}
async function downloadResource(page: Page, fixture: CourseFixture, key: string, locale: CourseLocale, receipts: DownloadReceipt[]) {
  if (receipts.some(receipt => receipt.key === key)) return;
  const file = preparedFile(fixture, key, locale), locator = page.locator(`[data-asset-access="${file.assetId}"]`);
  const button = locator.getByRole('button', { name: getAssetsDictionary(locale).download, exact: true }); await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent('download'); await button.press('Enter');
  const download = await downloaded, bytes = await downloadBytes(download);
  expect(download.suggestedFilename()).toBe(basename(file.path)); expect(sha256(bytes)).toBe(file.sha256);
  expect(bytes.equals(file.bytes), 'The actual downloaded bytes equal the prepared editable resource').toBe(true);
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  receipts.push({ key, locale, purpose: file.purpose, assetId: file.assetId, filename: download.suggestedFilename(), bytes: bytes.length,
    sha256: sha256(bytes), utf8: true, actualUiDownload: true });
}
async function exportCurrentInput(page: Page, locale: CourseLocale, kind: 'method' | 'project', marker: string) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: exportLabel(locale), exact: true }).press('Enter');
  const download = await pending, bytes = await downloadBytes(download), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  expect(download.suggestedFilename()).toBe(`${kind}-${locale}.md`);
  expect(text.includes(marker), 'The local export contains the current unsaved input without logging that input').toBe(true);
  return { kind, filename: download.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes), currentInputObserved: true };
}
async function preparePersonalMethod(page: Page, context: BrowserContext, fixture: CourseFixture, locale: CourseLocale) {
  const account = await methodLearner(context.request, locale), t = getMethodsDictionary(locale), bridge = getMethodPageDictionary(locale);
  await page.goto(courseMethodHref(fixture, locale));
  await expect(page.getByRole('button', { name: t.prepare, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: t.prepare, exact: true }).press('Enter');
  const output = page.getByRole('textbox', { name: t.output, exact: true }); await expect(output).not.toHaveValue('');
  const title = `P18 ${locale} reusable method ${randomUUID()}`;
  await page.getByRole('textbox', { name: bridge.title, exact: true }).fill(title);
  await pressEnabled(page.getByRole('button', { name: bridge.keepAndSignIn, exact: true }));
  await fillMethodLogin(page, locale, account);
  await pressEnabled(page.getByRole('button', { name: bridge.importAction, exact: true }));
  await expect(output).not.toHaveValue('');
  const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/v1/me/methods/from-template'));
  await pressEnabled(page.getByRole('button', { name: t.save, exact: true }));
  const response = await created; expect(response.status()).toBe(201); let method = await response.json() as MethodView;
  await expect(page.locator('[data-method-save-state]')).toHaveAttribute('data-method-save-state', 'saved');
  await page.goto(methodsPath(locale, method.id)); await expect(page.getByRole('textbox', { name: t.output, exact: true })).toHaveValue(method.text);
  const marker = `P18 local export ${randomUUID()}`;
  await page.getByRole('textbox', { name: t.notes, exact: true }).fill(marker);
  const exported = await exportCurrentInput(page, locale, 'method', marker);
  await expect(page.locator('[data-method-save-state]')).toHaveAttribute('data-method-save-state', 'modified');
  expect(((await (await context.request.get(`/api/v1/me/methods/${method.id}`)).json()) as MethodView).notes === method.notes,
    'Export does not implicitly save the edited personal method').toBe(true);
  const patched = page.waitForResponse(value => value.request().method() === 'PATCH' && value.url().endsWith(`/me/methods/${method.id}`));
  await pressEnabled(page.getByRole('button', { name: t.save, exact: true })); expect((await patched).status()).toBe(200);
  await expect(page.locator('[data-method-save-state]')).toHaveAttribute('data-method-save-state', 'saved');
  method = await (await context.request.get(`/api/v1/me/methods/${method.id}`)).json() as MethodView;
  await captureCourse(page, `${locale}-390-method-saved-exported`);
  return { account, method, exported };
}

function proposalFields(locale: CourseLocale, second: boolean): ProjectFields {
  const fr = locale === 'fr';
  return { title: `P18 ${second ? 'BR02' : 'BR01'} ${locale} ${randomUUID()}`, locale,
    objective: second ? fr ? 'Présenter les incompatibilités de la demande de Client S et les décisions à prendre.' : 'Explain Client S’s conflicting constraints and the decisions needed.'
      : fr ? 'Rendre les services de Client R plus compréhensibles et préparer un premier échange.' : 'Make Client R’s services easier to understand and prepare an initial conversation.',
    scope: second ? fr ? 'Demande complète : quatre pages en français et FAQ, avec intégration à préciser. Option sans À propos uniquement sous accord explicite.' : 'Full request: four French pages and FAQ, with integration to clarify. An option without About requires explicit agreement.'
      : fr ? 'Réécriture en français : Accueil600 mots maximum, Services800, À propos400, Contact250. Document éditable, un cycle de retours regroupés sur le périmètre validé.' : 'Rewrite in French: Home600 words maximum, Services800, About400, Contact250. Editable document and one consolidated feedback round on the agreed scope.',
    method: fr ? 'Cadrage, validation du plan, rédaction, retours centralisés, corrections, vérification et remise.' : 'Scoping, outline approval, drafting, consolidated feedback, revisions, checking and delivery.',
    timeline: second ? fr ? 'Cinq jours ouvrés sont demandés mais au moins dix jours ouvrés de rédaction sont nécessaires ; ne pas promettre cinq jours.' : 'Five business days are requested but at least ten business days of copywriting are required; do not promise five days.'
      : fr ? 'Quinze jours ouvrés après réception des éléments nécessaires ET validation du brief ; retours client centralisés sous trois jours ouvrés. Pas de date ferme.' : 'Fifteen business days after receiving necessary materials AND approving the brief; consolidated feedback within three business days. No firm date.',
    budget: second ? fr ? '180+320+360+220+120+200=1 400€ HT avant intégration ; plafond GLOBAL1 200€ HT. Sans À propos :180+320+360+120+200=1 180€ HT sous accord. Les20€ restants ne chiffrent pas l’intégration.' : '180+320+360+220+120+200=€1,400 excluding tax before integration; OVERALL ceiling€1,200. Without About:180+320+360+120+200=€1,180 subject to agreement. The remaining€20 does not price integration.'
      : fr ? 'Cadrage180€ HT, Accueil320€, Services360€, À propos220€, Contact120€ : total1 200€ HT, plafond rédactionnel1 400€ HT. Logo et intégration non chiffrés et non inclus.' : 'Scoping€180, Home€320, Services€360, About€220, Contact€120: total€1,200 excluding tax, copywriting ceiling€1,400. Logo work and integration are unpriced and not included.',
    clarifications: fr ? 'Confirmer éléments disponibles, validateur, périmètre et accès pour les demandes non chiffrées ; ne rien inventer.' : 'Confirm available materials, approver, scope and access for unpriced requests; invent nothing.',
    nextStep: fr ? 'Confirmer le périmètre, le budget et les conditions avant de convenir du démarrage.' : 'Agree on scope, budget and conditions before arranging a start.', externalText: '' };
}
async function saveProject(page: Page, locale: CourseLocale, ready = false) {
  const t = getProjectsDictionary(locale), form = page.locator('[data-project-save-state]');
  const button = ready ? form.getByRole('button', { name: t.ready, exact: true }) : form.locator('button[type="submit"]'); await expect(button).toBeEnabled();
  const response = page.waitForResponse(value => value.request().method() === 'PATCH' && /\/me\/projects\/[^/?]+$/.test(new URL(value.url()).pathname));
  await button.press('Enter'); const acknowledged = await response; expect(acknowledged.status()).toBe(200);
  await expect(form).toHaveAttribute('data-project-save-state', 'saved'); return await acknowledged.json() as ProjectView;
}
async function assessAndReveal(page: Page, context: BrowserContext, fixture: CourseFixture, locale: CourseLocale, project: ProjectView, key: string, receipts: DownloadReceipt[]) {
  const t = getProjectsDictionary(locale); expect(project.rubric.criteria).toHaveLength(20);
  const tab = page.getByRole('tab', { name: t.check, exact: true }); await tab.focus(); await page.keyboard.press('Enter');
  const assessment = page.locator('[data-project-assessment-state]');
  for (const criterion of project.rubric.criteria) await assessment.getByRole('checkbox', { name: criterion.label, exact: true }).check();
  const recorded = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith(`/me/projects/${project.id}/self-assessments`));
  await pressEnabled(assessment.getByRole('button', { name: t.submitAssessment, exact: true }));
  const acknowledgement = await recorded; expect(acknowledgement.status()).toBe(201); const result = await acknowledgement.json() as SelfAssessmentView;
  expect(result.scorePoints).toBe(20); expect(result.projectRevisionId).toBe(project.currentRevisionId);
  if (key === 'commented-solution-br01') await captureCourse(page, `${locale}-390-declared-assessment`, true);
  await page.getByRole('tab', { name: t.solution, exact: true }).press('Enter');
  const revealResponse = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/solution-reveals'));
  await keyboardConfirmation(page, page.getByRole('button', { name: t.reveal, exact: true }), t.revealTitle, t.cancel, t.reveal);
  const response = await revealResponse; expect(response.status()).toBe(200); const reveal = await response.json() as SolutionRevealView;
  const file = preparedFile(fixture, key, locale);
  expect(reveal.files.some(value => value.assetId === file.assetId)).toBe(true);
  const me = await context.request.get('/api/v1/auth/me'); expect(me.status()).toBe(200); const actor = await me.json() as { id: string };
  const generic = await context.request.post(`/api/v1/assets/${file.assetId}/download-access`, { headers: { ...await csrfHeaders(context.request), 'X-Account-Context': actor.id },
    data: { resourceId: project.origin.activityId, versionId: project.origin.activityVersionId, locale, enrollmentId: null } });
  expect(generic.status(), 'A revealed solution never becomes a generic asset').toBe(404);
  await downloadResource(page, fixture, key, locale, receipts);
  return result;
}

export async function runCourseJourney(page: Page, context: BrowserContext, fixture: CourseFixture, locale: CourseLocale) {
  const t = getProjectsDictionary(locale), learning = getLearningDictionary(locale), downloads: DownloadReceipt[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await openLesson(page, fixture, 'm01', locale, true);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect((await preparedActivity(fixture, 'm01', locale)).document.blocks.some(block => block.text.includes(locale === 'fr' ? 'Comparer après' : 'Compare after'))).toBe(true);
  for (const key of ['br01-tr01', 'scoping-table']) await downloadResource(page, fixture, key, locale, downloads);
  const personal = await preparePersonalMethod(page, context, fixture, locale), access = grantCourseTestAccess(personal.account.id, fixture);
  await openLesson(page, fixture, 'm01', locale);
  await pressEnabled(page.getByRole('button', { name: learning.startCourse, exact: true })); await expect(page.getByText(learning.enrolled, { exact: true })).toBeVisible();
  const projects: ProjectView[] = [], exports = [personal.exported];
  for (let index = 1; index <= 6; index++) {
    const key = `m0${index}`;
    await page.setViewportSize({ width: (locale === 'fr' && index === 1 || locale === 'en' && index === 6) ? 1440 : 390, height: 1000 });
    await openLesson(page, fixture, key, locale); await captureCourse(page, `${locale}-${page.viewportSize()!.width}-${key}-lesson`);
    const item = fixture.input.items.find(item => item.key === `activity-${key}` && item.locale === locale)!;
    for (const resource of item.resourceFileKeys) await downloadResource(page, fixture, resource, locale, downloads);
    if (index !== 4 && index !== 6) continue;
    await page.setViewportSize({ width: 390, height: 844 });
    await pressEnabled(page.getByRole('button', { name: t.start, exact: true }));
    const preparation = page.locator('[data-project-preparation]'), fields = proposalFields(locale, index === 6);
    await expect(preparation.getByRole('textbox', { name: t.objective, exact: true })).toBeEnabled();
    for (const key of ['title', 'objective', 'scope', 'method', 'timeline', 'budget', 'clarifications', 'nextStep'] as const) await preparation.getByRole('textbox', { name: t[key], exact: true }).fill(fields[key]);
    const created = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/api/v1/me/projects'));
    await pressEnabled(preparation.locator('button[type="submit"]')); const response = await created; expect(response.status()).toBe(201); let project = await response.json() as ProjectView;
    await preparation.getByRole('link', { name: t.open, exact: true }).press('Enter'); await expect(page).toHaveURL(new RegExp(projectsPath(locale, project.id) + '$'));
    await expect(page.getByRole('textbox', { name: t.objective, exact: true })).toHaveValue(fields.objective);
    if (index === 4) {
      const marker = `${fields.nextStep}\nP18 local export before explicit saving.`;
      await page.getByRole('textbox', { name: t.nextStep, exact: true }).fill(marker);
      exports.push(await exportCurrentInput(page, locale, 'project', marker));
      await expect(page.locator('[data-project-save-state]')).toHaveAttribute('data-project-save-state', 'modified');
      expect(((await (await context.request.get(`/api/v1/me/projects/${project.id}`)).json()) as ProjectView).fields.nextStep === fields.nextStep, 'Export never implicitly saves the project').toBe(true);
      project = await saveProject(page, locale);
    }
    project = await saveProject(page, locale, true); expect(project.rubric.caseCode).toBe(index === 6 ? 'BR02' : 'BR01');
    if (index === 6) await captureCourse(page, `${locale}-390-br02-independent-project`, true);
    await assessAndReveal(page, context, fixture, locale, project, index === 4 ? 'commented-solution-br01' : 'commented-solution-br02', downloads);
    projects.push(project);
  }
  expect(projects[0].id).not.toBe(projects[1].id); expect(downloads).toHaveLength(9);
  const methodText = getMethodsDictionary(locale); await page.goto(methodsPath(locale, personal.method.id));
  const data = locale === 'fr' ? 'BR02 : rédaction complète1 400€ HT avant intégration ; plafond global1 200€ HT. Minimum dix jours ouvrés contre cinq demandés. Option1 180€ sans À propos sous accord ;20€ ne chiffrent pas intégration.'
    : 'BR02: full copywriting€1,400 excluding tax before integration; overall ceiling€1,200. At least ten business days against five requested. Optional€1,180 without About subject to agreement;€20 does not price integration.';
  const parameters = { objective: locale === 'fr' ? 'Préparer une réponse fidèle au second dossier BR02.' : 'Prepare a response faithful to the second case BR02.',
    context: locale === 'fr' ? 'Demande de Client S ; contraintes à arbitrer.' : 'Client S’s request; conflicting constraints to resolve.', availableData: data,
    recipient: 'Client S', format: locale === 'fr' ? 'Calcul, limites, option conditionnelle et prochaine question.' : 'Calculation, limits, conditional option and next question.',
    constraints: locale === 'fr' ? 'Ne pas promettre cinq jours ni inventer un tarif d’intégration.' : 'Promise neither five days nor an invented integration price.',
    clarifications: locale === 'fr' ? 'Accord de périmètre, budget, délai, besoin et accès pour intégration.' : 'Scope agreement, budget, timing, requirements and access for integration.' };
  for (const [key, value] of Object.entries(parameters)) await page.getByRole('textbox', { name: methodText.fields[key as keyof typeof methodText.fields], exact: true }).fill(value);
  await keyboardConfirmation(page, page.getByRole('button', { name: methodText.rebuild, exact: true }), methodText.replaceTitle, methodText.cancel, methodText.confirmRebuild);
  expect((await page.getByRole('textbox', { name: methodText.output, exact: true }).inputValue()).includes(data)).toBe(true);
  const updated = page.waitForResponse(value => value.request().method() === 'PATCH' && value.url().endsWith(`/me/methods/${personal.method.id}`));
  await pressEnabled(page.getByRole('button', { name: methodText.save, exact: true })); const savedMethodResponse = await updated; expect(savedMethodResponse.status()).toBe(200);
  const savedMethod = await savedMethodResponse.json() as MethodView; expect(savedMethod.id).toBe(personal.method.id);
  expect(savedMethod.locale).toBe(locale); expect(savedMethod.text.includes(data)).toBe(true);
  await expect(page.locator('[data-method-save-state]')).toHaveAttribute('data-method-save-state', 'saved');
  const receipt = { locale, ownerId: personal.account.id, methodId: personal.method.id, projectIds: projects.map(project => project.id),
    openedModules: 6, manualTestAccess: access, downloads, localExports: exports, methodExplicitlyRebuiltForBr02: true,
    declaration: 'Scores are learner declarations on exact saved revisions, never human or automatic validation of the proposal.' };
  writeFileSync(join(process.env.COURSES_BROWSER_EVIDENCE!, `${locale}-course-journey.json`), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return { receipt, projects };
}
