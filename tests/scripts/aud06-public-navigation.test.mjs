import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Execute the real server route functions against explicit public upstream
// fixtures. Browser navigation and persistent account work are separate checks.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
const originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const success = data => ({ ok: true, data, status: 200 });
const origin = 'https://courses.invalid';
let childPresent = true, missingLocale = null, currentLocale = 'fr';
const activity = locale => ({ resourceId: uuid(1), versionId: uuid(2), revisionId: uuid(3), locale, kind: 'ACTIVITY', versionNumber: 1,
  slug: `activity-${locale}`, availability: 'PUBLISHED', title: `Synthetic activity ${locale}`, summary: 'Public fixture', access: 'FREE', document: null,
  metadata: { goalCodes: ['understand-brief'], level: 'BEGINNER', audience: [], tools: [], sources: [], faq: [], evaluationDescription: null },
  languages: ['fr', 'en'].map(language => ({ locale: language, slug: language === missingLocale ? null : `activity-${language}`, status: language === missingLocale ? 'MISSING_TRANSLATION' : 'PUBLISHED' })),
  curriculum: [], related: [], objective: null, expectedResult: null, prerequisites: [], estimatedMinutes: null, reviewedAt: null });
const course = locale => ({ ...activity(locale), resourceId: uuid(10), versionId: uuid(11), kind: 'COURSE', slug: `course-${locale}`,
  languages: ['fr', 'en'].map(language => ({ locale: language, slug: `course-${language}`, status: 'PUBLISHED' })),
  curriculum: childPresent ? [{ ...activity(locale), children: [] }] : [] });
const upstream = {
  readResourceBySlug: async (_kind, _slug, locale) => success(course(locale)),
  readResourceVersion: async (id, _version, locale) => success(id === uuid(10) ? course(locale) : activity(locale)),
  readPublicActivityContext: async (_course, _version, resourceId, versionId, locale) => success({
    courseResourceId: uuid(10), courseVersionId: uuid(11), activityResourceId: resourceId, activityVersionId: versionId, locale,
    availability: childPresent ? 'PUBLISHED' : 'WITHDRAWN', courseSlug: childPresent ? `course-${locale}` : null, activitySlug: childPresent ? `activity-${locale}` : null,
    languages: ['fr', 'en'].map(language => ({ locale: language, availability: language === missingLocale || !childPresent && language === currentLocale ? 'WITHDRAWN' : 'PUBLISHED',
      courseSlug: language === missingLocale || !childPresent && language === currentLocale ? null : `course-${language}`,
      activitySlug: language === missingLocale || !childPresent && language === currentLocale ? null : `activity-${language}` })),
  }),
};
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') return {};
  if (request === '@/lib/api/public-server') return upstream;
  if (request === '@/lib/api/learning-server') return { readLearningDashboard: () => assert.fail('No private dashboard is needed.'), readSavedLearningActivity: () => assert.fail('No private activity is needed.') };
  if (request === '@/lib/api/commerce-server') return { readCourseOffers: async () => success({ items: [] }) };
  if (request === '@/lib/config/server') return { getServerConfig: () => ({ environment: 'test', publicOrigin: origin, publishedLocales: [], defaultLocale: 'fr' }) };
  return originalLoad.call(this, request, parent, ...args);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
after(() => { Module._resolveFilename = originalResolve; Module._load = originalLoad; for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });
const { PublicCataloguePage, PublicCoursePage, PublicActivityPage } = require(resolve(sources, 'components/public/server-pages.tsx'));
const path = locale => locale === 'fr' ? '/fr/catalogue' : '/en/catalog';
const filtered = locale => `${path(locale)}?${new URLSearchParams({ locale, q: 'brief & scope', type: 'ACTIVITY', access: 'FREE', page: '2', pageSize: '10', sort: 'RECENT' })}`;
const props = (locale, searchParams, extra = {}) => ({ params: Promise.resolve({ locale, ...extra }), searchParams: Promise.resolve(searchParams) });
function checkReturn(href, locale, page = '0') {
  const back = new URL(href, origin);
  assert.equal(back.pathname, path(locale)); assert.equal(back.searchParams.get('locale'), locale);
  assert.equal(back.searchParams.get('q'), 'brief & scope'); assert.equal(back.searchParams.get('type'), 'ACTIVITY');
  assert.equal(back.searchParams.get('access'), 'FREE'); assert.equal(back.searchParams.get('page'), page);
  assert.equal(back.searchParams.get('pageSize'), '10'); assert.equal(back.searchParams.get('sort'), 'RECENT');
}

