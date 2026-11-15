// Execute the real TypeScript Proxy/API handlers with an in-memory upstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {compileFunction} from 'node:vm';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
import {loadStagingPassword,stagingBasicAuthEnabled} from '../../scripts/container/web-entrypoint.mjs';

const require=createRequire(import.meta.url),root=resolve('.'),sourceRoot=resolve('apps/web/src');
function loadTypeScript(file,cache=new Map()){
  file=resolve(file);if(!existsSync(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;
  const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},fileName:file}).outputText,module={exports:{}};cache.set(file,module);
  const importModule=name=>name==='server-only'?{}:name.startsWith('@/')?loadTypeScript(resolve(sourceRoot,name.slice(2)),cache):name.startsWith('.')?loadTypeScript(resolve(dirname(file),name),cache):require(name);
  compileFunction(output,['require','module','exports'],{filename:file})(importModule,module,module.exports);return module.exports;
}
const {proxy}=loadTypeScript(resolve(sourceRoot,'proxy.ts'));
const api=loadTypeScript(resolve(sourceRoot,'app/api/v1/[...path]/route.ts'));
const {stagingBasicAuthEnabled:frontendFlag}=loadTypeScript(resolve(sourceRoot,'lib/config/staging.ts'));
const keys=['APP_ENV','NODE_ENV','APP_PUBLIC_ORIGIN','API_INTERNAL_URL','APP_DEFAULT_LOCALE','APP_PUBLISHED_LOCALES','STAGING_BASIC_AUTH_ENABLED','STAGING_BASIC_USERNAME','STAGING_BASIC_PASSWORD'];
const secret='SYNTHETIC_STAGING_PASSWORD_24_CHARS';
async function withEnvironment(extra,action){const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));try{for(const key of keys)delete process.env[key];Object.assign(process.env,{APP_ENV:'staging',APP_PUBLIC_ORIGIN:'https://staging.example.test',API_INTERNAL_URL:'http://api:8080',APP_DEFAULT_LOCALE:'fr',APP_PUBLISHED_LOCALES:'',...extra});return await action();}finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}}
const request=(path,options={})=>new NextRequest('https://staging.example.test'+path,options);

test('default perimeter still challenges browsers and only the exact POST Stripe endpoint bypasses Basic',async()=>{
 await withEnvironment({STAGING_BASIC_USERNAME:'reviewer',STAGING_BASIC_PASSWORD:secret},()=>{
  for(const path of ['/fr','/en/catalog','/fr/compte','/api/v1/auth/me','/api/v1/webhooks/stripe/extra']){const response=proxy(request(path));assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate'),/^Basic /);}
  assert.equal(proxy(request('/api/v1/webhooks/stripe',{method:'POST'})).headers.get('x-middleware-next'),'1');
  assert.equal(proxy(request('/api/v1/webhooks/stripe')).status,401);
  const response=proxy(request('/fr',{headers:{authorization:'Basic '+Buffer.from('reviewer:'+secret).toString('base64')}}));assert.equal(response.headers.get('x-middleware-next'),'1');
 });
});

test('explicit public staging serves public/private/API paths without Basic while noindex/no-store and application credentials stay unchanged',async()=>{
 await withEnvironment({STAGING_BASIC_AUTH_ENABLED:'false'},()=>{
  for(const path of ['/fr','/en','/fr/catalogue','/en/catalog','/fr/compte','/en/my/projects','/api/v1/auth/me','/api/v1/me/projects','/api/v1/webhooks/stripe']){
   const req=request(path),response=proxy(req);assert.equal(response.status,200);assert.equal(response.headers.get('x-middleware-next'),'1');assert.equal(response.headers.get('www-authenticate'),null);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('x-csrf-token'),null);
  }
 });
});

