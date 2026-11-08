import { randomUUID } from 'node:crypto';
import type { CreateContent } from '../../apps/web/src/lib/api/generated/types.gen';

// Facts from CONTENT_REFERENCE/BR01; a disposable test activity, not a claim
// that the six-module production course or its media have been produced.
export function editorialContent(locale: 'fr' | 'en', access: 'FREE' | 'PROTECTED' = 'FREE'): CreateContent {
  return {
    kind: 'ACTIVITY', locale, slug: `p05-${randomUUID()}`,
    title: locale === 'fr' ? 'Comprendre le brief de Client R' : 'Understand Client R’s brief',
    summary: locale === 'fr' ? 'Activité fictive de vérification du CMS.' : 'Fictional activity for CMS verification.',
    objectives: 'Distinguish supplied facts from unknowns in BR01.',
    evaluationDefinition: 'Identify the four pages and the unpriced logo and integration requests.',
    childVersionIds: [], reason: 'P05 disposable browser verification',
    document: {
      objective: locale === 'fr' ? 'Distinguer les faits fournis des informations à confirmer.' : 'Distinguish supplied facts from information to confirm.',
      expectedResult: locale === 'fr' ? 'Une liste séparant les quatre pages, le logo et l’intégration.' : 'A list separating the four pages from logo work and integration.',
      prerequisites: [], estimatedMinutes: null, access, media: [], relatedResourceIds: [],
      blocks: [{ type: 'PARAGRAPH', text: locale === 'fr' ? 'Client R demande quatre pages en français. Le logo et l’intégration restent à clarifier.' : 'Client R requests four pages in French. Logo work and integration need clarification.', url: null }],
      exercise: { instructions: locale === 'fr' ? 'Séparez les demandes confirmées de celles à clarifier.' : 'Separate confirmed requests from those needing clarification.',
        correction: locale === 'fr' ? 'Accueil, Services, À propos et Contact sont confirmés. Le logo et l’intégration ne sont pas chiffrés.' : 'Home, Services, About and Contact are confirmed. Logo work and integration have not been priced.' },
      quiz: [{ key: 'scope', prompt: locale === 'fr' ? 'Le logo est-il chiffré ?' : 'Has logo work been priced?', options: locale === 'fr' ? ['Oui', 'Non'] : ['Yes', 'No'], correctOption: 1,
        explanation: locale === 'fr' ? 'Aucun tarif n’est fourni pour le logo.' : 'No price is supplied for logo work.', points: 1 }],
      rubric: [{ key: 'fidelity', label: locale === 'fr' ? 'Les informations manquantes sont signalées.' : 'Missing information is identified.', points: 1, blocking: true }],
    },
  };
}
