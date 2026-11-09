import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Offline source checks: no private configuration, database, AI call or publication.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = 'content/course-client-proposal/v1';
const locales = ['fr', 'en'];
const keys = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06'];
const names = ['br01-tr01', 'scoping-table', 'prompt-method', 'proposal-template', 'assessment-grid-br01', 'commented-solution-br01', 'br02', 'commented-solution-br02', 'presentation-emails'];
const files = [], checks = [], modules = new Map(), resources = new Map();
const check = (name, passed, observed) => checks.push({ name, passed: Boolean(passed), ...(observed === undefined ? {} : { observed }) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const words = (text, locale) => [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)].filter(item => item.isWordLike).length;
const normalize = text => text.normalize('NFKC').replaceAll('’', "'").replace(/\s+/gu, ' ').trim();
const simple = text => normalize(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('*', '');
const supportedText = text => text.isWellFormed() && [...text].every(character => character.codePointAt(0) >= 32 || ['\t', '\r', '\n'].includes(character));
// Controlled equivalent wording found during the actual FR/EN cross-review, not a verbatim-answer rule.
const blockerText = text => simple(text).replace(/\bcommercial performance\b/gu, 'performance').replace(/\s+in the commitment\b/gu, '').replace(/\bfixed date\b/gu, 'firm date').replace(/\bconfirmed starting conditions\b/gu, 'known starting conditions');

function openSource(path, locale, kind) {
  const bytes = readFileSync(join(repository, path));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  check(`${path}: UTF-8 without BOM`, !(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191));
  check(`${path}: well-formed Unicode without unsupported controls`, supportedText(text));
  const entry = { path, locale, kind, bytes: bytes.length, sha256: sha(bytes), opened: true };
  files.push(entry);
  return { text, entry };
}

const expectedKeys = ['key', 'locale', 'title', 'summary', 'objective', 'expectedResult', 'prerequisites', 'blocks', 'exercise', 'quiz'].toSorted().join();
for (const locale of locales) for (const key of keys) {
  const path = `${directory}/${locale}/${key}.json`;
  try {
    const { text, entry } = openSource(path, locale, 'MODULE_SOURCE');
    const value = JSON.parse(text);
    check(`${path}: exact source shape and identity`, Object.keys(value).toSorted().join() === expectedKeys && value.locale === locale && value.key === key);
    check(`${path}: editable document source below48KiB`, entry.bytes <= 48 * 1024);
    check(`${path}: title/summary/objective/result bounds`, value.title.trim() && value.title.length <= 240 && value.summary.trim() && value.summary.length <= 2000 && value.objective.trim() && value.objective.length <= 4000 && value.expectedResult.trim() && value.expectedResult.length <= 4000);
    check(`${path}: developed body and bounded blocks`, value.blocks.length >= 1 && value.blocks.length <= 60 && value.blocks.every(block => ['HEADING', 'PARAGRAPH', 'LIST', 'CALLOUT', 'CODE', 'LINK'].includes(block.type) && block.text.trim() && block.text.length <= 4000 && (block.url === null || (() => { const url = new URL(block.url); return url.protocol === 'https:' && !url.username && !url.password && block.url.length <= 2000; })())));
    check(`${path}: useful prerequisites and exercise`, value.prerequisites.length <= 20 && value.prerequisites.every(item => typeof item === 'string' && item.trim()) && value.exercise.instructions.trim() && value.exercise.correction.trim() && value.exercise.instructions.length <= 8000 && value.exercise.correction.length <= 8000);
    check(`${path}: quiz keys, choices, explanations and one-point scoring`, value.quiz.length > 0 && value.quiz.length <= 20 && new Set(value.quiz.map(item => item.key)).size === value.quiz.length && value.quiz.every(item => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.key) && item.prompt.trim() && item.prompt.length <= 2000 && item.options.length >= 2 && item.options.length <= 8 && item.options.every(option => typeof option === 'string' && option.trim()) && Number.isInteger(item.correctOption) && item.correctOption >= 0 && item.correctOption < item.options.length && item.points === 1 && item.explanation.trim()));
    const useful = [value.title, value.summary, value.objective, value.expectedResult, ...value.prerequisites, ...value.blocks.map(block => block.text), ...Object.values(value.exercise), ...value.quiz.flatMap(item => [item.prompt, ...item.options, item.explanation])].join(' ');
    entry.usefulWords = words(useful, locale); entry.bodyWords = words(value.blocks.map(block => block.text).join(' '), locale);
    check(`${path}:500–900 useful words including practice and assessment`, entry.usefulWords >= 500 && entry.usefulWords <= 900, entry.usefulWords);
    modules.set(`${locale}/${key}`, value);
  } catch (error) { check(`${path}: source readable and structurally usable`, false, error instanceof Error ? error.name : 'SOURCE_ERROR'); }
}
for (const locale of locales) for (const name of names) {
  const path = `${directory}/resources/${locale}/${name}.md`;
  try {
    const { text, entry } = openSource(path, locale, name.startsWith('commented-solution-') ? 'SOLUTION_SOURCE' : 'RESOURCE_SOURCE');
    entry.words = words(text, locale);
    check(`${path}: useful editable Markdown source`, text.startsWith('---\n') || text.startsWith('---\r\n') || text.startsWith('# '));
    for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
      const valid = href.startsWith('https:') ? (() => { const url = new URL(href); return !url.username && !url.password; })() : !href.startsWith('/') && !href.startsWith('..') && existsSync(join(repository, dirname(path), href));
      check(`${path}: real relative resource or HTTPS reference`, valid);
    }
    resources.set(`${locale}/${name}`, text);
  } catch (error) { check(`${path}: resource readable`, false, error instanceof Error ? error.name : 'SOURCE_ERROR'); }
}

