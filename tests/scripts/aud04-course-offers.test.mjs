import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise real server readers and React rendering; only the Next server boundary
// and its internal origin are replaced. No listening server or persisted data.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originalLoad = Module._load, originalFetch = globalThis.fetch;
const originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
let cookieReads = 0;
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') return {};
  if (request === 'next/headers') return { cookies: async () => { cookieReads++; throw new Error('Public offer discovery must not read a private session.'); } };
  if (request === '../config/server' && parent?.filename === resolve(sources, 'lib/api/commerce-server.ts')) return { getServerConfig: () => ({ apiInternalOrigin: 'http://127.0.0.1:8080', apiTimeoutMs: 1000 }) };
  return originalLoad.call(this, request, parent, ...args);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
afterEach(() => { globalThis.fetch = originalFetch; assert.equal(cookieReads, 0); });
after(() => {
  Module._resolveFilename = originalResolve; Module._load = originalLoad;
  for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension];
});
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { readCourseOffers } = require(resolve(sources, 'lib/api/commerce-server.ts'));
const { CourseOffers } = require(resolve(sources, 'components/public/course-offers.tsx'));
const { PublicCourse } = require(resolve(sources, 'components/public/course.tsx'));
const { PublicOffers } = require(resolve(sources, 'components/commerce/offers.tsx'));
const { PublicNavigationProvider } = require(resolve(sources, 'components/layouts/public-navigation.tsx'));
const { getCommerceDictionary } = require(resolve(sources, 'lib/i18n/commerce.ts'));
const { getCourseDictionary } = require(resolve(sources, 'lib/i18n/course.ts'));
const { getPublicDictionary } = require(resolve(sources, 'lib/i18n/public.ts'));
const { offersHref, offersPath } = require(resolve(sources, 'lib/commerce/routes.ts'));
const { courseActivityHref } = require(resolve(sources, 'lib/public/routes.ts'));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const course = { resourceId: uuid(1), versionId: uuid(2) };
const texts = text => [{ locale: 'fr', text }, { locale: 'en', text }];
const success = data => ({ ok: true, data, status: 200 }), unavailable = { ok: false, error: { kind: 'unavailable' } };
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
function offer(locale = 'fr', number = 3) {
  return { id: uuid(number), productId: uuid(number + 100), revision: 6, code: `synthetic-course-offer-${number}`, kind: 'COURSE', state: 'ACTIVE', locale, translationAvailable: true,
    title: `Synthetic offer ${number}`, summary: 'Transport verification only', resources: [{ ...course, versionNumber: 2, locale, title: 'Synthetic course', slug: 'synthetic-course', availability: 'PUBLISHED', access: 'PROTECTED' }],
    locales: ['fr', 'en'], price: { amountMinor: 1234, currency: 'EUR' }, tax: { mode: 'EXEMPT', notices: texts('Synthetic tax notice') },
    conditions: { access: { mode: 'FIXED', days: 30 }, updates: { mode: 'NONE', days: null }, versionPolicy: 'PINNED', support: { mode: 'NONE', descriptions: [] }, humanReviewIncluded: false, termsVersion: 'synthetic-v6', terms: texts('SYNTHETIC_IMMUTABLE_TERMS') },
    readiness: { offerId: uuid(number), checkedRevision: 6, summaryReady: true, checkoutAvailable: false, blockingIssues: [], warnings: [], checkoutUnavailableReason: 'PAYMENT_NOT_CONFIGURED' } };
}
function summary(value) { const { productId, resources, locales, tax, conditions, readiness, ...result } = value; return result; }
const selection = (items = [], total = items.length, locale = 'fr') => success({ items, total, moreHref: offersHref(locale, {}, course) });
function render(component, props) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } }, React.createElement(PublicNavigationProvider, { value: { methods: false, guides: false, offers: false } }, React.createElement(component, props))));
}
function upstream(items, total = items.length, detail = value => value) {
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input); requests.push(url);
    assert.equal(url.origin, 'http://127.0.0.1:8080'); assert.equal(init.method, 'GET'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).has('Cookie'), false);
    if (url.pathname === '/api/v1/offers') return Response.json({ items: items.map(summary), total, page: 0, pageSize: 3 });
    const value = items.find(item => url.pathname === `/api/v1/offers/${item.id}`);
    assert.ok(value, 'Only offers from the selected list may be read.');
    return Response.json(detail(value));
  };
  return requests;
}
function activity(number, locale, overrides = {}) {
  return { resourceId: uuid(number), versionId: uuid(number + 100), revisionId: uuid(number + 200), versionNumber: number,
    kind: 'ACTIVITY', locale, slug: `synthetic-lesson-${number}`, availability: 'PUBLISHED', title: `Synthetic lesson ${number}`,
    summary: `Synthetic deliverable ${number}`, access: 'PROTECTED', estimatedMinutes: null, children: [], ...overrides };
}
function moduleNode(number, locale, children, overrides = {}) {
  return { ...activity(number, locale), kind: 'MODULE', children, ...overrides };
}
function renderCourse(locale, curriculum) {
  const resource = { ...course, versionNumber: 19, revisionId: uuid(999), kind: 'COURSE', locale, slug: 'synthetic-course', availability: 'PUBLISHED',
    title: 'Synthetic course heading', summary: 'Synthetic course introduction', access: 'PROTECTED', document: null, objective: 'A checkable objective', expectedResult: 'A checked deliverable',
    metadata: { audience: ['Synthetic audience'], goalCodes: [], level: null, tools: [], sources: [], faq: [], evaluationDescription: 'Declared practice only' }, reviewedAt: null,
    prerequisites: ['Read the synthetic brief'], estimatedMinutes: null, languages: [{ locale, slug: 'synthetic-course', status: 'PUBLISHED' }], curriculum, related: [] };
  const nodes = values => values.flatMap(node => [node, ...nodes(node.children)]);
  const activityHrefs = Object.fromEntries(nodes(curriculum).filter(node => node.kind === 'ACTIVITY' && node.availability === 'PUBLISHED').map(node =>
    [node.versionId, courseActivityHref(locale, resource.slug, node.slug, node.resourceId, node.versionId, resource.versionId)]));
  const output = render(PublicCourse, { locale, result: success(resource), activityHrefs, languageLinks: { fr: { href: '/fr/parcours/synthetic-course', available: true }, en: { href: '/en/courses/synthetic-course', available: true } } });
  const programme = output.match(/<section\b[^>]*data-course-programme[^>]*>([\s\S]*?)<\/section>/)?.[1];
  const versions = [...output.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)].find(([, body]) => body.includes(html(getCourseDictionary(locale).versionDetails)))?.[1];
  assert.ok(programme && versions, 'The programme and complete version details must remain present.');
  return { output, programme, versions, activityHrefs, resource };
}
const occurrences = (value, text) => value.split(html(text)).length - 1;
const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('server discovery narrows the selected list to exact course/version/language, then confirms its selected revision', async () => {
  const value = offer(), requests = upstream([value]);
  const result = await readCourseOffers(course, 'fr');
  assert.equal(result.ok, true); assert.deepEqual(result.data.items, [value]);
  assert.equal(result.data.moreHref, offersHref('fr', {}, course));
  assert.equal(requests.length, 2); const filter = requests[0].searchParams;
  assert.equal(filter.get('locale'), 'fr'); assert.equal(filter.get('resourceId'), course.resourceId); assert.equal(filter.get('versionId'), course.versionId);
  assert.equal(filter.get('page'), '0'); assert.equal(filter.get('pageSize'), '3');
});

