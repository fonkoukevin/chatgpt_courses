import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real server page, public HTTP decoder and React tree. Only the Next boundary
// and the upstream transport are replaced; no account, purchase or network I/O.
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript');
const root = fileURLToPath(new URL('../..', import.meta.url)), sources = resolve(root, 'apps/web/src');
const originalResolve = Module._resolveFilename, originalLoad = Module._load, originalFetch = globalThis.fetch;
const originals = Object.fromEntries(['.ts', '.tsx'].map(extension => [extension, Module._extensions[extension]]));
let cookieReads = 0;
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith('@/') ? resolve(sources, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') return {};
  if (request === 'next/headers') return { cookies: async () => { cookieReads++; throw Error('Public presentations must not read an account session.'); } };
  if (request === '../config/server' && ['lib/api/commerce-server.ts', 'lib/public/seo.ts'].some(file => parent?.filename === resolve(sources,file))) return { getServerConfig: () => ({ environment: 'production', publicOrigin: 'https://courses.example.invalid', publishedLocales: ['fr','en'], apiInternalOrigin: 'http://127.0.0.1:8080', apiTimeoutMs: 1000 }) };
  return originalLoad.call(this, request, parent, ...args);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
  assert.ok(filename.startsWith(sources + sep));
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
afterEach(() => { globalThis.fetch = originalFetch; assert.equal(cookieReads,0); });
after(() => { Module._resolveFilename = originalResolve; Module._load = originalLoad; for (const [extension,original] of Object.entries(originals)) if (original) Module._extensions[extension] = original; else delete Module._extensions[extension]; });

const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { PublicNavigationProvider } = require(resolve(sources,'components/layouts/public-navigation.tsx'));
const { offerPage, offerMetadata } = require(resolve(sources,'components/commerce/server-pages.tsx'));
const { PublicOffers } = require(resolve(sources,'components/commerce/offers.tsx'));
const { OfferTerms } = require(resolve(sources,'components/commerce/parts.tsx'));
const { getCommerceDictionary } = require(resolve(sources,'lib/i18n/commerce.ts'));
const { offersPath } = require(resolve(sources,'lib/commerce/routes.ts'));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const id = uuid(1), success = data => ({ok:true,data,status:200});
const texts = (fr,en) => [{locale:'fr',text:fr},{locale:'en',text:en}];
const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
function offer(locale) { return { id, productId:uuid(2), revision:4, code:'synthetic-language-offer', kind:'COURSE', state:'ACTIVE', locale, translationAvailable:true,
  title:locale === 'fr' ? 'Offre fictive FR' : 'Fictional EN offer', summary:'Synthetic integration text only.', resources:[{resourceId:uuid(3),versionId:uuid(4),versionNumber:1,locale,title:'Synthetic source',slug:'synthetic-source',availability:'PUBLISHED',access:'PROTECTED'}], locales:['fr','en'], price:{amountMinor:1234,currency:'EUR'},
  tax:{mode:'EXEMPT',notices:texts('Notice fiscale fictive conservée.','Fictional retained tax notice.')}, conditions:{access:{mode:'FIXED',days:30},updates:{mode:'NONE',days:null},versionPolicy:'PINNED',support:{mode:'ASYNC',descriptions:texts('Aide fictive conservée.','Fictional retained help.')},humanReviewIncluded:false,termsVersion:'synthetic-v4',terms:texts('Conditions fictives conservées.','Fictional retained terms.')},
  readiness:{offerId:id,checkedRevision:4,summaryReady:true,checkoutAvailable:false,blockingIssues:[],warnings:[],checkoutUnavailableReason:'PAYMENT_NOT_CONFIGURED'} }; }
const props = locale => ({params:Promise.resolve({locale,offerId:id}),searchParams:Promise.resolve({})});
function render(element) { return renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(PublicNavigationProvider,{value:{methods:false,guides:false,offers:false}},element))); }
function upstream(values) {
  const requests = [];
  globalThis.fetch = async(input,init) => {
    const url = new URL(input); assert.equal(url.origin,'http://127.0.0.1:8080'); assert.equal(url.pathname,`/api/v1/offers/${id}`); assert.equal(init.method,'GET'); assert.equal(init.cache,'no-store'); assert.equal(init.redirect,'error'); assert.equal(new Headers(init.headers).has('Cookie'),false);
    const locale = url.searchParams.get('locale'); requests.push(locale); const value = values[locale]; if (value instanceof Error) throw value; return Response.json(value);
  };
  return requests;
}
const switchLink = (html,locale) => html.match(new RegExp('<a\\b[^>]*data-language-switch="'+locale+'"[^>]*>'))?.[0];

test('published presentations use the same equivalent offer IDs in the rendered switch and metadata',async() => {
  for (const locale of ['fr','en']) {
    const requests=upstream({fr:offer('fr'),en:offer('en')}), output=render(await offerPage(locale)(props(locale))), metadata=await offerMetadata(locale)(props(locale));
    assert.deepEqual(requests,['fr','en','fr','en']);
    for (const target of ['fr','en']) { assert.ok(switchLink(output,target).includes('data-language-available="true"')); assert.ok(switchLink(output,target).includes(`href="${offersPath(target,id)}"`)); assert.equal(metadata.alternates.languages[target],'https://courses.example.invalid'+offersPath(target,id)); }
  }
});

