import type { MethodDefinition, MethodParameters } from '../../apps/web/src/lib/api/generated/types.gen';

export function br01Parameters(locale: 'fr' | 'en'): MethodParameters {
  return locale === 'fr'
    ? { objective: 'Préparer une proposition commerciale factuelle.', context: 'Client R souhaite clarifier son offre.', availableData: 'BR01 : quatre pages en français ; le logo et l’intégration restent à clarifier.', recipient: 'Client R', format: 'Deux pages maximum et des questions ouvertes.', constraints: 'Ne pas inventer de faits, de références ou de prix.', clarifications: 'Disponibilité des textes, logo et intégration.' }
    : { objective: 'Prepare a factual client proposal.', context: 'Client R wants to clarify the offer.', availableData: 'BR01: four pages in French; logo work and integration need clarification.', recipient: 'Client R', format: 'No more than two pages and open questions.', constraints: 'Do not invent facts, references or prices.', clarifications: 'Availability of text, logo work and integration.' };
}

export function br01MethodDefinition(locale: 'fr' | 'en'): MethodDefinition {
  return { useCases: [locale === 'fr' ? 'Clarifier un brief avant une proposition.' : 'Clarify a brief before preparing a proposal.'],
    requiredInputs: [locale === 'fr' ? 'Le brief fictif BR01 et les faits réellement fournis.' : 'The fictional BR01 brief and the facts actually provided.'],
    steps: [locale === 'fr' ? 'Séparer les faits, inconnues et décisions à confirmer.' : 'Separate facts, unknowns and decisions to confirm.'],
    starterInstruction: locale === 'fr' ? 'Prépare une proposition à partir des seules données fournies. Distingue faits et hypothèses.' : 'Prepare a proposal using only the supplied information. Distinguish facts and assumptions.',
    example: locale === 'fr' ? 'Accueil, Services, À propos et Contact sont demandés en français. Le logo et l’intégration ne disposent pas de tarif.' : 'Home, Services, About and Contact are requested in French. Logo work and integration have no supplied price.',
    checks: [locale === 'fr' ? 'Vérifier chaque engagement et chaque information manquante.' : 'Check each commitment and each missing piece of information.'],
    limitations: [locale === 'fr' ? 'Ce générateur prépare un texte et n’exécute aucune IA.' : 'This generator prepares text and does not run an AI.'], defaults: br01Parameters(locale) };
}