test('course and discovery language links preserve identity and rebuild the catalogue return in either direction', async () => {
  childPresent = true; missingLocale = null;
  for (const locale of ['fr', 'en']) {
    currentLocale = locale; const other = locale === 'fr' ? 'en' : 'fr';
    const coursePage = await PublicCoursePage(props(locale, { returnTo: filtered(locale) }, { slug: `course-${locale}` }));
    const equivalent = new URL(coursePage.props.languageLinks[other].href, origin);
    assert.equal(equivalent.pathname, `/${other}/${other === 'fr' ? 'parcours' : 'courses'}/course-${other}`);
    assert.equal(equivalent.searchParams.get('version'), uuid(11)); checkReturn(equivalent.searchParams.get('returnTo'), other);
    const discovery = await PublicCataloguePage(props(locale, { activity: uuid(1), version: uuid(2), returnTo: filtered(locale) }));
    const translated = new URL(discovery.props.languageLinks[other].href, origin);
    assert.equal(translated.pathname, path(other)); assert.equal(translated.searchParams.get('activity'), uuid(1));
    assert.equal(translated.searchParams.get('version'), uuid(2)); checkReturn(translated.searchParams.get('returnTo'), other);
    checkReturn(discovery.props.returnTo, locale, '2');
  }
});

test('both activity-context branches use the published localized slugs and a return matching their target language', async () => {
  missingLocale = null;
  for (const present of [true, false]) for (const locale of ['fr', 'en']) {
    childPresent = present; currentLocale = locale; const other = locale === 'fr' ? 'en' : 'fr';
    const page = await PublicActivityPage(props(locale, { resource: uuid(1), version: uuid(2), courseVersion: uuid(11), returnTo: filtered(locale) }, { courseSlug: `course-${locale}`, activitySlug: `activity-${locale}` }));
    const translated = new URL(page.props.languageLinks[other].href, origin);
    assert.equal(translated.pathname, `/${other}/${other === 'fr' ? 'apprendre' : 'learn'}/course-${other}/activity-${other}`);
    assert.equal(translated.searchParams.get('resource'), uuid(1)); assert.equal(translated.searchParams.get('version'), uuid(2));
    assert.equal(translated.searchParams.get('courseVersion'), uuid(11)); checkReturn(translated.searchParams.get('returnTo'), other);
  }
});

test('old opposite-language return parameters are normalized on route entry and unsafe destinations become a local catalogue', async () => {
  childPresent = true; missingLocale = null;
  for (const locale of ['fr', 'en']) {
    currentLocale = locale; const other = locale === 'fr' ? 'en' : 'fr';
    const normalized = await PublicCataloguePage(props(locale, { activity: uuid(1), version: uuid(2), returnTo: filtered(other) }));
    checkReturn(normalized.props.returnTo, locale);
    for (const returnTo of ['https://foreign.invalid/fr/catalogue', '/fr/catalogue?returnTo=%252f%252fforeign.invalid', '/fr/catalogue/../catalogue?q=brief']) {
      const page = await PublicCataloguePage(props(locale, { activity: uuid(1), version: uuid(2), returnTo }));
      assert.equal(page.props.returnTo, path(locale));
    }
  }
});

test('a missing translated course context never manufactures a learning slug and keeps a local alternative', async () => {
  childPresent = true;
  for (const locale of ['fr', 'en']) {
    currentLocale = locale; const other = locale === 'fr' ? 'en' : 'fr'; missingLocale = other;
    const page = await PublicActivityPage(props(locale, { resource: uuid(1), version: uuid(2), courseVersion: uuid(11), returnTo: filtered(locale) }, { courseSlug: `course-${locale}`, activitySlug: `activity-${locale}` }));
    const link = page.props.languageLinks[other]; assert.equal(link.available, false);
    assert.equal(link.reason, 'COURSE_CONTEXT_UNAVAILABLE'); assert.equal(link.alternativeHref, undefined);
    const alternative = new URL(link.href, origin); assert.equal(alternative.pathname, path(other));
    assert.equal(alternative.searchParams.get('locale'), other); assert.equal(alternative.searchParams.get('type'), 'ACTIVITY');
    assert.doesNotMatch(link.href, /learn|apprendre|activity-/);
  }
  missingLocale = null;
});