test('a missing presentation is identified before navigation and falls back to offers in the chosen language',async() => {
  const fr=offer('fr'), en=offer('en'); fr.locales=['fr']; en.locales=['fr']; en.translationAvailable=false; en.title=null; en.summary=null; en.resources=en.resources.map(value=>({...value,title:null,slug:null,availability:'TRANSLATION_MISSING',access:null}));
  upstream({fr,en});
  const output=render(await offerPage('fr')(props('fr'))), metadata=await offerMetadata('fr')(props('fr'));
  assert.ok(switchLink(output,'en').includes('data-language-available="false"')); assert.ok(switchLink(output,'en').includes('href="/en/offers"'));
  assert.match(output,/data-offer-language="en" data-offer-language-state="MISSING"/); assert.ok(output.includes(escape(getCommerceDictionary('fr').presentationMissing)));
  assert.deepEqual(metadata.alternates.languages,{fr:'https://courses.example.invalid'+offersPath('fr',id)});
  const unavailablePage=render(await offerPage('en')(props('en'))); assert.ok(unavailablePage.includes(escape(getCommerceDictionary('en').missingTranslation))); assert.ok(unavailablePage.includes(`href="${offersPath('fr',id)}"`)); assert.ok(unavailablePage.includes('href="/en/offers"'));
});

test('a failed counterpart read is an unverified service state, never a missing translation claim',async() => {
  upstream({fr:offer('fr'),en:new TypeError('Synthetic upstream interruption')});
  const output=render(await offerPage('fr')(props('fr'))), copy=getCommerceDictionary('fr');
  assert.match(output,/data-offer-language="en" data-offer-language-state="UNAVAILABLE"/); assert.ok(output.includes(escape(copy.presentationCheckUnavailable))); assert.ok(!output.includes(escape(copy.presentationMissing))); assert.ok(switchLink(output,'en').includes('data-language-available="false"'));
});

test('a translated presentation outside the included languages remains readable without becoming an indexed sale variant',async() => {
  const fr=offer('fr'), en=offer('en'); fr.locales=['fr']; en.locales=['fr']; upstream({fr,en});
  const output=render(await offerPage('fr')(props('fr'))), metadata=await offerMetadata('fr')(props('fr'));
  assert.match(output,/data-offer-language="en" data-offer-language-state="AVAILABLE"/); assert.ok(switchLink(output,'en').includes('data-language-available="true"')); assert.ok(switchLink(output,'en').includes(`href="${offersPath('en',id)}"`));
  assert.deepEqual(metadata.alternates.languages,{fr:'https://courses.example.invalid'+offersPath('fr',id)});
  const english=render(await offerPage('en')(props('en'))); assert.ok(english.includes(escape(en.title))); assert.ok(english.includes(escape(getCommerceDictionary('en').languageNotIncluded))); assert.ok(!english.includes(escape(getCommerceDictionary('en').presentationMissing)));
  const englishMetadata=await offerMetadata('en')(props('en')); assert.equal(englishMetadata.robots.index,false); assert.equal(englishMetadata.alternates.languages,undefined);
});

test('an inactive offer does not advertise an available presentation',async() => {
  const fr=offer('fr'), en=offer('en'); fr.state='INACTIVE'; en.state='INACTIVE'; upstream({fr,en});
  const output=render(await offerPage('fr')(props('fr'))); for (const target of ['fr','en']) { assert.ok(switchLink(output,target).includes('data-language-available="false"')); assert.ok(output.includes(`data-offer-language="${target}" data-offer-language-state="INACTIVE"`)); }
});

test('offer list language navigation remains available without claiming that an individual offer is translated',() => {
  for (const locale of ['fr','en']) { const output=render(React.createElement(PublicOffers,{locale,result:success({items:[],page:0,pageSize:20,total:0})})); for (const target of ['fr','en']) { assert.ok(switchLink(output,target).includes('data-language-available="true"')); assert.ok(switchLink(output,target).includes(`href="${offersPath(target)}"`)); } }
});

test('English order UI retains French snapshot terms, help and tax text with French language annotations',() => {
  const source=offer('fr'), output=render(React.createElement(OfferTerms,{locale:'en',contentLocale:'fr',conditions:source.conditions,tax:source.tax}));
  for (const field of [source.conditions.support.descriptions,source.tax.notices,source.conditions.terms]) { assert.ok(output.includes(escape(field[0].text))); assert.ok(!output.includes(escape(field[1].text))); assert.match(output,new RegExp('<(?:dd|p) lang="fr"[^>]*>'+escape(field[0].text))); }
  const missing=render(React.createElement(OfferTerms,{locale:'en',contentLocale:'fr',conditions:null,tax:null})); assert.match(missing,/<p lang="en"[^>]*>Not specified<\/p>/);
});
