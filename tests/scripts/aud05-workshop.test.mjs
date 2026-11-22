import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real React output verifies the local form and workshop composition. Effects,
// downloads, account transitions and persistence still require browser/API tests.
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
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { ActivityPracticeDraft } = require(resolve(sources, 'components/learning/practice-draft.tsx'));
const { LearningActivity } = require(resolve(sources, 'components/learning/activity.tsx'));
const { ProjectPreparation, StartProjectAction } = require(resolve(sources, 'components/projects/preparation.tsx'));
const { PublicNavigationProvider } = require(resolve(sources, 'components/layouts/public-navigation.tsx'));
const { getPracticeDraftDictionary } = require(resolve(sources, 'lib/i18n/practice-draft.ts'));
const { getExportsDictionary } = require(resolve(sources, 'lib/i18n/exports.ts'));
const { getProjectsDictionary } = require(resolve(sources, 'lib/i18n/projects.ts'));
const { getWorkshopDictionary } = require(resolve(sources, 'lib/i18n/workshop.ts'));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const account = { status: 'anonymous', accountId: null, error: null };
const boundary = { capture: () => 0, isCurrent: () => true, isPrivacyExit: () => false, fail: () => { throw new Error('No mutation or private read may run while rendering.'); } };
function resource(locale = 'fr', overrides = {}) {
  return { resourceId: uuid(2), versionId: uuid(3), revisionId: uuid(4), versionNumber: 7, kind: 'ACTIVITY', locale, slug: 'synthetic-workshop', availability: 'PUBLISHED',
    title: 'Synthetic workshop', summary: 'Public synthetic introduction', access: 'FREE', objective: 'Review supplied facts', expectedResult: 'A bounded personal draft', prerequisites: [], estimatedMinutes: null,
    metadata: { goalCodes: [], level: null, audience: [], tools: [], sources: [], faq: [], evaluationDescription: null }, reviewedAt: null,
    languages: [{ locale, slug: 'synthetic-workshop', status: 'PUBLISHED' }], curriculum: [], related: [],
    document: { objective: 'Review supplied facts', expectedResult: 'A bounded personal draft', prerequisites: [], blocks: [{ type: 'PARAGRAPH', text: 'SYNTHETIC_PUBLIC_BODY', url: null }], estimatedMinutes: null,
      exerciseInstructions: 'SYNTHETIC_INSTRUCTIONS: write your own answer.', quiz: [], rubric: [], access: 'FREE', media: [], relatedResourceIds: [], methodDefinition: null, quizPolicy: null, projectPolicy: null }, ...overrides };
}
function render(component, props) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } }, React.createElement(PublicNavigationProvider, { value: { methods: false, guides: false, offers: false } }, React.createElement(component, props))));
}
const localProps = (locale, source = resource(locale), extra = {}) => ({ locale, resource: source, account, boundary, available: true, ...extra });
const button = (output, label) => [...output.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , body]) => body.includes(html(label)));

test('local practice starts empty, exposes its instructions separately and cannot export or copy an empty answer', () => {
  for (const locale of ['fr', 'en']) {
    const source = resource(locale), output = render(ActivityPracticeDraft, localProps(locale, source)), t = getPracticeDraftDictionary(locale), exports = getExportsDictionary(locale);
    assert.ok(output.includes('data-activity-practice-draft') && output.includes(html(t.local)));
    assert.match(output, /<textarea\b[^>]*name="practiceText"[^>]*><\/textarea>/);
    const field = output.match(/<textarea\b[^>]*name="practiceText"[^>]*>/)?.[0]; assert.ok(field?.includes(`lang="${locale}"`) && field.includes('maxLength="32000"'));
    assert.ok(output.includes(html(source.document.exerciseInstructions))); assert.equal((output.match(/<textarea\b/g) ?? []).length, 1);
    for (const label of [t.copy, exports.action]) { const action = button(output, label); assert.ok(action && /disabled=""/.test(action[1])); }
    assert.doesNotMatch(output, /sessionStorage|localStorage|2 heures|two hours|2 hours|consent|data-project-preparation/);
  }
});

test('an English interface keeps the initial French writing language instead of translating or pre-filling the answer', () => {
  const output = render(ActivityPracticeDraft, localProps('en', resource('fr'))), copy = getPracticeDraftDictionary('en');
  assert.ok(output.includes(html(copy.response)) && output.includes(html(copy.languageHelp)));
  assert.match(output, /<textarea\b[^>]*name="practiceText"[^>]*lang="fr"[^>]*><\/textarea>/);
  assert.match(output, /<option value="fr" selected=""/); assert.doesNotMatch(output, /<option value="en" selected=""/);
  assert.ok(!output.includes('SYNTHETIC_CORRECTION'));
});

test('a configured project policy uses its own workshop, and inaccessible local practice does not expose protected instructions', () => {
  const source = resource();
  assert.equal(render(ActivityPracticeDraft, localProps('fr', { ...source, document: { ...source.document, projectPolicy: { templateCode: 'BR01' } } })), '');
  assert.equal(render(ActivityPracticeDraft, localProps('fr', { ...source, document: null })), '');
  assert.equal(render(ActivityPracticeDraft, localProps('fr', { ...source, document: { ...source.document, exerciseInstructions: null } })), '');
  const privateSource = { ...source, access: 'PROTECTED', document: { ...source.document, access: 'PROTECTED', exerciseInstructions: 'SYNTHETIC_PROTECTED_INSTRUCTIONS' } };
  const output = render(ActivityPracticeDraft, localProps('fr', privateSource, { available: false }));
  assert.ok(!output.includes(privateSource.document.exerciseInstructions)); assert.match(output, /<textarea\b[^>]*readOnly=""/);
  assert.match(output, /<select\b[^>]*name="practiceLocale"[^>]*disabled=""/);
});

