import { expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { CreateContent, EnrollmentView, QuizAttemptView, QuizCheckResult } from '../../apps/web/src/lib/api/generated/types.gen';
import { editorialContent } from './editorial-content';
import { csrfHeaders, loginEditor } from './editorial-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { publishPublicContent } from './public-content-fixture';
import { courseActivityHref } from '../../apps/web/src/lib/public/routes';

type Locale = 'fr' | 'en';
type Pair = Record<Locale, RecordedContent>;
export function learningContent(locale: Locale, access: 'FREE' | 'PROTECTED' = 'FREE'): CreateContent {
  const value = editorialContent(locale, access), fr = locale === 'fr';
  value.reason = 'P08 disposable fictional BR01 integration fixture, not production course';
  value.document.quizPolicy = { passPercent: 100, maxAttempts: 3 };
  value.document.blocks = [
    { type: 'PARAGRAPH', text: fr ? 'Dossier fictif BR01. Client R aménage des bureaux. Il demande quatre pages en français : Accueil (600 mots), Services (800), À propos (400), Contact (250). Ton professionnel, simple et rassurant. Les textes existants, la présentation et les réponses au questionnaire seront fournis ; leur disponibilité reste à confirmer.' : 'Fictional case BR01. Client R provides office fit-out services and requests four pages in French: Home (600 words), Services (800), About (400), Contact (250). The tone is professional, simple and reassuring. Existing texts, a service description and questionnaire answers will be supplied; their availability remains unconfirmed.', url: null },
    { type: 'PARAGRAPH', text: fr ? 'TR01 : cadrage 180 € HT, Accueil 320 €, Services 360 €, À propos 220 €, Contact 120 €. Total : 1 200 € HT, plafond client 1 400 € HT. Un cycle de retours regroupés. Quinze jours ouvrés après réception des éléments ET validation du brief ; retours client sous trois jours ouvrés. Logo et intégration restent sans tarif ni périmètre confirmé. Aucune ancienneté, référence client ou performance vérifiée fournie.' : 'TR01: scoping €180 excluding tax, Home €320, Services €360, About €220, Contact €120. Total €1,200 excluding tax; client ceiling €1,400. One consolidated feedback round. Fifteen business days after receiving materials AND approving the brief, with feedback within three business days. Logo work and integration have no agreed price or scope. No verified years of business, customer references or performance figures are supplied.', url: null },
    { type: 'CALLOUT', text: fr ? 'Exemple : « Mettre les textes dans le site » appelle une question sur le besoin et les accès ; les 200 € restant sous le plafond ne créent pas un tarif.' : 'Example: “Put the text into the website” calls for clarification of requirements and access. The remaining €200 does not create a price.', url: null },
  ];
  value.document.exercise = { instructions: fr ? 'Préparez un tableau faits / inconnues / conséquences. Vérifiez le total TR01 et expliquez pourquoi le logo, l’intégration et une date ferme nécessitent des précisions.' : 'Prepare a facts / unknowns / consequences table. Check the TR01 total and explain why logo work, integration and a fixed delivery date require clarification.', correction: fr ? 'Total 1 200 € HT. Logo et intégration à chiffrer séparément. Aucun début confirmé ne permet une date ferme.' : 'Total €1,200 excluding tax. Logo work and integration need separate pricing. No confirmed start allows a fixed delivery date.' };
  value.document.quiz = [
    { key: 'budget', prompt: fr ? 'Quel montant résulte des tarifs TR01 ?' : 'What total follows from TR01?', options: fr ? ['1 400 € HT', '1 200 € HT', '1 180 € HT'] : ['€1,400 excluding tax', '€1,200 excluding tax', '€1,180 excluding tax'], correctOption: 1, explanation: fr ? '180 + 320 + 360 + 220 + 120 = 1 200. Le plafond ne remplace pas le calcul.' : '180 + 320 + 360 + 220 + 120 = 1,200. The ceiling does not replace the calculation.', points: 1 },
    { key: 'integration', prompt: fr ? 'Que faire de l’intégration au site ?' : 'How should website integration be handled?', options: fr ? ['L’inclure dans le solde de 200 €', 'La déclarer gratuite', 'Clarifier puis chiffrer séparément'] : ['Include it in the remaining €200', 'Treat it as free', 'Clarify it and price it separately'], correctOption: 2, explanation: fr ? 'Un montant disponible ne crée ni tarif ni capacité d’exécution.' : 'Remaining budget is not a price or confirmed delivery capacity.', points: 1 },
    { key: 'calendar', prompt: fr ? 'Peut-on promettre le 25 novembre avec ce dossier ?' : 'Can this case justify promising 25 November?', options: fr ? ['Oui, quinze jours suffisent toujours', 'Non, le démarrage reste à confirmer', 'Oui, si le client le préfère'] : ['Yes, fifteen days are always enough', 'No, the start remains unconfirmed', 'Yes, if the client prefers it'], correctOption: 1, explanation: fr ? 'Le délai relatif dépend de la réception et de la validation ; aucune date ferme ne peut être calculée.' : 'The duration depends on receiving materials and approval; a fixed date cannot be calculated.', points: 1 },
  ];
  return value;
}

export async function createLearningFixture(request: APIRequestContext) {
  await loginEditor(request);
  const marker = `p08-${randomUUID()}`, secret = `P08-PREMIUM-PRIVATE-${randomUUID()}`;
  async function pair(kind: CreateContent['kind'], title: Record<Locale, string>, children: string[] = [], protectedBody = false): Promise<Pair> {
    const command = learningContent('fr', protectedBody ? 'PROTECTED' : 'FREE');
    command.kind = kind; command.title = title.fr; command.slug = `${marker}-${kind.toLowerCase().replace('_', '-')}-${randomUUID()}-fr`; command.childVersionIds = children;
    if (protectedBody) command.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
    let fr = await publishPublicContent(request, await createContent(request, command));
    const enCommand = learningContent('en', protectedBody ? 'PROTECTED' : 'FREE');
    if (protectedBody) enCommand.document.blocks = [{ type: 'PARAGRAPH', text: secret, url: null }];
    const en = await publishPublicContent(request, await contentAction(request, fr, 'translations', { locale: 'en', slug: `${marker}-${kind.toLowerCase().replace('_', '-')}-${randomUUID()}-en`, title: title.en,
      summary: 'P08 fictional disposable BR01 verification', document: enCommand.document, reason: 'P08 explicit equivalent English fixture' }, 201));
    fr = await currentContent(request, fr.value.id);
    return { fr, en };
  }
  const activity = await pair('ACTIVITY', { fr: 'BR01 · lire et vérifier le brief', en: 'BR01 · read and check the brief' });
  const next = await pair('ACTIVITY', { fr: 'BR01 · préparer le périmètre', en: 'BR01 · prepare the scope' });
  const premium = await pair('ACTIVITY', { fr: 'BR01 · activité protégée', en: 'BR01 · protected activity' }, [], true);
  const module = await pair('MODULE', { fr: 'BR01 · module de recette', en: 'BR01 · verification module' }, [activity.fr.value.versionId, next.fr.value.versionId, premium.fr.value.versionId]);
  const course = await pair('COURSE', { fr: 'BR01 · parcours de recette P08', en: 'BR01 · P08 verification course' }, [module.fr.value.versionId], true);
  return { marker, secret, activity, next, premium, module, course };
}
export type LearningFixture = Awaited<ReturnType<typeof createLearningFixture>>;
export function learningActivityHref(fixture: LearningFixture, locale: Locale, child = fixture.activity) {
  return courseActivityHref(locale, fixture.course[locale].value.slug, child[locale].value.slug, child[locale].value.resourceId, child[locale].value.versionId, fixture.course[locale].value.versionId);
}
export async function learningHeaders(request: APIRequestContext, accountId: string, etag?: string) {
  return { ...await csrfHeaders(request), 'X-Account-Context': accountId, ...(etag ? { 'If-Match': etag } : {}) };
}
export async function enrollLearning(request: APIRequestContext, fixture: LearningFixture, accountId: string, locale: Locale = 'fr') {
  const response = await request.post('/api/v1/me/enrollments', { headers: await learningHeaders(request, accountId), data: { courseResourceId: fixture.course.fr.value.resourceId, courseVersionId: fixture.course.fr.value.versionId, locale } });
  expect([200, 201]).toContain(response.status());
  return await response.json() as EnrollmentView;
}
export const br01Answers = [{ key: 'budget', optionIndex: 1 }, { key: 'integration', optionIndex: 2 }, { key: 'calendar', optionIndex: 1 }];
export async function submitLearningQuiz(request: APIRequestContext, fixture: LearningFixture, enrollmentId: string, accountId: string, locale: Locale = 'fr') {
  const source = fixture.activity[locale].value;
  const response = await request.post(`/api/v1/activities/${source.resourceId}/quiz-attempts`, { headers: await learningHeaders(request, accountId), data: { enrollmentId, activityVersionId: source.versionId, revisionId: source.publishedRevisionId, locale, submissionId: randomUUID(), answers: br01Answers } });
  expect(response.status()).toBe(201); return await response.json() as QuizAttemptView;
}
export async function checkLearningQuiz(request: APIRequestContext, fixture: LearningFixture, locale: Locale = 'fr') {
  const source = fixture.activity[locale].value;
  const response = await request.post(`/api/v1/learning/activities/${source.resourceId}/versions/${source.versionId}/quiz-checks`, { headers: await csrfHeaders(request), data: { revisionId: source.publishedRevisionId, locale, answers: br01Answers } });
  expect(response.status()).toBe(200); return await response.json() as QuizCheckResult;
}
