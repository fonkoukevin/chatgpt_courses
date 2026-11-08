import type { Locale } from "@/lib/i18n/locales";

// Fictional, read-only P02 fixtures. They are never imported by a business API.
export const proposalFixture = {
  fr: {
    title: "Du brief client à la proposition commerciale avec ChatGPT",
    description: "Un dossier fictif pour cadrer une demande, préparer un document et contrôler les engagements.",
    facts: [
      { fact: "Quatre pages en français : Accueil, Services, À propos et Contact.", consequence: "Nommer les quatre livrables et respecter leurs limites de longueur." },
      { fact: "Les textes existants et les informations sur les services seront fournis.", consequence: "Confirmer leur disponibilité avant de fixer le démarrage." },
      { fact: "Le logo et l’intégration au site sont évoqués sans périmètre confirmé.", consequence: "Les traiter comme des questions à clarifier, sans engagement implicite." },
    ],
    provided: ["Une demande de réécriture de quatre pages", "Un ton professionnel, simple et rassurant", "Des retours centralisés par le client"],
    missing: ["La date de disponibilité des textes", "Le périmètre du logo et de l’intégration", "La personne chargée de la validation"],
    rubric: [
      { id: "scope", label: "Le périmètre des quatre pages est explicite.", description: "Les demandes ambiguës restent à confirmer.", blocking: true },
      { id: "facts", label: "Aucun fait ni résultat commercial n’est inventé.", blocking: true },
      { id: "start", label: "Le démarrage dépend des éléments reçus et du brief validé." },
      { id: "next", label: "La prochaine étape permet de confirmer le périmètre." },
    ],
    answer: "La prestation couvre la réécriture des pages Accueil, Services, À propos et Contact, dans leurs limites de longueur. Les textes seront remis dans un document éditable. Le démarrage reste conditionné à la réception des éléments nécessaires et à la validation du brief. Le logo et l’intégration au site doivent être clarifiés séparément. La prochaine étape est de confirmer le périmètre et la disponibilité des documents.",
    method: { objective: "Préparer une proposition commerciale vérifiable", context: "Client R souhaite clarifier ses services d’aménagement de bureaux.", data: "Quatre pages en français. Logo et intégration à clarifier. Aucun résultat commercial vérifié fourni.", audience: "La personne qui valide le périmètre chez Client R", format: "Objectif, livrables, conditions de démarrage, questions et prochaine étape", constraints: "Utiliser uniquement les faits fournis. Ne pas inventer de prix, de date ou d’engagement." },
  },
  en: {
    title: "From client brief to a clear proposal with ChatGPT",
    description: "A fictional case to frame a request, prepare a document and check its commitments.",
    facts: [
      { fact: "Four pages in French: Home, Services, About and Contact.", consequence: "Name all four deliverables and respect their word limits." },
      { fact: "The existing texts and service information will be supplied.", consequence: "Confirm their availability before agreeing on a start date." },
      { fact: "Logo work and website integration are mentioned without an agreed scope.", consequence: "Treat them as open questions, without implied commitments." },
    ],
    provided: ["A request to rewrite four pages", "A professional, simple and reassuring tone", "Feedback consolidated by the client"],
    missing: ["When the texts will be available", "The scope of logo work and website integration", "Who will approve the work"],
    rubric: [
      { id: "scope", label: "The scope of all four pages is explicit.", description: "Unclear requests remain subject to confirmation.", blocking: true },
      { id: "facts", label: "No fact or commercial result has been invented.", blocking: true },
      { id: "start", label: "Starting work depends on receiving the materials and approving the brief." },
      { id: "next", label: "The next step allows the scope to be agreed." },
    ],
    answer: "The assignment covers rewriting the Home, Services, About and Contact pages in French, within their word limits. The text will be delivered in an editable document. Work can start once the required materials have been received and the brief approved. Logo work and website integration need separate clarification. The next step is to agree on the scope and confirm when the documents will be available.",
    method: { objective: "Prepare a verifiable client proposal", context: "Client R wants to clarify its office fit-out services.", data: "Four pages in French. Logo work and website integration need clarification. No verified commercial results supplied.", audience: "The person approving the scope at Client R", format: "Objective, deliverables, starting conditions, questions and next step", constraints: "Use only supplied facts. Invent no price, date or commitment." },
  },
} satisfies Record<Locale, unknown>;

export type EditorialState = "draft" | "review" | "ready" | "archived";
export type ContentType = "course" | "activity" | "guide" | "method";
export type ContentFixture = { id: string; title: Record<Locale, string>; type: ContentType; state: EditorialState; revision: number };
export const contentFixtures: ContentFixture[] = [
  { id: "course-client-proposal", title: { fr: "Du brief à la proposition commerciale", en: "From brief to client proposal" }, type: "course", state: "draft", revision: 2 },
  { id: "activity-understand-brief", title: { fr: "Repérer les faits et les inconnues", en: "Identify facts and unknowns" }, type: "activity", state: "review", revision: 3 },
  { id: "method-check-commitments", title: { fr: "Vérifier les engagements du document", en: "Check the document’s commitments" }, type: "method", state: "ready", revision: 1 },
  { id: "guide-clear-request", title: { fr: "Formuler une demande précise", en: "Write a precise request" }, type: "guide", state: "draft", revision: 1 },
];
