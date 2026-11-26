import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the real robots, metadata and sitemap exports. Next's server-only
// boundary and the public data readers are replaced; no external I/O or session.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
const originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
let config, offers, details, requests;
const success = data => ({ ok: true, data, status: 200 });
const id = '00000000-0000-4000-8000-000000000001';
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') return {};
  if ((request === '@/lib/config/server' || request === '../config/server') && parent?.filename?.startsWith(sources + sep)) return { getServerConfig: () => config };
  if (request === '@/lib/api/public-server') return { readPublications: async (locale, page, pageSize) => { requests.push(['publications', locale, page]); return success({ items: [], page, pageSize, total: 0 }); } };
  if (request === '@/lib/api/commerce-server') return {
    readOffers: async (locale, page, pageSize) => { requests.push(['offers', locale, page]); return success({ items: offers[locale] ?? [], page, pageSize, total: (offers[locale] ?? []).length }); },
    readOffer: async (offerId, locale) => { requests.push(['offer', locale, offerId]); return details[locale]; },
  };
  return originalLoad.call(this, request, parent, ...args);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
after(() => { Module._resolveFilename = originalResolve; Module._load = originalLoad; for (const [extension, original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });
afterEach(() => { config = undefined; offers = undefined; details = undefined; requests = undefined; });
const { GET } = require(resolve(sources, 'app/sitemap.xml/route.ts'));
const { default: robots } = require(resolve(sources, 'app/robots.ts'));
const { publicMetadata } = require(resolve(sources, 'lib/public/seo.ts'));
function scenario(environment = 'production', publishedLocales = ['fr', 'en']) {
  config = { environment, publicOrigin: environment === 'staging' ? 'https://staging.example.invalid' : 'https://courses.example.invalid', publishedLocales };
  offers = { fr: [], en: [] }; details = {}; requests = [];
}
const summary = locale => ({ id, revision: 3, state: 'ACTIVE', locale, translationAvailable: true, title: 'Fictional offer' });
const detail = (locale, locales = ['fr', 'en']) => success({ ...summary(locale), locales });
const languageLinks = { fr: { available: true, href: '/fr' }, en: { available: true, href: '/en' } };

test('staging and local stay nonindexable even with both locales configured, without reading a sitemap feed', async () => {
  for (const environment of ['local', 'test', 'staging']) {
    scenario(environment);
    assert.deepEqual(robots().rules, { userAgent: '*', disallow: '/' });
    const metadata = publicMetadata('fr', 'Titre', 'Résumé', '/fr', languageLinks);
    assert.equal(metadata.robots.index, false); assert.equal(metadata.alternates.languages, undefined);
    const sitemap = await GET(); assert.equal(sitemap.status, 200); assert.ok(!(await sitemap.text()).includes('<loc>')); assert.deepEqual(requests, []);
  }
});

test('production metadata and sitemap use their configured origin and self-inclusive reciprocal HTML equivalents', async () => {
  scenario();
  for (const locale of ['fr', 'en']) {
    const metadata = publicMetadata(locale, 'Title ' + locale, 'Description ' + locale, '/' + locale, languageLinks);
    assert.equal(metadata.robots.index, true); assert.equal(metadata.alternates.canonical, config.publicOrigin + '/' + locale);
    assert.deepEqual(metadata.alternates.languages, { fr: config.publicOrigin + '/fr', en: config.publicOrigin + '/en' });
  }
  assert.equal(robots().sitemap, config.publicOrigin + '/sitemap.xml');
  const response = await GET(), xml = await response.text();
  assert.equal(response.status, 200); assert.ok(xml.includes('<loc>' + config.publicOrigin + '/fr</loc>')); assert.ok(!xml.includes('staging.'));
  assert.ok(!xml.includes('hreflang')); // HTML is the one established equivalence mechanism.
});

test('unlaunched production locale has no indexable metadata, alternate or sitemap entry', async () => {
  scenario('production', ['fr']);
  const fr = publicMetadata('fr', 'Titre', 'Résumé', '/fr', languageLinks), en = publicMetadata('en', 'Title', 'Description', '/en', languageLinks);
  assert.deepEqual(fr.alternates.languages, { fr: config.publicOrigin + '/fr' }); assert.equal(en.robots.index, false); assert.equal(en.alternates.languages, undefined);
  const xml = await (await GET()).text(); assert.ok(!xml.includes(config.publicOrigin + '/en')); assert.ok(requests.every(request => request[1] === 'fr'));
});

test('a readable English offer presentation outside purchased locales is excluded from the sitemap', async () => {
  scenario(); offers = { fr: [summary('fr')], en: [summary('en')] }; details = { fr: detail('fr', ['fr']), en: detail('en', ['fr']) };
  const response = await GET(), xml = await response.text();
  assert.equal(response.status, 200); assert.ok(xml.includes('/fr/offres/' + id)); assert.ok(!xml.includes('/en/offers/' + id));
  assert.equal(requests.filter(request => request[0] === 'offer').length, 2);
});

test('an included active offer enters both locales while inactive or untranslated list items are omitted', async () => {
  scenario(); offers = { fr: [{ ...summary('fr'), state: 'INACTIVE' }], en: [summary('en')] }; details = { en: detail('en') };
  let xml = await (await GET()).text(); assert.ok(!xml.includes('/fr/offres/' + id)); assert.ok(xml.includes('/en/offers/' + id));
  offers.fr = [summary('fr')]; details.fr = detail('fr'); xml = await (await GET()).text(); assert.ok(xml.includes('/fr/offres/' + id));
  offers.fr = [{ ...summary('fr'), translationAvailable: false, title: null }]; xml = await (await GET()).text(); assert.ok(!xml.includes('/fr/offres/' + id));
});

test('a failed or changed offer detail returns an uncached 503 instead of a partial successful sitemap', async () => {
  for (const value of [{ ok: false, error: { kind: 'unavailable' } }, success({ ...summary('fr'), locales: ['fr'], revision: 4 })]) {
    scenario(); offers.fr = [summary('fr')]; details.fr = value;
    const response = await GET(); assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('retry-after'), '60'); assert.equal(await response.text(), '');
  }
});
