import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateOffer, OfferFields, OfferView, OrderView } from '../../apps/web/src/lib/api/generated/types.gen';
import { csrfHeaders } from './editorial-fixture';
import { createLearningFixture, learningContent } from './learning-fixture';
import { contentAction, createContent, currentContent, type RecordedContent } from './editorial-api';
import { publishPublicContent } from './public-content-fixture';

export const checkedUuid = (value: string) => { if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)) throw new Error('Fixture UUID required.'); return value; };
// This test privilege exists only against the supervisor-owned disposable PostgreSQL.
export function commerceSql(sql: string) {
  const container=process.env.COURSES_BROWSER_DB_ID, run=process.env.COURSES_BROWSER_RUN_ID;
  if(process.env.APP_ENV!=='test'||!container||!/^[a-f0-9]{64}$/.test(container)||!run)throw new Error('Owned isolated PostgreSQL required.');
  const check=spawnSync('docker',['inspect','--format','{{ index .Config.Labels "com.chatgptcourses.browser-run" }}',container],{windowsHide:true,encoding:'utf8',timeout:10000});
  if(check.status!==0||check.stdout.trim()!==run)throw new Error('Database ownership not confirmed.');
  const result=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','browser_test','-d','courses_browser','-At'],{windowsHide:true,encoding:'utf8',timeout:10000,input:sql});
  if(result.status!==0)throw new Error('Commerce fixture operation not confirmed; no database payload is logged.');
  return result.stdout.trim();
}
export async function commerceHeaders(request:APIRequestContext,actor:string,etag?:string) {
  return {...await csrfHeaders(request),'X-Account-Context':checkedUuid(actor),...(etag?{'If-Match':etag}:{})};
}
export async function createCommerceSources(request:APIRequestContext) {
  const learning=await createLearningFixture(request);
  const me=await request.get('/api/v1/auth/me'); expect(me.status()).toBe(200); const actor=checkedUuid((await me.json() as {id:string}).id);
  const role=randomUUID();
  expect(commerceSql(`BEGIN; INSERT INTO roles(id,code) VALUES('${role}','P11_TEST_${role.replaceAll('-','').toUpperCase()}'); INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('commerce.offers.read','commerce.offers.write','commerce.offers.activate'); INSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}'); COMMIT; SELECT count(*) FROM role_permissions WHERE role_id='${role}';`)).toBe('3');
  const command=learningContent('fr','PROTECTED'); command.kind='COURSE';command.title='P11 · second parcours fictif';command.slug=`p11-course-${randomUUID()}`;command.childVersionIds=[learning.module.fr.value.versionId];
  let fr=await publishPublicContent(request,await createContent(request,command));
  const translated=learningContent('en','PROTECTED');
  const en=await publishPublicContent(request,await contentAction(request,fr,'translations',{locale:'en',slug:`p11-course-${randomUUID()}-en`,title:'P11 · second fictional course',summary:'Fictional integration content only.',document:translated.document,reason:'P11 disposable English fixture'},201));
  fr=await currentContent(request,fr.value.id);
  return {actor,learning,second:{fr,en}};
}
export type CommerceSources=Awaited<ReturnType<typeof createCommerceSources>>;
export function fixtureOfferFields(resources:RecordedContent[],amountMinor=1299):OfferFields {
  return {copies:[{locale:'fr',title:'P11 · offre fictive de recette',summary:'Données fictives de test, aucun tarif commercial.'},{locale:'en',title:'P11 · fictional verification offer',summary:'Fictional test data, no commercial price.'}],
    resources:resources.map(({value})=>({resourceId:value.resourceId,versionId:value.versionId})),locales:['fr','en'],price:{amountMinor,currency:'EUR'},
    tax:{mode:'EXEMPT',notices:[{locale:'fr',text:'Configuration fiscale fictive de test uniquement.'},{locale:'en',text:'Fictional tax configuration for testing only.'}]},
    conditions:{access:{mode:'FIXED',days:30},updates:{mode:'NONE',days:null},versionPolicy:'PINNED',support:{mode:'NONE',descriptions:[]},humanReviewIncluded:false,termsVersion:'p11-test-v1',
      terms:[{locale:'fr',text:'Conditions fictives de recette, sans valeur de conditions de vente.'},{locale:'en',text:'Fictional verification conditions, not commercial terms.'}]}};
}
export async function createFixtureOffer(request:APIRequestContext,actor:string,resources:RecordedContent[],amountMinor=1299) {
  const fields=fixtureOfferFields(resources,amountMinor),command:CreateOffer={code:`demo-p11-${randomUUID()}`,kind:resources.length===1?'COURSE':'PACK',fields,reason:'P11 explicit disposable integration fixture only'};
  const response=await request.post('/api/v1/admin/offers',{headers:await commerceHeaders(request,actor),data:command});expect(response.status()).toBe(201);
  const value=await response.json() as OfferView;
  const ready=await request.get(`/api/v1/admin/offers/${value.id}/readiness`);expect(ready.status()).toBe(200);expect((await ready.json() as {summaryReady:boolean}).summaryReady).toBe(true);
  const activate=await request.post(`/api/v1/admin/offers/${value.id}/activate`,{headers:await commerceHeaders(request,actor,response.headers().etag),data:{reason:'P11 explicit test-only activation, no checkout'}});expect(activate.status()).toBe(200);
  return {value:await activate.json() as OfferView,etag:activate.headers().etag};
}
export async function prepareOrder(request:APIRequestContext,actor:string,offer:OfferView,locale:'fr'|'en',key=randomUUID()) {
  const response=await request.post('/api/v1/me/orders',{headers:{...await commerceHeaders(request,actor),'Idempotency-Key':key},data:{offerId:offer.id,offerRevision:offer.revision,locale,acceptedTermsVersion:'p11-test-v1'}});
  expect([200,201]).toContain(response.status());return {value:await response.json() as OrderView,etag:response.headers().etag,key};
}