test('the real activity exposes four ordered moments and offers project preparation before every published checklist group', () => {
  for (const locale of ['fr', 'en']) {
    const source = resource(locale), projects = getProjectsDictionary(locale), workshop = getWorkshopDictionary(locale);
    source.document.projectPolicy = { templateCode: 'BR01' };
    source.document.rubric = [
      { key: 'scope-2', label: 'EXACT_SCOPE_LABEL', points: 4 },
      { key: 'fidelity-1', label: 'EXACT_FACTS_LABEL', points: 2 },
      { key: 'unclassified-published-key', label: 'EXACT_CUSTOM_LABEL', points: 7 },
      { key: 'fidelity-99', label: 'EXACT_UNKNOWN_SUFFIX_LABEL', points: 9 },
    ];
    const before = structuredClone(source), output = render(LearningActivity, { locale, result: { ok: true, data: source, status: 200 }, languageLinks: { fr: { href: '/fr', available: true }, en: { href: '/en', available: true } } });
    const markers = [...output.matchAll(/data-workshop-moment="([^"]+)"/g)].map(match => match[1]); assert.deepEqual(markers, ['understand', 'produce', 'verify', 'reuse']);
    for (const marker of markers) assert.ok(output.includes(`href="#activity-${marker}"`) && output.includes(`id="activity-${marker}"`));
    assert.ok(output.indexOf('data-project-start') > output.indexOf('data-workshop-moment="produce"'));
    assert.ok(output.indexOf('data-project-start') < output.indexOf('data-workshop-checklist'));
    assert.ok(output.includes(html(projects.start)) && !output.includes('data-activity-practice-draft'));
    const checklist = output.match(/<section\b[^>]*data-workshop-checklist[^>]*>([\s\S]*?)<\/section>/)?.[1]; assert.ok(checklist);
    assert.equal((checklist.match(/role="checkbox"/g) ?? []).length, 4);
    for (const criterion of source.document.rubric) assert.equal(checklist.split(criterion.label).length - 1, 1);
    const groups = [...checklist.matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/g)].map(([, value]) => value);
    assert.equal(groups.length, 3);
    assert.ok(groups.some(group => group.includes(html(projects.categoryFidelity)) && group.includes('EXACT_FACTS_LABEL') && !group.includes('EXACT_UNKNOWN_SUFFIX_LABEL')));
    assert.ok(groups.some(group => group.includes(html(projects.categoryScope)) && group.includes('EXACT_SCOPE_LABEL')));
    assert.ok(groups.some(group => group.includes(html(workshop.otherCriteria)) && group.includes('EXACT_CUSTOM_LABEL') && group.includes('EXACT_UNKNOWN_SUFFIX_LABEL')));
    assert.deepEqual(source, before, 'Grouping must not edit a published label or scoring rule.');
  }
});

test('private source bodies are absent from unavailable activities and an anonymous project still requires explicit temporary-storage consent', () => {
  const source = resource('fr'); source.access = 'PROTECTED'; source.document = null;
  const hidden = render(LearningActivity, { locale: 'fr', result: { ok: true, data: source, status: 200 }, languageLinks: { fr: { href: '/fr', available: true }, en: { href: '/en', available: true } } });
  assert.doesNotMatch(hidden, /SYNTHETIC_INSTRUCTIONS|SYNTHETIC_PUBLIC_BODY|data-activity-practice-draft|data-project-start/);
  const template = { activityId: uuid(2), activityVersionId: uuid(3), revisionId: uuid(4), locale: 'fr', availability: 'PUBLISHED', title: 'Synthetic project',
    resource: resource('fr'), rubric: { caseCode: 'BR01', title: 'Synthetic rubric', passScore: 0, criteria: [] } };
  const output = render(ProjectPreparation, { locale: 'en', template, account, boundary }), t = getProjectsDictionary('en');
  assert.ok(output.includes('data-project-preparation') && output.includes(html(t.consentDraft)));
  const keep = button(output, t.keepAndSignIn); assert.ok(keep && /disabled=""/.test(keep[1]));
});

test('project preparation cannot be opened when its source or account is unavailable, while eligible guests can still start', () => {
  for (const locale of ['fr', 'en']) {
    const source = resource(locale); source.document.projectPolicy = { templateCode: 'BR01' };
    const t = getProjectsDictionary(locale), eligible = render(StartProjectAction, { locale, source, account, boundary, sourceAllowed: true });
    const start = button(eligible, t.start); assert.ok(start && !/disabled=/.test(start[1]));
    for (const extra of [{ sourceAllowed: false }, ...['loading', 'changed', 'expired', 'error'].map(status => ({ account: { status, accountId: uuid(1), error: null } }))]) {
      const output = render(StartProjectAction, { locale, source, account, boundary, sourceAllowed: true, ...extra });
      const action = button(output, t.start); assert.ok(action && /disabled=""/.test(action[1]));
      assert.ok(!output.includes('data-project-preparation') && !output.includes('SYNTHETIC_INSTRUCTIONS'));
    }
  }
});
