import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Render the actual client components, including their forms and navigation.
// This loader is confined to this Node test worker and the repository sources.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originals = Object.fromEntries(['.ts', '.tsx'].map(ext => [ext, Module._extensions[ext]]));
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
after(() => { Module._resolveFilename = originalResolve; for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });

const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { PublicHome } = require(resolve(sources, 'components/public/home.tsx'));
const { PublicCatalogue } = require(resolve(sources, 'components/public/catalogue.tsx'));
const { PublicNavigationProvider } = require(resolve(sources, 'components/layouts/public-navigation.tsx'));
const { publicNavigationAvailability } = require(resolve(sources, 'lib/public/navigation.ts'));
const { getPublicDictionary } = require(resolve(sources, 'lib/i18n/public.ts'));
const { getHomeDictionary } = require(resolve(sources, 'lib/i18n/home.ts'));
const { publicCatalogueHref } = require(resolve(sources, 'lib/public/routes.ts'));
const emptyNavigation = { methods: false, guides: false, offers: false };
const success = data => ({ ok: true, data, status: 200 }), unavailable = { ok: false, error: { kind: 'unavailable' } };
const page = (items = [], total = items.length) => success({ items, total, page: 0, pageSize: 20 });
const facets = fields => success({ types: [], goals: [], levels: [], locales: [], accesses: [], ...fields });
const languages = { fr: { href: '/fr', available: true }, en: { href: '/en', available: true } };
const option = (code, count = 1) => ({ code, count, label: code });
const card = locale => ({ resourceId: 'b8e3e854-f017-4d07-859f-aac6423600b2', versionId: 'aa10a688-c37d-4312-932e-282e1e846d36', revisionId: '852b8c6a-f3e7-4686-b580-de379a790b27', kind: 'GUIDE', locale, slug: 'reviewed-resource', title: 'Reviewed example', summary: 'A fictional UI test resource.', objective: 'A test objective.', expectedResult: 'A test result.', access: 'FREE', estimatedMinutes: null, goalCodes: [], level: null, reviewedAt: null });
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
function render(component, props, availability = emptyNavigation) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } }, React.createElement(PublicNavigationProvider, { value: availability }, React.createElement(component, props))));
}
const homeProps = (locale, overrides = {}) => ({ locale, catalogue: page(), facets: facets(), featuredActivityResult: page(), languageLinks: languages, ...overrides });
const catalogueProps = (locale, overrides = {}) => ({ locale, result: page(), facets: facets(), query: { locale }, languageLinks: languages, ...overrides });

test('navigation availability uses only successful non-empty public results', () => {
  assert.deepEqual(publicNavigationAvailability(facets({ types: [option('GUIDE'), option('METHOD_TEMPLATE', 0)] }), page([], 1)), { methods: false, guides: true, offers: true });
  assert.deepEqual(publicNavigationAvailability(unavailable, unavailable), emptyNavigation);
  assert.deepEqual(publicNavigationAvailability(facets(), page()), emptyNavigation);
});

test('empty home in both languages has an honest heading and no trial, search or empty task section', () => {
  for (const locale of ['fr', 'en']) {
    const t = getPublicDictionary(locale), output = render(PublicHome, homeProps(locale));
    assert.deepEqual([...output.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => match[1]), [html(t.preparationTitle)]);
    assert.ok(output.includes(html(t.preparationDescription)));
    assert.doesNotMatch(output, /<form\b|\?activity=|\?type=METHOD_TEMPLATE|\?type=GUIDE/);
    assert.ok(!output.includes(html(t.goalsTitle)) && !output.includes(html(t.exampleTitle)));
    assert.ok(output.includes(`href="${publicCatalogueHref(locale)}"`));
    assert.ok(output.includes(`href="${locale === 'fr' ? '/fr/compte' : '/en/account'}"`));
  }
});

test('available resources remain reachable and only tasks with a real positive count are promoted', () => {
  const resource = card('fr'), t = getPublicDictionary('fr');
  const emptyTasks = render(PublicHome, homeProps('fr', { catalogue: page([resource]), facets: facets({ types: [option('GUIDE')], goals: [option('check-output', 0)] }) }));
  assert.ok(emptyTasks.includes('Reviewed example') && emptyTasks.includes('/fr/guides/reviewed-resource'));
  assert.ok(!emptyTasks.includes(html(t.preparationTitle)) && !emptyTasks.includes(html(t.goalsTitle)));
  const withTasks = render(PublicHome, homeProps('fr', { catalogue: page([resource]), facets: facets({ goals: [option('check-output'), option('prepare-prompt', 0)] }) }));
  assert.ok(withTasks.includes('goal=check-output') && !withTasks.includes('goal=prepare-prompt'));
});

test('real navigation keeps available categories and omits unavailable ones in either language', () => {
  for (const locale of ['fr', 'en']) {
    const output = render(PublicHome, homeProps(locale, { catalogue: page([card(locale)]) }), { methods: true, guides: false, offers: true });
    assert.ok(output.includes(`href="${publicCatalogueHref(locale)}?type=METHOD_TEMPLATE&amp;locale=${locale}"`));
    assert.ok(!output.includes('?type=GUIDE'));
    assert.ok(output.includes(`href="/${locale}/${locale === 'fr' ? 'offres' : 'offers'}"`));
  }
});

test('an empty unfiltered catalogue does not advertise empty filter or search controls', () => {
  for (const locale of ['fr', 'en']) {
    const t = getPublicDictionary(locale), output = render(PublicCatalogue, catalogueProps(locale));
    assert.ok(output.includes(html(t.preparationTitle)));
    assert.doesNotMatch(output, /<form\b|<select\b/);
    assert.ok(!output.includes(html(t.emptyTitle)));
  }
});

