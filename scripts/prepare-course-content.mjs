import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'content/course-client-proposal/v1');
const destination = join(root, '.runtime/content-course-client-proposal');
const marker = join(destination, '.generated-by');
if (existsSync(destination) && (!existsSync(marker) || readFileSync(marker, 'utf8') !== 'prepare-course-content-v1\n')) throw new Error('Répertoire de sortie existant non reconnu ; rien écrasé.');
mkdirSync(destination, { recursive: true }); writeFileSync(marker, 'prepare-course-content-v1\n');
for (const name of ['sources', 'resources']) mkdirSync(join(destination, name), { recursive: true });
const presets = JSON.parse(readFileSync(join(root, 'apps/api/src/main/resources/editorial/project-presets.json'), 'utf8'));
const goals = ['understand-brief', 'define-scope', 'prepare-prompt', 'build-proposal', 'check-output', 'reuse-method'];
const items = [], files = [], modules = [], resourcePreparation = [];
const titles = { fr: 'Du brief client à la proposition commerciale avec ChatGPT', en: 'From client brief to a clear proposal with ChatGPT' };
const fileKeys = ['br01-tr01', 'scoping-table', 'prompt-method', 'proposal-template', 'assessment-grid-br01', 'commented-solution-br01', 'br02', 'commented-solution-br02', 'presentation-emails'];
const ordinary = { m01: ['br01-tr01', 'scoping-table'], m02: ['br01-tr01', 'scoping-table'], m03: ['br01-tr01', 'prompt-method'], m04: ['br01-tr01', 'proposal-template'], m05: ['assessment-grid-br01'], m06: ['br02', 'presentation-emails', 'prompt-method'] };
const solutions = { m04: ['commented-solution-br01'], m05: ['commented-solution-br01'], m06: ['commented-solution-br02'] };
const sha = value => createHash('sha256').update(value).digest('hex');
const writeJson = (path, value) => writeFileSync(join(destination, path), JSON.stringify(value, null, 2) + '\n');
function read(path) {
  const target = realpathSync(join(source, path));
  const local = relative(realpathSync(source), target);
  if (local === '..' || local.startsWith('..' + sep)) throw new Error('Source hors du dossier éditorial.');
  return readFileSync(target, 'utf8');
}
function metadata(locale, goal) {
  const fr = locale === 'fr';
  return { goalCodes: goal ? [goal] : goals, level: 'BEGINNER', audience: [fr ? 'Indépendant ou prestataire de services sachant décrire son offre.' : 'Independent service providers who can describe their own offer.'], tools: [{ name: 'ChatGPT', url: 'https://chatgpt.com' }, { name: fr ? 'Éditeur de texte externe au choix' : 'A text editor of your choice', url: null }], sources: [{ label: 'Official OpenAI documentation · Prompting', url: 'https://learn.chatgpt.com/docs/prompting' }, { label: 'Official OpenAI documentation · Use ChatGPT', url: 'https://learn.chatgpt.com/docs/use-chatgpt' }], faq: [{ question: fr ? 'Une IA ou un correcteur humain valide-t-il mon document ?' : 'Does an AI or human reviewer validate my document?', answer: fr ? 'Non. Le générateur assemble une instruction ; les quiz sont corrigés par barème et la grille est déclarative. Les emails sont des modèles à adapter, jamais envoyés automatiquement.' : 'No. The generator assembles an instruction; quizzes use an answer key and the rubric records self-assessment. Emails are templates to adapt, never sent automatically.' }], evaluationDescription: fr ? 'Quiz à réponses expliquées et autoévaluation déclarative de la révision choisie ; aucune certification ou revue humaine.' : 'Quizzes with explained answers and self-assessment of the selected work revision; no certification or human review.' };
}
function document(locale, objective, expectedResult, blocks = []) {
  return { objective, expectedResult, prerequisites: [], blocks, estimatedMinutes: null, exercise: null, quiz: [], rubric: [], access: 'PROTECTED', media: [], relatedResourceIds: [], methodDefinition: null, quizPolicy: null, projectPolicy: null };
}
function add(key, kind, locale, value, childKeys = [], resourceFileKeys = [], solutionFileKeys = [], goal) {
  const sourceFile = `sources/${key}-${locale}.json`;
  if (Buffer.byteLength(JSON.stringify(value.document)) > 48 * 1024) throw new Error('Document CMS trop volumineux : ' + key);
  writeJson(sourceFile, value); items.push({ key, kind, locale, sourceFile, childKeys, metadata: metadata(locale, goal), resourceFileKeys, solutionFileKeys });
}
for (const locale of ['fr', 'en']) for (const key of fileKeys) {
  const authored = read(`resources/${locale}/${key}.md`);
  for (const reference of authored.matchAll(/\]\(([^)]+\.md)\)/gu)) if (!fileKeys.some(candidate => reference[1] === `${candidate}.md`)) throw new Error('Lien Markdown local inconnu : ' + reference[1]);
  const text = authored.replace(/\]\(([a-z0-9-]+)\.md\)/gu, (_match, target) => `](${target}-${locale}-v1.md)`);
  if (!text.trim() || Buffer.byteLength(text) > 1024 * 1024) throw new Error('Ressource absente ou trop volumineuse.');
  const path = `resources/${key}-${locale}-v1.md`; writeFileSync(join(destination, path), text);
  files.push({ key, locale, path, purpose: key.startsWith('commented-solution-') ? 'SOLUTION' : 'RESOURCE', sha256: sha(text) });
  resourcePreparation.push({ key, locale, source: `resources/${locale}/${key}.md`, sourceSha256: sha(authored), deliveredPath: path, deliveredSha256: sha(text), relativeMarkdownLinksAdjustedToDeliveredFilenames: authored !== text });
}
for (let index = 0; index < 6; index++) {
  const key = `m0${index + 1}`;
  for (const locale of ['fr', 'en']) {
    const data = JSON.parse(read(`${locale}/${key}.json`));
    if (data.key !== key || data.locale !== locale) throw new Error('Identité éditoriale incohérente.');
    const fr = locale === 'fr';
    const value = { ...document(locale, data.objective, data.expectedResult, data.blocks), prerequisites: data.prerequisites, exercise: data.exercise, quiz: data.quiz, access: index === 0 ? 'FREE' : 'PROTECTED', quizPolicy: { passPercent: 100, maxAttempts: null }, rubric: [{ key: 'faithful-output', label: fr ? 'Les faits fournis et les inconnues du dossier sont conservés dans mon livrable.' : 'My output preserves the supplied facts and unknowns of this case.', points: 1, blocking: false }] };
    // Non-project exercises include their feedback in the authorized lesson body.
    // M01 is complete without a project/account; M02-M03 keep their protected access.
    // Final proposal/transfer solutions remain private P09 files, never ordinary media.
    if (index < 3) value.blocks = [...value.blocks, { type: 'HEADING', text: fr ? 'Comparer après votre essai' : 'Compare after your attempt', url: null }, { type: 'PARAGRAPH', text: data.exercise.correction, url: null }];
    if (['m04', 'm05', 'm06'].includes(key)) {
      const preset = presets.find(p => p.caseCode === (key === 'm06' ? 'BR02' : 'BR01') && p.locale === locale);
      if (!preset) throw new Error('Grille serveur de référence absente.');
      value.rubric = preset.rubric; value.projectPolicy = preset.policy;
    }
    if (key === 'm03' || key === 'm06') value.blocks = [...value.blocks, { type: 'LINK', text: fr ? 'Préparer puis conserver ma méthode personnelle' : 'Prepare and keep my personal method', url: `/${locale}/${fr ? 'methodes' : 'methods'}/${fr ? 'du-brief-a-la-proposition-methode' : 'client-proposal-method'}` }];
    add(`activity-${key}`, 'ACTIVITY', locale, { slug: `${fr ? 'proposition' : 'proposal'}-${key}`, title: data.title, summary: data.summary, objectives: `Client proposal · ${key} · ${goals[index]}`, evaluationDefinition: `Preserve the case facts, explain decisions and apply the ${key === 'm06' ? 'BR02' : 'BR01'} checks.`, document: value }, [], ordinary[key], solutions[key] ?? [], goals[index]);
    const text = [data.title, data.summary, data.objective, data.expectedResult, ...data.prerequisites, ...data.blocks.map(block => block.text), data.exercise.instructions, data.exercise.correction, ...data.quiz.flatMap(question => [question.prompt, ...question.options, question.explanation])].join('\n');
    const usefulWords = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)].filter(segment => segment.isWordLike).length;
    modules.push({ key, locale, usefulWords, utf8Bytes: Buffer.byteLength(JSON.stringify(data)), countMethod: 'Intl.Segmenter; authored visible text, exercise and quiz, excluding JSON keys' });
    const parent = document(locale, data.objective, data.expectedResult, [{ type: 'PARAGRAPH', text: data.summary, url: null }]); parent.access = value.access;
    add(`module-${key}`, 'MODULE', locale, { slug: `${fr ? 'module-proposition' : 'proposal-module'}-${key}`, title: data.title, summary: data.summary, objectives: `Client proposal module · ${key} · ${goals[index]}`, evaluationDefinition: `Complete the ${key} activity and its explicit checks.`, document: parent }, [`activity-${key}`], [], [], goals[index]);
  }
}
for (const locale of ['fr', 'en']) {
  const fr = locale === 'fr';
  const d = document(locale, fr ? 'Cadrer, rédiger et contrôler une proposition à partir de faits fournis, puis transférer la méthode à BR02.' : 'Scope, draft and check a proposal using supplied facts, then transfer the method to BR02.', fr ? 'Une proposition courte, deux modèles d’email, une grille déclarative, une méthode personnelle et une réponse argumentée au second cas.' : 'A short proposal, two email templates, a self-assessment, a personal method and a reasoned response to the second case.', [{ type: 'PARAGRAPH', text: fr ? 'Les six modules développent le raisonnement, la préparation d’une instruction, la rédaction et les contrôles. M01 est une activité gratuite autonome. Les clients et montants sont fictifs. Les textes rédigés constituent le support disponible ; aucune vidéo, durée mesurée ou revue humaine n’est annoncée.' : 'Six modules develop reasoning, instruction preparation, drafting and checks. M01 is a complete free activity. Clients and prices are fictional. Written lessons are the available material; no video, measured duration or human review is claimed.', url: null }]);
  add('course-client-proposal', 'COURSE', locale, { slug: fr ? 'du-brief-a-la-proposition-commerciale' : 'client-brief-to-proposal', title: titles[locale], summary: fr ? 'Un dossier fictif, six modules développés, des ressources Markdown et des vérifications explicites pour préparer puis adapter une proposition.' : 'A fictional case, six developed modules, Markdown resources and explicit checks to prepare and adapt a proposal.', objectives: 'Prepare a factual client proposal, verify its scope, amounts and conditional schedule, and transfer the method to BR02.', evaluationDefinition: 'Explained quizzes, versioned self-reported BR01/BR02 rubrics, no automatic judgement of personal work or human review.', document: d }, ['module-m01', 'module-m02', 'module-m03', 'module-m04', 'module-m05', 'module-m06']);
  const method = document(locale, fr ? 'Préparer une instruction vérifiable à partir d’un dossier client.' : 'Prepare a verifiable instruction from a client case.', fr ? 'Une instruction modifiable puis une copie personnelle indépendante de sa source.' : 'An editable instruction and a personal copy independent of its source.', [{ type: 'PARAGRAPH', text: fr ? 'Séparez les faits, les inconnues et les conséquences avant d’assembler la demande. Utilisez le résultat dans votre propre outil, contrôlez sa réponse puis conservez vos adaptations. Aucun service IA n’est appelé par ce générateur.' : 'Separate facts, unknowns and consequences before assembling the request. Use it in your own tool, check the response and keep your adaptations. This generator calls no AI service.', url: null }]); method.access = 'FREE';
  method.methodDefinition = {
    useCases: [fr ? 'Cadrer une proposition pour une prestation de services.' : 'Scope a proposal for a service assignment.'],
    requiredInputs: [fr ? 'Brief, tarifs, capacité et contraintes réellement fournis.' : 'The brief, prices, capacity and constraints actually supplied.'],
    steps: fr ? ['Séparer faits, inconnues et conséquences.', 'Relier chaque livrable à son tarif et calculer le total.', 'Expliquer les conditions de démarrage et les demandes non chiffrées.', 'Assembler la demande puis modifier son texte si nécessaire.', 'Contrôler chaque affirmation du résultat contre le dossier.', 'Adapter au second cas et conserver sa copie personnelle.'] : ['Separate facts, unknowns and consequences.', 'Link each deliverable to its price and calculate the total.', 'Explain starting conditions and unpriced requests.', 'Assemble the request, then edit its text if needed.', 'Check every claim in the result against the case.', 'Adapt to the second case and keep your personal copy.'],
    starterInstruction: fr ? 'Prépare une proposition à partir des seules informations fournies. Distingue les faits des hypothèses ; demande les précisions nécessaires avant de promettre un coût ou une date.' : 'Prepare a proposal using only the supplied information. Separate facts from assumptions; identify what must be clarified before promising a cost or date.',
    example: fr ? 'L’intégration est évoquée sans tarif ni accès : la question porte sur le besoin, le périmètre et l’accès nécessaire. Le solde sous un plafond ne crée pas un tarif.' : 'Integration is mentioned without a price or access: ask about the need, scope and required access. Budget remaining below a ceiling does not create an agreed price.',
    checks: fr ? ['Refaire les additions hors de l’outil IA.', 'Conserver les quatre pages en français, même en interface anglaise.', 'Ne pas inventer référence, expérience ou résultat commercial.', 'BR02 exige ses propres montants et dix jours minimum, pas le calendrier BR01.'] : ['Recalculate amounts outside the AI tool.', 'Keep the four pages in French, even in the English learning version.', 'Invent no references, experience or commercial results.', 'BR02 needs its own amounts and at least ten days, not the BR01 timeline.'],
    limitations: [fr ? 'Instruction préparée, aucune réponse IA ou revue humaine produite.' : 'Instruction prepared; no AI response or human review produced.', fr ? 'Cas fictif ; les tarifs ne sont pas des prix de formation ou des recommandations de marché.' : 'Fictional case; prices are neither course prices nor market recommendations.'],
    defaults: { objective: fr ? 'Préparer une proposition commerciale fidèle à BR01/TR01.' : 'Prepare a client proposal faithful to BR01/TR01.', context: fr ? 'Client R : aménagement de bureaux pour petites entreprises, ton professionnel, simple et rassurant.' : 'Client R: office fit-out services for small businesses, professional, simple and reassuring tone.', availableData: fr ? 'BR01/TR01 : quatre pages en français, Accueil : 600 mots maximum, Services : 800, À propos : 400, Contact : 250. Tarifs EUR HT : cadrage 180 + Accueil 320 + Services 360 + À propos 220 + Contact 120 = 1 200. Plafond rédactionnel 1 400. Un cycle de retours regroupés, transmis sous 3 jours ouvrés. Quinze jours ouvrés après réception des éléments nécessaires ET validation du brief. Logo/intégration sans tarif ni périmètre confirmé ; disponibilité et validateur inconnus. Aucune ancienneté, clientèle ou performance vérifiée.' : 'BR01/TR01: pages in French: Home: 600 words maximum, Services : 800, About: 400, Contact : 250. EUR excluding tax: scoping 180 + Home 320 + Services 360 + About 220 + Contact 120 = 1 200. Copywriting ceiling 1,400. One consolidated feedback round, feedback within 3 business days. Fifteen business days after receiving required materials AND approving the brief. Logo and integration unpriced; availability and approver unconfirmed. No verified experience, customer numbers or results.', recipient: fr ? 'Client R, après validation du périmètre.' : 'Client R, after scope agreement.', format: fr ? 'Proposition de deux pages maximum : objectif, livrables, méthode, calendrier relatif, calcul, questions, prochaine étape.' : 'Proposal of at most two pages: objective, deliverables, approach, relative timeline, calculation, questions and next step.', constraints: fr ? 'Uniquement les faits fournis. Ni date ferme ni coût d’intégration inventé ; les pages restent en français.' : 'Use supplied facts only. Invent no fixed date or integration cost; the pages remain in French.', clarifications: fr ? 'Disponibilité des documents, validateur, périmètre et accès pour logo/intégration.' : 'Availability of documents, approver, scope and access for logo/integration.' },
  };
  add('method-client-proposal', 'METHOD_TEMPLATE', locale, { slug: fr ? 'du-brief-a-la-proposition-methode' : 'client-proposal-method', title: fr ? 'Du brief à la proposition : ma méthode' : 'From brief to proposal: my method', summary: fr ? 'Séquence, paramètres, instruction et contrôles à adapter puis conserver.' : 'A sequence, parameters, instruction and checks to adapt and keep.', objectives: 'Prepare, verify and adapt a proposal instruction without inventing missing facts.', evaluationDefinition: 'Personal method copied independently; no AI execution or competence validation.', document: method }, [], ['prompt-method'], [], 'prepare-prompt');
}
writeJson('manifest.json', { schemaVersion: 1, namespace: 'course-client-proposal', items, files });
writeJson('preparation.json', { schemaVersion: 1, sourceDirectory: 'content/course-client-proposal/v1', resourcePreparation, modules, comparisonFeedbackInLessonBody: ['m01', 'm02', 'm03'], mediaProduced: [], humanReviewClaimed: false, publishedByThisCommand: false });
console.log(JSON.stringify({ prepared: true, directory: relative(root, destination).replaceAll('\\', '/'), identities: new Set(items.map(item => item.key)).size, translations: items.length, files: files.length, modules, publicationStateRequested: 'DRAFT', commercialActivationRequested: false }));
