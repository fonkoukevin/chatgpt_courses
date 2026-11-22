import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the actual route and components with public upstream fixtures. The
// account hook is controlled here; live notes/history mutations remain P08 tests.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
const originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const reference = { resourceId: uuid(1), versionId: uuid(2), contentLocale: 'fr' };
const anonymous = { status: 'anonymous', accountId: null, error: null }, active = { status: 'active', accountId: uuid(50), error: null };
let account = anonymous, requestedDestination, childPresent = true, sourceAvailability = 'PUBLISHED';
const boundary = { capture: () => 1, isCurrent: value => value === 1, isPrivacyExit: () => false, refresh() {}, fail() {} };
const success = data => ({ ok: true, data, status: 200 });
const activity = locale => ({ ...reference, locale, kind: 'ACTIVITY', versionNumber: 1, revisionId: uuid(3), slug: 'synthetic-activity', availability: sourceAvailability,
  title: 'Synthetic activity', summary: 'Public synthetic summary', access: 'FREE', document: { blocks: [{ type: 'PARAGRAPH', text: 'SOURCE_BODY_MUST_NOT_ENTER_THIS_CONTEXT', url: null }], exerciseInstructions: 'SOURCE_INSTRUCTIONS_MUST_NOT_ENTER_THIS_CONTEXT', correction: 'SYNTHETIC_PRIVATE_SOLUTION_MUST_NOT_ENTER_PROPS' },
  metadata: { goalCodes: [], level: null, audience: [], tools: [], sources: [], faq: [], evaluationDescription: null }, reviewedAt: null,
  languages: ['fr', 'en'].map(language => ({ locale: language, slug: 'synthetic-activity', status: 'PUBLISHED' })), curriculum: [], related: [], objective: null, expectedResult: null, prerequisites: [], estimatedMinutes: null });
const course = locale => ({ ...activity(locale), resourceId: uuid(10), versionId: uuid(11), kind: 'COURSE', slug: 'synthetic-course', availability: 'PUBLISHED', document: null,
  curriculum: childPresent ? [{ ...activity(locale), document: undefined, children: [] }] : [] });
const upstream = {
  readResourceBySlug: async (_kind, _slug, locale) => success(course(locale)),
  readResourceVersion: async (resourceId, _versionId, locale) => success(resourceId === uuid(10) ? course(locale) : activity(locale)),
  readPublicActivityContext: async (_courseId, _courseVersion, resourceId, versionId, locale) => success({ courseResourceId: uuid(10), courseVersionId: uuid(11), activityResourceId: resourceId, activityVersionId: versionId, locale, availability: 'WITHDRAWN', courseSlug: null, activitySlug: null,
    languages: ['fr', 'en'].map(language => ({ locale: language, availability: 'WITHDRAWN', courseSlug: null, activitySlug: null })) }),
};
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') return {};
  if (request === '@/lib/learning/account') return { useLearningAccount: destination => { requestedDestination = destination; return { state: account, boundary }; } };
  if (request === '@/lib/api/public-server') return upstream;
  if (request === '@/lib/api/learning-server') return { readLearningDashboard: () => { throw new Error('No private server projection is needed for an unavailable public context.'); }, readSavedLearningActivity: () => { throw new Error('No private pedagogical body may be loaded for this fallback.'); } };
  if (request === '@/lib/api/commerce-server') return { readCourseOffers: () => { throw new Error('No commerce read is needed for this activity.'); } };
  if (request === '@/lib/config/server') return { getServerConfig: () => ({ environment: 'test', publicOrigin: 'http://127.0.0.1:3000', publishedLocales: [], defaultLocale: 'fr' }) };
  return originalLoad.call(this, request, parent, ...args);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
after(() => { Module._resolveFilename = originalResolve; Module._load = originalLoad; for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { UnavailableLearningHistory } = require(resolve(sources, 'components/learning/unavailable-history.tsx'));
const { ActivityNotes } = require(resolve(sources, 'components/learning/notes.tsx'));
const { QuizHistory } = require(resolve(sources, 'components/learning/quiz.tsx'));
const { PublicContextUnavailable } = require(resolve(sources, 'components/public/context-unavailable.tsx'));
const { PublicActivityPage } = require(resolve(sources, 'components/public/server-pages.tsx'));
const { PublicNavigationProvider } = require(resolve(sources, 'components/layouts/public-navigation.tsx'));
const { getLearningDictionary } = require(resolve(sources, 'lib/i18n/learning.ts'));
const { getPublicDictionary } = require(resolve(sources, 'lib/i18n/public.ts'));
const { learningPath } = require(resolve(sources, 'lib/learning/routes.ts'));
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
function render(value) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } }, React.createElement(PublicNavigationProvider, { value: { methods: false, guides: false, offers: false } }, value)));
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
}

