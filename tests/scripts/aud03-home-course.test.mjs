import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const original = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
};
after(() => { if (original) Module._extensions['.ts'] = original; else delete Module._extensions['.ts']; });
const { resolveHomeCourse, singleHomeCourseCard } = require(resolve(sources, 'lib/public/home-course.ts'));
const success = data => ({ ok: true, data, status: 200 }), failure = { ok: false, error: { kind: 'unavailable' } };
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const activity = (number, overrides = {}) => ({ resourceId: uuid(number), versionId: uuid(number + 100), revisionId: uuid(number + 200), versionNumber: 1,
  kind: 'ACTIVITY', locale: 'fr', slug: `lesson-${number}`, availability: 'PUBLISHED', title: `Lesson ${number}`, summary: 'Public lesson summary', access: 'FREE', estimatedMinutes: null, children: [], ...overrides });
const module = (children, overrides = {}) => ({ ...activity(20), kind: 'MODULE', title: 'Read the case', children, ...overrides });
const card = (overrides = {}) => ({ resourceId: uuid(1), versionId: uuid(2), revisionId: uuid(3), versionNumber: 1, locale: 'fr', kind: 'COURSE', slug: 'first-course',
  title: 'First course', summary: 'Public course summary', objective: 'Clarify a brief', expectedResult: 'A checked proposal', estimatedMinutes: null, access: 'PROTECTED', goalCodes: ['understand-brief'], level: 'BEGINNER', reviewedAt: null, ...overrides });
const catalogue = (overrides = {}) => success({ items: [card()], page: 0, pageSize: 2, total: 1, ...overrides });
const detail = (overrides = {}) => ({ ...card(), availability: 'PUBLISHED', document: null, metadata: { audience: ['Service providers'], goalCodes: ['understand-brief'], level: 'BEGINNER', tools: [], sources: [], faq: [], evaluationDescription: null },
  prerequisites: ['Read a brief'], languages: [{ locale: 'fr', slug: 'first-course', status: 'PUBLISHED' }], curriculum: [module([activity(4), activity(5)])], related: [], ...overrides });

test('one selected course resolves its first free curriculum activity with exact course and activity versions', () => {
  const focused = resolveHomeCourse('fr', catalogue(), success(detail()));
  assert.equal(focused.title, 'First course');
  assert.equal(focused.href, `/fr/parcours/first-course?version=${uuid(2)}`);
  const trial = new URL(focused.trial.href, 'https://courses.invalid');
  assert.equal(trial.pathname, '/fr/apprendre/first-course/lesson-4');
  assert.equal(trial.searchParams.get('resource'), uuid(4));
  assert.equal(trial.searchParams.get('version'), uuid(104));
  assert.equal(trial.searchParams.get('courseVersion'), uuid(2));
  assert.equal(focused.trial.title, 'Lesson 4');
  assert.deepEqual(focused.modules, [{ title: 'Read the case', summary: 'Public lesson summary' }]);
});

test('zero, several, partial, failed and wrong-language course results never imply one featured course', () => {
  for (const result of [failure, catalogue({ total: 0, items: [] }), catalogue({ total: 2, items: [card()] }), catalogue({ total: 1, items: [] }),
    catalogue({ page: 1 }), catalogue({ items: [card(), card()] }), catalogue({ items: [card({ kind: 'GUIDE' })] }), catalogue({ items: [card({ locale: 'en' })] })]) {
    assert.equal(singleHomeCourseCard('fr', result), null);
    assert.equal(resolveHomeCourse('fr', result, success(detail())), null);
  }
});

test('a failed, withdrawn, stale or changed detail cannot promote a stale course card', () => {
  assert.equal(resolveHomeCourse('fr', catalogue()), null);
  assert.equal(resolveHomeCourse('fr', catalogue(), failure), null);
  for (const changes of [{ availability: 'WITHDRAWN' }, { availability: 'STALE' }, { availability: 'MISSING_TRANSLATION' }, { kind: 'GUIDE' },
    { resourceId: uuid(80) }, { versionId: uuid(81) }, { revisionId: uuid(82) }, { locale: 'en' }, { slug: 'renamed-course' }, { title: null }, { title: 'Different course' }]) {
    assert.equal(resolveHomeCourse('fr', catalogue(), success(detail(changes))), null);
  }
});

test('trial choice skips unavailable or wrong-language branches and protected activities, preserving programme order', () => {
  const curriculum = [
    module([activity(40)], { availability: 'WITHDRAWN' }),
    module([activity(41)], { locale: 'en' }),
    module([activity(42, { availability: 'STALE' }), activity(43, { access: 'PROTECTED' }), activity(44, { locale: 'en' }), activity(45, { slug: null }), activity(46, { revisionId: null })]),
    module([activity(47), activity(48)], { access: 'PROTECTED' }),
  ];
  const focused = resolveHomeCourse('fr', catalogue(), success(detail({ curriculum })));
  assert.equal(focused.trial.title, 'Lesson 47');
  assert.equal(new URL(focused.trial.href, 'https://courses.invalid').searchParams.get('resource'), uuid(47));
});

test('a course without a published free activity still has a real course destination and no invented trial', () => {
  const focused = resolveHomeCourse('fr', catalogue(), success(detail({ curriculum: [module([activity(4, { access: 'PROTECTED' })])] })));
  assert.equal(focused.trial, null);
  assert.equal(focused.href, `/fr/parcours/first-course?version=${uuid(2)}`);
});

test('English course routes require English curriculum instead of borrowing the French lesson', () => {
  const english = card({ locale: 'en', slug: 'english-course', title: 'English course' });
  const result = success(detail({ ...english, curriculum: [module([activity(4), activity(5, { locale: 'en' })], { locale: 'en' })] }));
  const focused = resolveHomeCourse('en', catalogue({ items: [english] }), result);
  assert.equal(focused.href, `/en/courses/english-course?version=${uuid(2)}`);
  assert.equal(new URL(focused.trial.href, 'https://courses.invalid').pathname, '/en/learn/english-course/lesson-5');
});

test('home projection excludes lesson bodies, curriculum identifiers and unrelated metadata', () => {
  const focused = resolveHomeCourse('fr', catalogue(), success(detail({ document: { blocks: [{ type: 'PARAGRAPH', text: 'PRIVATE_BODY_SENTINEL' }] } })));
  assert.deepEqual(focused.audience, ['Service providers']);
  assert.deepEqual(focused.prerequisites, ['Read a brief']);
  assert.equal(focused.objective, 'Clarify a brief');
  assert.equal(focused.expectedResult, 'A checked proposal');
  assert.equal('document' in focused, false);
  assert.equal('curriculum' in focused, false);
  assert.equal('metadata' in focused, false);
  assert.equal(JSON.stringify(focused).includes('PRIVATE_BODY_SENTINEL'), false);
});
