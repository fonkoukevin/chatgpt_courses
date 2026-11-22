import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Render the actual quiz components. These checks cover presentation and initial
// actions, not an interactive browser or a Spring persistence integration.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
after(() => { Module._resolveFilename = originalResolve; for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { QuizResult, ActivityQuiz, QuizHistory } = require(resolve(sources, 'components/learning/quiz.tsx'));
const { getActivityQuizDictionary } = require(resolve(sources, 'lib/i18n/activity-quiz.ts'));
const { getLearningDictionary } = require(resolve(sources, 'lib/i18n/learning.ts'));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const boundary = { capture: () => 0, isCurrent: () => true, isPrivacyExit: () => false, fail: () => { throw new Error('No mutation or private read may run while rendering.'); } };
const anonymous = { status: 'anonymous', accountId: null, error: null }, active = { status: 'active', accountId: uuid(1), error: null };
function grade(locale = 'fr', passed = true) {
  return { activityId: uuid(2), activityVersionId: uuid(3), revisionId: uuid(4), locale, scorePoints: passed ? 3 : 1, maxPoints: 3, passed,
    policy: { passPercent: 75, maxAttempts: 2 }, results: [
      { key: 'facts', prompt: 'Synthetic question one', options: ['Supplied fact', 'Invented commitment'], selectedOption: passed ? 0 : 1, correctOption: 0, correct: passed, explanation: 'FIRST_EXPLANATION: keep only supplied facts.', points: 2, awardedPoints: passed ? 2 : 0 },
      { key: 'unknowns', prompt: 'Synthetic question two', options: ['Ask a question', 'Invent a deadline'], selectedOption: 0, correctOption: 0, correct: true, explanation: 'LAST_EXPLANATION: keep the unknown explicit.', points: 1, awardedPoints: 1 },
    ] };
}
function resource(locale = 'fr') {
  const value = grade(locale);
  return { resourceId: value.activityId, versionId: value.activityVersionId, revisionId: value.revisionId, locale,
    document: { quiz: value.results.map(({ key, prompt, options, points }) => ({ key, prompt, options, points })), quizPolicy: value.policy } };
}
const quizProps = (locale, overrides = {}) => ({ locale, resource: resource(locale), account: anonymous, boundary, available: true, ...overrides });

test('quiz feedback presents each answer and its explanation before the global score and conservation state', () => {
  for (const locale of ['fr', 'en']) for (const passed of [true, false]) {
    const value = grade(locale, passed), output = render(QuizResult, { locale, value }), t = getLearningDictionary(locale), copy = getActivityQuizDictionary(locale);
    assert.ok(output.includes(html(copy.feedback)) && output.includes(html(value.results[0].prompt)));
    const answers = output.indexOf('data-quiz-answers'), first = output.indexOf(value.results[0].explanation), last = output.indexOf(value.results[1].explanation);
    const summary = output.indexOf('data-quiz-summary'), conservation = output.indexOf('data-quiz-conservation');
    assert.ok(answers < first && first < last && last < summary && summary < conservation);
    assert.ok(output.indexOf(html(t.yourAnswer)) < first && output.indexOf(html(t.correctAnswer)) < first);
    assert.ok(output.indexOf(html(t.score)) > last && output.indexOf(html(passed ? t.quizPassed : t.quizNotPassed)) > last);
    assert.ok(output.includes(`${value.scorePoints} / ${value.maxPoints}`) && output.includes('75%'));
    assert.ok(output.includes(html(t.distinctEvidence)), 'A quiz result must not become a skill or project validation.');
  }
});

test('formative feedback stays on this page and offers no recovery or saved-attempt claim after sign-in', () => {
  for (const locale of ['fr', 'en']) {
    const output = render(QuizResult, { locale, value: grade(locale) }), t = getLearningDictionary(locale), copy = getActivityQuizDictionary(locale);
    assert.ok(output.includes('data-learning-quiz-result="formative"') && output.includes('data-quiz-conservation="page"'));
    assert.ok(output.includes(html(t.formativeResult)) && output.includes(html(t.formativeHelp)) && output.includes(html(copy.pageOnly)));
    assert.ok(!output.includes(html(copy.saved)) && !output.includes(html(t.attemptedAt)));
    assert.doesNotMatch(output, /<a\b|<form\b|data-quiz-conservation="saved"/);
  }
});

test('a saved historical attempt preserves its original question language, score and server-confirmed conservation under another interface language', () => {
  const value = { ...grade('fr', false), id: uuid(8), submissionId: uuid(9), enrollmentId: uuid(10), attemptNumber: 2, submittedAt: '2026-11-08T00:01:00Z' };
  const output = render(QuizResult, { locale: 'en', value }), t = getLearningDictionary('en'), copy = getActivityQuizDictionary('en');
  assert.match(output, /data-learning-quiz-result="attempt"[^>]*lang="en"/);
  assert.match(output, /<h4[^>]*lang="fr"[^>]*>Synthetic question one<\/h4>/);
  assert.match(output, /<span lang="fr">FIRST_EXPLANATION:/);
  assert.ok(output.includes('data-quiz-conservation="saved"') && output.includes(html(copy.saved)) && output.includes(html(t.attemptedAt)));
  assert.ok(output.includes('1 / 3') && output.includes('FR') && output.includes('UTC'));
  assert.ok(!output.includes(html(copy.pageOnly)) && !output.includes(html(t.formativeHelp)));
});

test('guests and accounts without an enrollment can check without saving; an enrolled account submits a durable attempt', () => {
  for (const locale of ['fr', 'en']) {
    const t = getLearningDictionary(locale);
    for (const account of [anonymous, active]) {
      const output = render(ActivityQuiz, quizProps(locale, { account }));
      assert.ok(output.includes(html(t.quizAnonymous)) && output.includes(html(t.checkQuiz)) && output.includes(html(t.copyAnswers)));
      assert.ok(!output.includes(html(t.submitQuiz)) && !output.includes(html(t.attemptsRemaining)));
      assert.equal((output.match(/<fieldset\b/g) ?? []).length, 2);
    }
    const output = render(ActivityQuiz, quizProps(locale, { account: active, enrollmentId: uuid(10), overview: { policy: grade(locale).policy, attemptsUsed: 1, attemptsRemaining: 1, latestAttemptId: null, passed: false } }));
    assert.ok(output.includes(html(t.submitQuiz)) && output.includes(html(t.attemptsRemaining)));
    assert.ok(!output.includes(html(t.quizAnonymous)) && !output.includes(html(t.checkQuiz)));
  }
});

test('an exhausted durable quota removes submission and expired or changed accounts remain blocked while copying stays available', () => {
  for (const locale of ['fr', 'en']) {
    const t = getLearningDictionary(locale), exhausted = render(ActivityQuiz, quizProps(locale, { account: active, enrollmentId: uuid(10), overview: { policy: grade(locale).policy, attemptsUsed: 2, attemptsRemaining: 0, latestAttemptId: uuid(8), passed: false } }));
    assert.ok(exhausted.includes(html(t.noMoreAttempts)) && exhausted.includes(html(t.copyAnswers))); assert.doesNotMatch(exhausted, /<button[^>]*type="submit"/);
    for (const overrides of [{ account: { ...active, status: 'expired' } }, { account: { ...active, status: 'changed' } }, { available: false }]) {
      const output = render(ActivityQuiz, quizProps(locale, overrides));
      const submit = [...output.matchAll(/<button\b[^>]*>/g)].find(([tag]) => /type="submit"/.test(tag))?.[0];
      assert.ok(submit && /disabled=""/.test(submit));
      const radios = [...output.matchAll(/<button\b[^>]*role="radio"[^>]*>/g)]; assert.equal(radios.length, 4); assert.ok(radios.every(([tag]) => /disabled=""/.test(tag)));
      const copy = [...output.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , body]) => body.includes(html(t.copyAnswers)));
      assert.ok(copy && !/disabled=/.test(copy[1]));
    }
  }
});

test('hidden quiz content and inactive private history render nothing instead of leaking questions or prior attempts', () => {
  assert.equal(render(ActivityQuiz, quizProps('fr', { contentVisible: false })), '');
  for (const account of [anonymous, { ...active, status: 'changed' }, { ...active, status: 'expired' }]) assert.equal(render(QuizHistory, { locale: 'fr', activityVersionId: uuid(3), account, boundary }), '');
});