test('both unavailable-context route branches serialize only the exact activity reference, with no source body or member projection', async () => {
  account = anonymous;
  for (const locale of ['fr', 'en']) for (const present of [true, false]) for (const availability of ['PUBLISHED', 'WITHDRAWN']) {
    childPresent = present; sourceAvailability = availability;
    const page = await PublicActivityPage({ params: Promise.resolve({ locale, courseSlug: 'synthetic-course', activitySlug: 'synthetic-activity' }), searchParams: Promise.resolve({ resource: reference.resourceId, version: reference.versionId, courseVersion: uuid(11) }) });
    assert.equal(page.type, PublicContextUnavailable);
    assert.deepEqual(page.props.personal, { ...reference, contentLocale: locale });
    assert.deepEqual(Object.keys(page.props.personal).sort(), ['contentLocale', 'resourceId', 'versionId']);
    const props = JSON.stringify(page.props); assert.doesNotMatch(props, /SOURCE_BODY|SOURCE_INSTRUCTIONS|SYNTHETIC_PRIVATE_SOLUTION|"document"|"curriculum"|"programme"/);
    const output = render(page); assert.ok(output.includes('data-unavailable-learning-history'));
    assert.ok(output.includes(html(getPublicDictionary(locale).WITHDRAWN)));
    assert.equal((output.match(/<h1\b/g) ?? []).length, 1); assert.equal((output.match(/<main\b/g) ?? []).length, 1);
    assert.doesNotMatch(output, /SOURCE_BODY|SOURCE_INSTRUCTIONS|SYNTHETIC_PRIVATE_SOLUTION/);
  }
});

test('an anonymous unavailable context offers sign-in to an internal learning destination and renders no private component', () => {
  account = anonymous;
  for (const locale of ['fr', 'en']) {
    const element = UnavailableLearningHistory({ locale, ...reference }), children = nodes(element), output = render(element);
    assert.equal(requestedDestination, learningPath(locale));
    assert.equal(children.filter(node => node.type === ActivityNotes || node.type === QuizHistory).length, 0);
    assert.ok(output.includes(encodeURIComponent(learningPath(locale))));
    assert.doesNotMatch(output, /name="activityNote"|data-learning-quiz-result|type="submit"/);
  }
});

test('an active account reuses owner-scoped notes and history, forbids new notes and keeps interface language separate from the content language', () => {
  account = active;
  const element = UnavailableLearningHistory({ locale: 'en', ...reference }), children = nodes(element);
  const notes = children.find(node => node.type === ActivityNotes), history = children.find(node => node.type === QuizHistory);
  assert.ok(notes && history); assert.equal(requestedDestination, learningPath('en'));
  assert.equal(notes.props.activityId, reference.resourceId); assert.equal(notes.props.activityVersionId, reference.versionId);
  assert.equal(notes.props.locale, 'en'); assert.equal(notes.props.contentLocale, 'fr'); assert.equal(notes.props.canCreate, false);
  assert.equal(notes.props.account.accountId, active.accountId); assert.equal(notes.props.boundary, boundary);
  assert.equal(history.props.activityVersionId, reference.versionId); assert.equal(history.props.locale, 'en'); assert.equal(history.props.account.accountId, active.accountId);
  assert.doesNotMatch(JSON.stringify({ ...notes.props, boundary: null, account: null }), /"document"|"resource"|"template"/);
  const output = render(element); assert.ok(output.includes(html(getLearningDictionary('en').notes)) && output.includes(html(getLearningDictionary('en').attemptHistory)));
  assert.equal((output.match(/<section\b/g) ?? []).length, 2, 'An outer section must not duplicate the history region used by existing navigation.');
});

test('expired and changed accounts retain the existing boundary and blocked personal components instead of adopting another account', () => {
  for (const status of ['expired', 'changed', 'loading', 'error']) {
    account = { ...active, status, error: status === 'error' ? { kind: 'unavailable' } : null };
    const element = UnavailableLearningHistory({ locale: 'fr', ...reference }), children = nodes(element), output = render(element);
    const notes = children.find(node => node.type === ActivityNotes), history = children.find(node => node.type === QuizHistory);
    assert.equal(notes.props.account.status, status); assert.equal(history.props.account.status, status);
    assert.equal(notes.props.account.accountId, active.accountId); assert.equal(notes.props.canCreate, false); assert.equal(history.props.boundary, boundary);
    const t = getLearningDictionary('fr');
    if (status === 'expired') assert.ok(output.includes(html(t.expiredSession)));
    if (status === 'changed') assert.ok(output.includes(html(t.accountChanged)));
    assert.doesNotMatch(output, /data-learning-quiz-result|type="submit"/);
  }
});