test('a changed selected revision, different course/version or unsold language is an error instead of an unrelated offer', async () => {
  const value = offer();
  for (const detail of [item => ({ ...item, revision: 7, readiness: { ...item.readiness, checkedRevision: 7 } }),
    item => ({ ...item, resources: [{ ...item.resources[0], resourceId: uuid(90) }] }), item => ({ ...item, resources: [{ ...item.resources[0], versionId: uuid(91) }] }),
    item => ({ ...item, locale: 'en', resources: [{ ...item.resources[0], locale: 'en' }] }), item => ({ ...item, locales: ['en'] })]) {
    upstream([value], 1, detail);
    const result = await readCourseOffers(course, 'fr');
    assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response');
  }
});

test('unavailable included content cannot promote a selected offer for that course version', async () => {
  for (const availability of ['STALE', 'UNAVAILABLE', 'TRANSLATION_MISSING', 'ARCHIVED', 'WITHDRAWN']) {
    upstream([offer()], 1, item => ({ ...item, resources: [{ ...item.resources[0], availability }], readiness: { ...item.readiness, summaryReady: false, blockingIssues: [{ code: 'RESOURCE_UNAVAILABLE', field: 'resources', resourceId: course.resourceId, locale: 'fr' }], checkoutUnavailableReason: 'OFFER_NOT_READY' } }));
    const result = await readCourseOffers(course, 'fr'); assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response');
  }
});