test('frontend and entrypoint agree on strict flag values and production remains open only through its existing policy',async()=>{
 for(const environment of ['local','test','staging','production'])for(const flag of [undefined,'true','false','','FALSE','0',' true'])await withEnvironment({APP_ENV:environment,...(['local','test'].includes(environment)?{APP_PUBLIC_ORIGIN:'http://localhost:3000',API_INTERNAL_URL:'http://127.0.0.1:8080'}:{}),...(flag===undefined?{}:{STAGING_BASIC_AUTH_ENABLED:flag})},()=>{
  const valid=flag===undefined||flag==='true'||flag==='false'&&environment==='staging';if(valid){assert.equal(frontendFlag(environment),stagingBasicAuthEnabled(process.env));}else{assert.throws(()=>frontendFlag(environment));assert.throws(()=>stagingBasicAuthEnabled(process.env));assert.equal(proxy(request('/fr')).status,503);}
 });
 await withEnvironment({APP_ENV:'production',APP_PUBLISHED_LOCALES:'fr,en'},()=>{const response=proxy(request('/fr'));assert.equal(response.headers.get('www-authenticate'),null);assert.equal(response.headers.get('x-robots-tag'),null);assert.equal(proxy(request('/fr/compte')).headers.get('x-robots-tag'),'noindex, nofollow');});
 await withEnvironment({APP_PUBLIC_ORIGIN:'http://staging.example.test',STAGING_BASIC_AUTH_ENABLED:'false'},()=>assert.throws(()=>proxy(request('/fr')),/HTTPS is required/));
});

test('removing Basic preserves upstream unauthenticated/CSRF refusals, session forwarding and the cross-origin mutation guard',async()=>{
 await withEnvironment({STAGING_BASIC_AUTH_ENABLED:'false'},async()=>{
  const originalFetch=globalThis.fetch;let calls=0;
  try{
   globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');assert.equal(new Headers(options.headers).get('authorization'),null);return Response.json({code:'AUTHENTICATION_REQUIRED'},{status:401});};
   const req=request('/api/v1/auth/me');assert.equal(proxy(req).headers.get('x-middleware-next'),'1');const response=await api.GET(req,{params:Promise.resolve({path:['auth','me']})});assert.equal(response.status,401);assert.equal((await response.json()).code,'AUTHENTICATION_REQUIRED');assert.equal(response.headers.get('www-authenticate'),null);
   globalThis.fetch=async(_url,options)=>{calls++;const headers=new Headers(options.headers);assert.equal(headers.get('cookie'),'SESSION=synthetic-session');assert.equal(headers.get('x-csrf-token'),'synthetic-csrf');assert.equal(headers.get('x-account-context'),'12345678-1234-4234-9234-123456789abc');return Response.json({code:'CSRF_INVALID'},{status:403});};
   const post=request('/api/v1/me/methods',{method:'POST',headers:{origin:'https://staging.example.test',cookie:'other=discard; SESSION=synthetic-session','x-csrf-token':'synthetic-csrf','x-account-context':'12345678-1234-4234-9234-123456789abc','content-type':'application/json'},body:'{}'});const denied=await api.POST(post,{params:Promise.resolve({path:['me','methods']})});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'CSRF_INVALID');assert.equal(denied.headers.get('cache-control'),'private, no-store');
   const before=calls,cross=request('/api/v1/me/methods',{method:'POST',headers:{origin:'https://foreign.example.test'},body:'{}'});const refused=await api.POST(cross,{params:Promise.resolve({path:['me','methods']})});assert.equal(refused.status,403);assert.equal((await refused.json()).code,'INVALID_REQUEST_ORIGIN');assert.equal(calls,before);
  }finally{globalThis.fetch=originalFetch;}
 });
});

test('the real healthcheck in public staging reads robots without Basic secrets or headers and rejects invalid flags before transport',async()=>{
 const source=readFileSync(resolve(root,'scripts/container/web-healthcheck.mjs'),'utf8').replace(/^import[^\n]+\n/,'');
 for(const flag of ['false','','FALSE']){
  const env={APP_ENV:'staging',STAGING_BASIC_AUTH_ENABLED:flag,PORT:'3000'};let calls=0;const processProbe={env,exitCode:0};
  const run=compileFunction('return(async()=>{'+source+'})();',['process','fetch','installWebRuntimeLogging','loadStagingPassword','stagingBasicAuthEnabled','AbortSignal','TextDecoder','console','Buffer']);
  await run(processProbe,async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:3000/robots.txt');assert.equal(options.headers.Authorization,undefined);return new Response('User-Agent: *\nDisallow: /\n',{headers:{'content-type':'text/plain'}});},()=>{},()=>loadStagingPassword(env),()=>stagingBasicAuthEnabled(env),AbortSignal,TextDecoder,{error:()=>{}},Buffer);
  assert.equal(calls,flag==='false'?1:0);assert.equal(processProbe.exitCode,flag==='false'?0:1);
 }
});