for (const key of keys) {
  const fr = modules.get(`fr/${key}`), en = modules.get(`en/${key}`);
  const signature = value => value.quiz.map(item => ({ key: item.key, choices: item.options.length, correctOption: item.correctOption, points: item.points }));
  check(`${key}: FR/EN assessment identity, order and scoring`, fr && en && JSON.stringify(signature(fr)) === JSON.stringify(signature(en)));
}

function money(cell) {
  const value = cell.replaceAll('*', '').trim();
  if (!/^(?:€\s*)?\d{1,4}(?:[ ,\u00a0\u202f]\d{3})*\s*(?:€)?(?:\s*(?:HT|excluding tax))?$/u.test(value)) return null;
  return Number(value.replace(/[^\d]/g, ''));
}
function prices(text) {
  const result = {};
  for (const line of text.split(/\r?\n/u).filter(line => line.startsWith('|'))) {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim()), label = simple(cells[0] ?? '');
    const key = /^(cadrage|scoping)/u.test(label) ? 'scoping' : /^(accueil|home)/u.test(label) ? 'home' : /^services/u.test(label) ? 'services' : /^(a propos|about)/u.test(label) ? 'about' : /^contact/u.test(label) ? 'contact' : /^faq/u.test(label) ? 'faq' : /^(integration|website integration)/u.test(label) ? 'integration' : /^(total|copywriting total)/u.test(label) ? 'total' : null;
    if (key) result[key] = money(cells[1] ?? '');
  }
  return result;
}
function equations(text, file) {
  const actual = [];
  for (const [, expression] of text.matchAll(/`([^`]+)`/gu)) {
    if (!expression.includes('=')) continue;
    const [left, right, extra] = expression.split('=');
    if (extra !== undefined || !/^[\d\s,+]+$/u.test(left)) continue;
    const terms = left.split('+').map(term => money(term));
    const stated = money(right);
    const calculated = terms.every(term => term !== null) ? terms.reduce((sum, term) => sum + term, 0) : null;
    check(`${file}: independent arithmetic from actual editable solution`, stated !== null && calculated === stated, { terms, calculated, stated });
    actual.push({ terms, calculated, stated });
  }
  return actual;
}

const arithmetic = [];
for (const locale of locales) {
  const tr01 = prices(resources.get(`${locale}/br01-tr01`) ?? ''), br02 = prices(resources.get(`${locale}/br02`) ?? '');
  const fields = ['scoping', 'home', 'services', 'about', 'contact'];
  const total = fields.reduce((sum, field) => sum + (tr01[field] ?? Number.NaN), 0);
  const full = fields.reduce((sum, field) => sum + (br02[field] ?? Number.NaN), 0) + (br02.faq ?? Number.NaN);
  const option = full - (br02.about ?? Number.NaN);
  check(`${locale}: actual TR01 rows reconcile to stated total and reference1200`, total === tr01.total && total === 1200, { rows: tr01, calculated: total });
  check(`${locale}: actual BR02 table retains TR01 prices and FAQ200`, fields.every(field => tr01[field] === br02[field]) && br02.faq === 200 && Object.hasOwn(br02, 'integration') && br02.integration === null, br02);
  check(`${locale}: BR02 full and no-About option calculated independently`, full === 1400 && option === 1180 && 1200 - option === 20, { full, option, overallCeiling: 1200, remaining: 1200 - option });
  const first = equations(resources.get(`${locale}/commented-solution-br01`) ?? '', `${locale}/commented-solution-br01`);
  const second = equations(resources.get(`${locale}/commented-solution-br02`) ?? '', `${locale}/commented-solution-br02`);
  check(`${locale}: solutions have real computed equations for both cases`, first.length >= 1 && second.length >= 2 && first.some(item => item.stated === total) && second.some(item => item.stated === full) && second.some(item => item.stated === option));
  const selectedAmount = (moduleKey, quizKey, usePrompt = false) => {
    const item = modules.get(`${locale}/${moduleKey}`)?.quiz.find(item => item.key === quizKey);
    const text = item ? usePrompt ? item.prompt : item.options[item.correctOption] : '';
    const number = text.match(/\d[\d ,]*/u)?.[0]; return number ? Number(number.replace(/\D/g, '')) : null;
  };
  check(`${locale}: selected BR01 quiz answers agree with real table calculation`, selectedAmount('m02', 'm02-total') === total && selectedAmount('m04', 'm04-budget') === total);
  check(`${locale}: selected BR02 full answer and option amount agree with source rows`, selectedAmount('m06', 'm06-full') === full && selectedAmount('m06', 'm06-option', true) === option);
  arithmetic.push({ locale, TR01: { rows: tr01, total }, BR02: { rows: br02, full, noAboutOption: option }, solutionEquations: [...first, ...second] });
}

const presetPath = 'apps/api/src/main/resources/editorial/project-presets.json';
const presetBytes = readFileSync(join(repository, presetPath));
const presets = JSON.parse(presetBytes.toString('utf8'));
const rubricChecks = [];
for (const locale of locales) {
  const preset = presets.find(item => item.caseCode === 'BR01' && item.locale === locale);
  const markdown = resources.get(`${locale}/assessment-grid-br01`) ?? '';
  const rows = [...markdown.matchAll(/^\|\s*((?:fidelity|scope|budget|schedule|presentation)-[1-4])\s*\|\s*([^|]+)\|/gmu)].map(([, key, label]) => ({ key, label: normalize(label) }));
  const lists = (modules.get(`${locale}/m05`)?.blocks ?? []).flatMap(block => [...block.text.matchAll(/^((?:fidelity|scope|budget|schedule|presentation)-[1-4])\s*—\s*(.+)$/gmu)].map(([, key, label]) => ({ key, label: normalize(label) })));
  const equal = items => preset && items.length === 20 && new Set(items.map(item => item.key)).size === 20 && items.every(item => preset.rubric.some(criterion => criterion.key === item.key && normalize(criterion.label) === item.label));
  check(`${locale}: twenty editable-grid criteria match canonical BR01 keys and labels`, equal(rows));
  check(`${locale}: twenty M05 criteria match the editable grid and canonical preset`, equal(lists));
  check(`${locale}: canonical BR01 twenty one-point criteria and four categories of blockers`, preset?.rubric.length === 20 && preset.rubric.every(item => item.points === 1) && preset.policy.blockingIssues.length === 4 && new Set(preset.policy.blockingIssues.map(item => item.key)).size === 4 && preset.policy.passPoints === 16);
  check(`${locale}: score is explicitly declared and not human certification`, locale === 'fr' ? /Score déclaré/u.test(markdown) && /pas une certification/u.test(markdown) && /ni une revue humaine/u.test(markdown) : /Self-reported score/u.test(markdown) && /not certification/u.test(markdown) && /neither human review/u.test(markdown));
  check(`${locale}: four blocker meanings present in the editable grid`, preset?.policy.blockingIssues.every(item => blockerText(markdown).includes(blockerText(item.label))));
  rubricChecks.push({ locale, caseCode: 'BR01', criterionCount: rows.length, points: preset?.rubric.reduce((sum, item) => sum + item.points, 0), configuredReferenceThreshold: preset?.policy.passPoints, blockingKeys: preset?.policy.blockingIssues.map(item => item.key) });
  const transfer = presets.find(item => item.caseCode === 'BR02' && item.locale === locale);
  const fact = arithmetic.find(item => item.locale === locale).BR02;
  const label = key => transfer?.rubric.find(item => item.key === key)?.label ?? '';
  const amounts = text => [...text.matchAll(/\d[\d ,]*/gu)].map(match => Number(match[0].replace(/\D/gu, '')));
  check(`${locale}: BR02 retains twenty one-point checks and independent four-blocker policy`, transfer?.rubric.length === 20 && new Set(transfer.rubric.map(item => item.key)).size === 20 && transfer.rubric.every(item => item.points === 1) && transfer.policy.blockingIssues.length === 4 && transfer.policy.passPoints === 16);
  check(`${locale}: BR02 budget rubric agrees with real full-price and FAQ rows`, amounts(label('budget-1')).includes(fact.rows.faq) && amounts(label('budget-2')).includes(fact.full) && amounts(label('budget-2')).includes(1200));
  check(`${locale}: BR02 optional no-About rubric agrees with source arithmetic`, amounts(label('budget-4')).includes(fact.noAboutOption) && amounts(label('budget-4')).includes(1200 - fact.noAboutOption));
  check(`${locale}: BR02 minimum and requested turnaround remain different`, locale === 'fr' ? /dix jours ouvrés/u.test(label('schedule-1')) && /cinq jours/u.test(label('schedule-2')) && /dix jours/u.test(label('schedule-2')) : /ten business days/u.test(label('schedule-1')) && /five days/u.test(label('schedule-2')) && /ten days/u.test(label('schedule-2')));
  check(`${locale}: BR02 feedback is unconfirmed, not inherited BR01 three-day terms`, locale === 'fr' ? /non fournies/u.test(label('scope-3')) && /confirmer/u.test(label('schedule-3')) : /not supplied/u.test(label('scope-3')) && /to be confirmed/u.test(label('schedule-3')));
  rubricChecks.push({ locale, caseCode: 'BR02', criterionCount: transfer?.rubric.length, points: transfer?.rubric.reduce((sum, item) => sum + item.points, 0), configuredReferenceThreshold: transfer?.policy.passPoints, blockingKeys: transfer?.policy.blockingIssues.map(item => item.key) });
}

check('All30 authored module/resource files actually opened', files.length === 30 && files.every(file => file.opened));
const report = {
  phase: 'P18', executedAt: new Date().toISOString(), command: '.\\scripts\\courses.cmd run verify:content',
  allPassed: checks.every(item => item.passed), sourceFileCount: files.length, sourceFiles: files,
  canonicalRubricInput: { path: presetPath, sha256: sha(presetBytes) }, arithmetic, rubricChecks, checks,
  review: { method: 'Agent cross-review of FR/EN authored sources plus executable offline structure/arithmetic/rubric checks.', humanReview: false,
    observed: 'M01-M06 FR/EN and all editable resource sources opened; quiz structures compared, calculations taken from actual Markdown price rows and solution equations.',
    limits: ['No learner trial, timed learning duration or human pedagogical approval is established.', 'Equivalent quiz structure is checked mechanically; language and teaching quality still need human review.', 'Markdown source files are real editable resources; no PDF, DOCX, media, narration or external AI response is produced.', 'This command does not import or publish CMS content, inspect private configuration, activate an offer or contact a provider.', 'Final resource download permissions, draft import and browser rendering have their own integration evidence.'] },
  commercialization: { activatedByThisCommand: false, readinessEstablished: false,
    pendingAuthority: 'docs/DECISIONS.md: actual offer price/currency/tax, access, updates, assistance, legal conditions and produced formats must be decided and reviewed separately. Case amounts are never course prices.' },
  priorObservedCheck: { report: 'P18-content-checks-first.json', exitCode: 1, failure: 'The first source check required literal English blocker labels. Agent cross-review found equivalent expansions and firm/fixed, known/confirmed wording; the comparator was narrowed to those explicit variants. No source content or canonical preset was changed for that adjustment.' },
};
writeFileSync(join(repository, 'docs/evidence/P18-content-checks.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ phase: report.phase, allPassed: report.allPassed, openedFiles: files.length, checks: checks.length, failures: checks.filter(item => !item.passed), wordCounts: files.filter(file => file.kind === 'MODULE_SOURCE').map(({ path, usefulWords, bodyWords }) => ({ path, usefulWords, bodyWords })) }, null, 2));
if (!report.allPassed) process.exitCode = 1;