test('failed list or detail reads preserve their failure and do not confirm zero available offers', async () => {
  let reads = 0;
  globalThis.fetch = async () => { reads++; throw new TypeError('Synthetic unavailable list'); };
  let result = await readCourseOffers(course, 'fr'); assert.equal(result.ok, false); assert.equal(result.error.kind, 'unavailable'); assert.equal(reads, 1);
  globalThis.fetch = async () => Response.json({}, { status: 503 });
  result = await readCourseOffers(course, 'fr'); assert.equal(result.ok, false); assert.equal(result.error.status, 503);
  const value = offer();
  for (const status of [404, 503]) {
    globalThis.fetch = async input => new URL(input).pathname === '/api/v1/offers' ? Response.json({ items: [summary(value)], total: 1, page: 0, pageSize: 3 }) : Response.json({}, { status });
    result = await readCourseOffers(course, 'fr'); assert.equal(result.ok, false); assert.equal(result.error.status, status);
  }
});

test('an empty successful selection is distinct from an inconsistent or partial first page', async () => {
  let requests = upstream([]);
  const empty = await readCourseOffers(course, 'fr'); assert.equal(empty.ok, true); assert.deepEqual(empty.data.items, []); assert.equal(empty.data.total, 0); assert.equal(requests.length, 1);
  for (const [items, total] of [[[], 1], [[offer()], 0], [[offer()], 2]]) {
    requests = upstream(items, total); const result = await readCourseOffers(course, 'fr');
    assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response'); assert.equal(requests.length, 1);
  }
});