test('no-match filters preserve active unavailable values, both access choices and the content language', () => {
  const fields = facets({ types: [option('GUIDE')], accesses: [option('FREE'), option('PROTECTED')], locales: [option('en')] });
  const output = render(PublicCatalogue, catalogueProps('fr', { facets: fields, query: { locale: 'en', level: 'BEGINNER', q: 'no match' } }));
  assert.ok(output.includes(html(getPublicDictionary('fr').emptyTitle)));
  assert.match(output, /<select[^>]*name="level"[^>]*>[\s\S]*?<option value="BEGINNER" selected=""/);
  assert.match(output, /<select[^>]*name="access"[^>]*>[\s\S]*?<option value="FREE"[\s\S]*?<option value="PROTECTED"/);
  assert.doesNotMatch(output, /<select[^>]*name="goal"/);
  assert.ok((output.match(/<input type="hidden" name="locale" value="en"/g) ?? []).length >= 2);
  assert.ok(output.includes('level=BEGINNER') && output.includes('locale=en'));
});

test('an English catalogue keeps the French content choice when no English resource is available', () => {
  const output = render(PublicCatalogue, catalogueProps('en', { facets: facets({ locales: [option('fr')] }) }));
  const languageForm = [...output.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].find(([, , body]) => /<select[^>]*name="locale"/.test(body));
  assert.ok(languageForm, 'The available French content must remain selectable in the English catalogue.');
  assert.match(languageForm[1], /action="\/en\/catalog"/);
  assert.match(languageForm[1], /method="get"/);
  const languageSelect = languageForm[2].match(/<select[^>]*name="locale"[^>]*>([\s\S]*?)<\/select>/);
  assert.match(languageSelect[1], /<option value="en" selected=""/);
  assert.match(languageSelect[1], /<option value="fr"/);

  const selected = render(PublicCatalogue, catalogueProps('en', { result: page([card('fr')]),
    facets: facets({ types: [option('GUIDE')], accesses: [option('FREE')], locales: [option('fr')] }), query: { locale: 'fr' } }));
  const forms = [...selected.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
  assert.ok(forms.length >= 2);
  for (const [, attributes, body] of forms) {
    assert.match(attributes, /action="\/en\/catalog"/);
    assert.match(body, /<input type="hidden" name="locale" value="fr"/);
  }
  assert.ok(selected.includes('Reviewed example'));
});

test('an unavailable public service remains an error with a retry action, distinct from preparation', () => {
  const t = getPublicDictionary('fr'), output = render(PublicHome, homeProps('fr', { catalogue: unavailable, facets: unavailable, featuredActivityResult: unavailable }));
  assert.ok(output.includes(html(t.serviceUnavailable)) && output.includes(html(t.retry)));
  assert.ok(!output.includes(html(t.preparationTitle)));
});

const focused = locale => ({ title: 'A reviewed course', summary: 'A public summary', objective: 'Prepare a checkable proposal.', expectedResult: 'A proposal and its checks.',
  audience: ['Independent service providers'], prerequisites: ['Read the supplied brief'], href: `/${locale}/${locale === 'fr' ? 'parcours' : 'courses'}/reviewed-course?version=aa10a688-c37d-4312-932e-282e1e846d36`,
  trial: { title: 'Read the brief', href: `/${locale}/${locale === 'fr' ? 'apprendre' : 'learn'}/reviewed-course/read-the-brief?resource=b8e3e854-f017-4d07-859f-aac6423600b2&version=aa10a688-c37d-4312-932e-282e1e846d36&courseVersion=852b8c6a-f3e7-4686-b580-de379a790b27` },
  modules: [{ title: 'Understand the brief', summary: 'Make a factual scoping table.' }] });

test('a focused course promotes its linked trial and course instead of an unrelated activity or catalogue search', () => {
  for (const locale of ['fr', 'en']) {
    const course = focused(locale), unrelated = { ...card(locale), kind: 'ACTIVITY', resourceId: 'e590b4bb-7662-4a03-afab-735fe53cd231' };
    const output = render(PublicHome, homeProps(locale, { catalogue: page([card(locale)]), featuredActivityResult: page([unrelated]), focusedCourse: course }), { methods: true, guides: false, offers: false });
    assert.ok(output.includes('data-home-single-course') && output.includes('A reviewed course'));
    assert.ok(output.includes(html(course.trial.href)) && output.includes(html(course.href)));
    assert.ok(!output.includes(unrelated.resourceId));
    assert.doesNotMatch(output, /<form\b|type="search"/);
    assert.ok(output.includes(html(getHomeDictionary(locale).anonymous)));
  }
});

test('a course with no open trial makes no free-start promise and local editorial example is explicit and optional', () => {
  for (const locale of ['fr', 'en']) {
    const t = getHomeDictionary(locale), course = { ...focused(locale), trial: null };
    const props = homeProps(locale, { catalogue: page([card(locale)]), focusedCourse: course });
    const ordinary = render(PublicHome, props);
    assert.ok(ordinary.includes('data-home-course') && !ordinary.includes('data-home-primary'));
    assert.ok(!ordinary.includes(html(t.anonymous)) && !ordinary.includes('data-home-demo'));
    const proposed = render(PublicHome, { ...props, editorialPreview: true });
    assert.ok(proposed.includes('data-home-demo') && proposed.includes(html(t.preview)) && proposed.includes(html(t.demoLabel)));
    assert.ok(proposed.includes(html(t.brief)) && proposed.includes(html(t.output)) && proposed.includes(html(t.check)));
  }
});
