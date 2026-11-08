import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateContent, ProjectFields, ProjectPreset, ProjectView } from '../../apps/web/src/lib/api/generated/types.gen';
import { projectEtag } from '../../apps/web/src/lib/api/projects-validation';
import { activityDiscoveryHref } from '../../apps/web/src/lib/public/routes';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { editorialContent } from './editorial-content';
import { learningContent } from './learning-fixture';
import { publishPublicContent } from './public-content-fixture';

type Locale = 'fr' | 'en';
type Pair = Record<Locale, RecordedContent>;
export async function projectContent(request: APIRequestContext, locale: Locale, caseCode: 'BR01' | 'BR02'): Promise<CreateContent> {
  const response = await request.get(`/api/v1/admin/project-presets/${caseCode}?locale=${locale}`);
  expect(response.status()).toBe(200); const preset = await response.json() as ProjectPreset;
  const value = caseCode === 'BR01' ? learningContent(locale) : editorialContent(locale), fr = locale === 'fr';
  value.title = `${caseCode} · ${fr ? 'atelier de proposition fictif P09' : 'P09 fictional proposal workspace'}`;
  value.document.projectPolicy = preset.policy; value.document.rubric = preset.rubric;
  if (caseCode === 'BR02') {
    value.document.blocks = [{ type: 'PARAGRAPH', url: null, text: fr
      ? 'Dossier fictif BR02. Client S demande les quatre pages de BR01, une FAQ et leur intégration au site. Cadrage 180 € HT ; Accueil 320 €, Services 360 €, À propos 220 €, Contact 120 €, FAQ 200 €. Aucun tarif d’intégration. Plafond global 1 200 € HT ; délai demandé cinq jours ouvrés ; capacité de rédaction au moins dix jours ouvrés.'
      : 'Fictional case BR02. Client S requests the four BR01 pages, an FAQ and website integration. Scoping €180 excluding tax; Home €320, Services €360, About €220, Contact €120, FAQ €200. Integration has no price. Overall ceiling €1,200; requested five business days; copywriting capacity requires at least ten business days.' }];
    value.document.exercise = { instructions: fr ? 'Exposez les incompatibilités de budget et de délai. Proposez une option uniquement sous accord et clarifiez l’intégration.' : 'Explain the budget and timing conflicts. Offer an option subject to agreement and clarify integration.', correction: fr
      ? 'La rédaction complète coûte 1 400 € HT avant intégration. Une option sans À propos coûte 1 180 € HT sous accord explicite ; les 20 € restants ne chiffrent pas l’intégration. Dix jours ouvrés minimum excluent une promesse de cinq jours.'
      : 'Full copywriting costs €1,400 excluding tax before integration. An option without About costs €1,180 subject to agreement; the remaining €20 does not price integration. At least ten business days rules out promising five days.' };
    value.document.quiz = [];
  }
  value.reason = 'P09 disposable fictional project fixture; never production learning content';
  return value;
}
export async function createProjectFixture(request: APIRequestContext) {
  await loginEditor(request);
  async function pair(caseCode: 'BR01' | 'BR02'): Promise<Pair> {
    const command = await projectContent(request, 'fr', caseCode);
    let fr = await publishPublicContent(request, await createContent(request, command));
    const translated = await projectContent(request, 'en', caseCode);
    const en = await publishPublicContent(request, await contentAction(request, fr, 'translations', { locale: 'en', slug: `p09-${caseCode.toLowerCase()}-${randomUUID()}`, title: translated.title,
      summary: translated.summary, document: translated.document, reason: 'P09 explicit English equivalent with adapted reference rubric' }, 201));
    fr = await currentContent(request, fr.value.id); return { fr, en };
  }
  return { BR01: await pair('BR01'), BR02: await pair('BR02') };
}
export type ProjectFixture = Awaited<ReturnType<typeof createProjectFixture>>;
export const projectSourceHref = (source: RecordedContent, locale: Locale) => activityDiscoveryHref(locale, source.value.resourceId, source.value.versionId);
export function projectFields(locale: Locale = 'fr', marker = `P09-${randomUUID()}`): ProjectFields {
  return { title: marker, locale, objective: `${marker} · objectif personnel`, scope: 'Quatre pages ; logo et intégration à préciser.', method: 'Relire les faits puis écrire une proposition.', timeline: 'Démarrage à confirmer ; aucun engagement de date.', budget: '180 + 320 + 360 + 220 + 120 = 1 200 € HT.', clarifications: 'Disponibilité des textes et modalités de validation.', nextStep: 'Confirmer le périmètre et les conditions.', externalText: `${marker} · texte externe indépendant` };
}
export async function createPersonalProject(request: APIRequestContext, actor: string, source: RecordedContent, fields = projectFields(source.value.locale), stage: ProjectView['stage'] = 'READY_FOR_SELF_ASSESSMENT') {
  const response = await request.post('/api/v1/me/projects', { headers: { ...await csrfHeaders(request), 'X-Account-Context': actor }, data: {
    creationId: randomUUID(), activityId: source.value.resourceId, activityVersionId: source.value.versionId, revisionId: source.value.publishedRevisionId,
    sourceLocale: source.value.locale, enrollmentId: null, fields, stage,
  } });
  expect(response.status()).toBe(201); return await response.json() as ProjectView;
}
export async function projectRecord(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/v1/me/projects/${id}`); expect(response.status()).toBe(200);
  const value = await response.json() as ProjectView; expect(response.headers().etag).toBe(projectEtag(value)); return value;
}
export async function patchProject(request: APIRequestContext, actor: string, project: ProjectView, fields: ProjectFields) {
  return request.patch(`/api/v1/me/projects/${project.id}`, { headers: { ...await csrfHeaders(request), 'X-Account-Context': actor, 'If-Match': projectEtag(project) }, data: { fields, stage: project.stage } });
}