test('a long selection presents three real choices and a route to the remaining exact filtered offers', async () => {
  const items = [offer('en', 3), offer('en', 4), offer('en', 5)], requests = upstream(items, 8);
  const result = await readCourseOffers(course, 'en'); assert.equal(result.ok, true); assert.deepEqual(result.data.items, items); assert.equal(result.data.total, 8);
  assert.equal(requests.length, 4); assert.equal(result.data.moreHref, offersHref('en', {}, course));
  const output = render(CourseOffers, { locale: 'en', result });
  assert.equal((output.match(/data-course-offer="/g) ?? []).length, 3);
  assert.ok(output.includes(`href="${html(result.data.moreHref)}"`)); assert.ok(output.includes('data-course-offers-more'));
});

test('absent, failed and empty offer panels preserve their distinct meaning in French and English', () => {
  for (const locale of ['fr', 'en']) {
    const t = getCommerceDictionary(locale);
    assert.equal(render(CourseOffers, { locale }), '');
    const failed = render(CourseOffers, { locale, result: unavailable });
    assert.ok(failed.includes(html(t.unavailable)) && failed.includes(html(t.refresh))); assert.doesNotMatch(failed, /Aucune offre|No published offer|data-course-offer="/);
    const empty = render(CourseOffers, { locale, result: selection([], 0, locale) });
    assert.match(empty, locale === 'fr' ? /Aucune offre publiée/ : /No published offer/); assert.doesNotMatch(empty, /data-course-offer="|data-course-offer-link|data-course-offers-more/);
  }
});

test('a course panel uses the server price, inclusions, terms and exact offer detail without performing a purchase', () => {
  for (const locale of ['fr', 'en']) {
    const value = offer(locale), output = render(CourseOffers, { locale, result: selection([value], 1, locale) }), t = getCommerceDictionary(locale);
    assert.ok(output.includes(`data-course-offer="${value.id}"`) && output.includes('data-offer-revision="6"'));
    assert.ok(output.includes(`href="${offersPath(locale, value.id)}"`)); assert.ok(output.includes('data-course-offer-price'));
    assert.match(output, locale === 'fr' ? /12,34/ : /12\.34/); assert.ok(output.includes('Synthetic course'));
    assert.ok(output.includes('data-order-terms-version="synthetic-v6"') && output.includes('SYNTHETIC_IMMUTABLE_TERMS'));
    assert.ok(!output.includes(html(t.prepare)) && !output.includes(html(t.checkout))); assert.doesNotMatch(output, /<form\b|type="checkbox"/);
  }
});

test('an incomplete offer reports preparation readiness without pretending that only payment is missing', () => {
  for (const locale of ['fr', 'en']) {
    const value = offer(locale); value.price = null; value.readiness.summaryReady = false;
    value.readiness.blockingIssues = [{ code: 'PRICE_REQUIRED', field: 'price', resourceId: null, locale: null }]; value.readiness.checkoutUnavailableReason = 'OFFER_NOT_READY';
    const output = render(CourseOffers, { locale, result: selection([value], 1, locale) }), t = getCommerceDictionary(locale);
    assert.ok(output.includes(html(t.priceUnknown))); assert.match(output, locale === 'fr' ? /ne peut pas encore être commandée/ : /cannot be ordered yet/); assert.ok(!output.includes(html(t.prepare)));
  }
});

test('filtered offer-list pagination and its language links retain the paired course/version filter', () => {
  for (const locale of ['fr', 'en']) {
    const value = offer(locale), output = render(PublicOffers, { locale, course, result: success({ items: [summary(value)], page: 0, pageSize: 1, total: 3 }) });
    assert.ok(output.includes(`href="${html(offersHref(locale, { page: 1, pageSize: 1 }, course))}"`));
    const other = locale === 'fr' ? 'en' : 'fr';
    assert.ok(output.includes(`href="${html(offersHref(other, {}, course))}"`));
    assert.ok(output.includes(`href="${offersPath(locale, value.id)}"`));
  }
});

test('one identical module and lesson show one deliverable with the lesson access and exact route, preserving both version records', () => {
  for (const locale of ['fr', 'en']) {
    const child = activity(37, locale), parent = moduleNode(11, locale, [child], { title: child.title, summary: child.summary, access: 'FREE' });
    const { programme, versions, activityHrefs } = renderCourse(locale, [parent]), t = getPublicDictionary(locale);
    assert.equal(occurrences(programme, child.title), 1); assert.equal(occurrences(programme, child.summary), 1);
    assert.equal(occurrences(programme, t.PROTECTED), 1); assert.equal(occurrences(programme, t.FREE), 0);
    assert.ok(programme.includes(`href="${html(activityHrefs[child.versionId])}"`));
    assert.equal((programme.match(/<li\b/g) ?? []).length, 1);
    assert.equal((versions.match(/<li\b/g) ?? []).length, 2); assert.equal(occurrences(versions, child.title), 2);
    assert.ok(plain(versions).includes(`${t.version} ${parent.versionNumber}`) && plain(versions).includes(`${t.version} ${child.versionNumber}`));
  }
});

test('distinct, multi-activity, unavailable and language-specific branches retain their hierarchy and every version', () => {
  for (const locale of ['fr', 'en']) {
    const child = activity(37, locale), other = activity(38, locale), base = moduleNode(11, locale, [child], { title: child.title, summary: child.summary });
    const cases = [
      { node: { ...base, children: [child, other] }, expectedRows: 3 },
      { node: { ...base, title: 'Distinct module objective' }, expectedRows: 2 },
      { node: { ...base, summary: 'Distinct module deliverable' }, expectedRows: 2 },
      { node: { ...base, availability: 'WITHDRAWN' }, expectedRows: 2 },
      { node: { ...base, children: [{ ...child, availability: 'STALE' }] }, expectedRows: 2 },
      { node: { ...base, children: [{ ...child, locale: locale === 'fr' ? 'en' : 'fr' }] }, expectedRows: 2 },
      { node: { ...base, children: [{ ...child, children: [other] }] }, expectedRows: 3 },
    ];
    for (const { node, expectedRows } of cases) {
      const { programme, versions } = renderCourse(locale, [node]), t = getPublicDictionary(locale);
      assert.equal((programme.match(/<li\b/g) ?? []).length, expectedRows); assert.equal((versions.match(/<li\b/g) ?? []).length, expectedRows);
      assert.ok(programme.includes(html(node.title)) && programme.includes(html(child.title)));
      assert.ok(plain(versions).includes(`${t.version} ${node.versionNumber}`) && plain(versions).includes(`${t.version} ${child.versionNumber}`));
      if (node.availability !== 'PUBLISHED') assert.ok(programme.includes(html(t[node.availability])));
      if (node.children[0].availability !== 'PUBLISHED') assert.ok(programme.includes(html(t[node.children[0].availability])));
    }
  }
});

test('the unique trial action follows the hero introduction and opens the same exact activity as its secondary preview link', () => {
  for (const locale of ['fr', 'en']) {
    const child = activity(37, locale, { access: 'FREE' }), parent = moduleNode(11, locale, [child], { title: child.title, summary: child.summary });
    const { output, activityHrefs, resource } = renderCourse(locale, [parent]), copy = getCourseDictionary(locale);
    const hero = [...output.matchAll(/<header\b[^>]*>([\s\S]*?)<\/header>/g)].find(([, body]) => /<h1\b/.test(body))?.[1];
    assert.ok(hero && hero.includes('data-course-trial')); assert.equal((output.match(/\bdata-course-trial=/g) ?? []).length, 1);
    const action = hero.match(/<a\b(?=[^>]*\bdata-course-trial=)[^>]*>/)?.[0];
    assert.ok(action?.includes(`href="${html(activityHrefs[child.versionId])}"`));
    assert.ok(hero.indexOf(html(resource.summary)) < hero.indexOf('data-course-trial'));
    const preview = [...output.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].find(([, body]) => body.includes(html(copy.preview)))?.[1];
    assert.ok(preview?.includes(`href="${html(activityHrefs[child.versionId])}"`) && preview.includes(html(copy.previewOpen)));
    assert.ok(!preview.includes('data-course-trial'));
  }
});
