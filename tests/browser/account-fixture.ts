import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { AssetUploadIntent, AssetView, AttestationEligibility, AttestationView, CreateSupportTicket, DataRequestView, ProfileView, SupportTicketView } from '../../apps/web/src/lib/api/generated/types.gen';
import { commerceSql, checkedUuid } from './commerce-fixture';
import { csrfHeaders } from './editorial-fixture';

export const accountHeaders = async (request:APIRequestContext,actor:string,etag?:string,key?:string) => ({...await csrfHeaders(request),'X-Account-Context':checkedUuid(actor),...(etag?{'If-Match':etag}:{}),...(key?{'Idempotency-Key':checkedUuid(key)}:{})});
export async function profile(request:APIRequestContext){const r=await request.get('/api/v1/me/profile');expect(r.status()).toBe(200);return {value:await r.json() as ProfileView,etag:r.headers().etag};}
export async function nameProfile(request:APIRequestContext,actor:string,name='Élodie · recette P14'){
  const before=await profile(request);const r=await request.patch('/api/v1/me/profile',{headers:await accountHeaders(request,actor,before.etag),data:{displayName:name}});expect(r.status()).toBe(200);return await r.json() as ProfileView;
}
export async function createTicket(request:APIRequestContext,actor:string,body:Partial<CreateSupportTicket>={}){
  const command:CreateSupportTicket={category:'TECHNICAL',subject:'Recette P14 · aide locale',message:'Message synthétique explicitement choisi pour la recette locale.',locale:'fr',context:null,attachmentIds:[],...body};
  const r=await request.post('/api/v1/me/support-tickets',{headers:await accountHeaders(request,actor,undefined,randomUUID()),data:command});expect(r.status()).toBe(201);return await r.json() as SupportTicketView;
}
export async function ticket(request:APIRequestContext,id:string,admin=false){const r=await request.get(`/api/v1/${admin?'admin':'me'}/support-tickets/${checkedUuid(id)}`);expect(r.status()).toBe(200);return {value:await r.json() as SupportTicketView,etag:r.headers().etag};}
export async function supportReply(request:APIRequestContext,actor:string,id:string){
  const before=await ticket(request,id,true);const r=await request.post(`/api/v1/admin/support-tickets/${id}/messages`,{headers:await accountHeaders(request,actor,before.etag,randomUUID()),data:{message:'Réponse de recette réellement enregistrée par le compte opérateur de test.',attachmentIds:[]}});expect(r.status()).toBe(201);return r;
}
export function grantSupportOperator(actor:string){
  checkedUuid(actor);const role=randomUUID();
  expect(commerceSql(`BEGIN; INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code='SUPPORT_OPERATOR'; INSERT INTO roles(id,code) VALUES('${role}','P14_MAIL_${role.replaceAll('-','').toUpperCase()}'); INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),'${role}',id FROM permissions WHERE code IN('notifications.read','notifications.manage'); INSERT INTO user_roles(id,user_id,role_id) VALUES(gen_random_uuid(),'${actor}','${role}'); COMMIT; SELECT count(*) FROM user_roles WHERE user_id='${actor}';`)).toBe('3');
}
export async function uploadSupportFile(request:APIRequestContext,binary:APIRequestContext,actor:string,projectId:string,filename='p14-selected.txt'){
  const bytes=Buffer.from('Fichier synthétique P14 choisi explicitement.\n','utf8');
  const r=await request.post(`/api/v1/me/projects/${checkedUuid(projectId)}/upload-intents`,{headers:await accountHeaders(request,actor),data:{filename,contentType:'text/plain',sizeBytes:bytes.length}});expect(r.status()).toBe(201);const intent=await r.json() as AssetUploadIntent;
  let transferred=false;try{const put=await binary.put(intent.uploadUrl,{headers:intent.headers,data:bytes});transferred=[200,201,204].includes(put.status());}catch{throw new Error('Isolated S3 transfer failed; signed URL and headers omitted.');}expect(transferred).toBe(true);
  const done=await request.post(`/api/v1/me/projects/${projectId}/attachments`,{headers:await accountHeaders(request,actor),data:{assetId:intent.asset.id}});expect(done.status()).toBe(200);const asset=await done.json() as AssetView;expect(asset.state).toBe('READY');return {asset,bytes};
}
export async function eligibility(request:APIRequestContext,enrollment:string,locale:'fr'|'en'='fr'){
  const r=await request.get(`/api/v1/me/enrollments/${checkedUuid(enrollment)}/attestation-eligibility?locale=${locale}`);expect(r.status()).toBe(200);return await r.json() as AttestationEligibility;
}
export async function issue(request:APIRequestContext,actor:string,enrollment:string,locale:'fr'|'en'='fr',key=randomUUID()){
  const e=await eligibility(request,enrollment,locale);const r=await request.post(`/api/v1/me/enrollments/${enrollment}/attestations`,{headers:await accountHeaders(request,actor,undefined,key),data:{locale,expectedEvidenceFingerprint:e.evidenceFingerprint}});expect([200,201]).toContain(r.status());return await r.json() as AttestationView;
}
export async function createDataRequest(request:APIRequestContext,actor:string,type:'EXPORT'|'ERASURE'|'ACCOUNT_CLOSURE'='EXPORT'){
  const r=await request.post('/api/v1/me/data-requests',{headers:await accountHeaders(request,actor,undefined,randomUUID()),data:{type,reason:'Demande synthétique P14, aucun traitement irréversible.'}});expect(r.status()).toBe(201);return await r.json() as DataRequestView;
}
export async function captureAccount(page:Page,name:string,width=390){
  await page.setViewportSize({width,height:width>=1000?1000:844});
  if(await page.getByRole('alertdialog').count()===0)await page.getByRole('main').focus();await page.evaluate(async()=>{scrollTo(0,0);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  if(!fits){const bounds=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).map(element=>{const r=element.getBoundingClientRect();return{tag:element.tagName,classes:typeof element.className==='string'?element.className.slice(0,180):'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};}).filter(r=>r.right>innerWidth+1||r.left< -1).slice(0,30));await test.info().attach('overflow-bounds-no-text',{body:Buffer.from(JSON.stringify(bounds)),contentType:'application/json'});await page.screenshot({path:join(process.env.COURSES_BROWSER_EVIDENCE!,`${name}-overflow.png`),fullPage:true,animations:'disabled'});}
  expect(fits).toBe(true);
  await page.screenshot({path:join(process.env.COURSES_BROWSER_EVIDENCE!,`${name}.png`),fullPage:true,animations:'disabled'});
}
