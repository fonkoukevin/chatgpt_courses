import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CookieJar, createHTTPSClient, requestHTTPS } from '../../scripts/deployment/http.mjs';
import { smokeArguments, runSmoke } from '../../scripts/deployment/smoke.mjs';

test('volatile session cookies preserve required flags without accepting another domain or exposing values', () => {
  const jar = new CookieJar('https://courses.localhost'), sentinel = 'SYNTHETIC_COOKIE_PRIVATE';
  jar.ingest([`SESSION=${sentinel}; Path=/; Secure; HttpOnly; SameSite=Lax`, 'foreign=refused; Domain=example.invalid; Path=/']);
  const session = jar.get('SESSION'); assert.ok(session.secure && session.httpOnly && session.sameSite === 'lax' && session.path === '/');
  assert.equal(jar.header().includes('foreign'), false); assert.equal(jar.header().includes(sentinel), true);
  assert.equal(JSON.stringify(jar).includes(sentinel), false); assert.equal(inspect(jar).includes(sentinel), false);
  jar.clear(); assert.equal(jar.header(), '');
});

test('cookie path boundaries and expiry prevent stale or unrelated headers', () => {
  const jar = new CookieJar('https://courses.localhost'); jar.ingest(['scoped=one; Path=/api; Secure', 'gone=zero; Path=/; Max-Age=0']);
  assert.equal(jar.header('/apix'), ''); assert.equal(jar.header('/api/item'), 'scoped=one'); assert.equal(jar.get('gone'), null);
  jar.ingest(['scoped=removed; Path=/api; Max-Age=0']); assert.equal(jar.header('/api'), '');
});

test('HTTPS origins, loopback override and relative request boundaries fail closed before any connection', async () => {
  assert.throws(() => createHTTPSClient({ origin: 'http://courses.localhost' }), /HTTPS_CONFIGURATION_INVALID/);
  assert.throws(() => createHTTPSClient({ origin: 'https://example.invalid', localLoopback: true }), /HTTPS_CONFIGURATION_INVALID/);
  const client = createHTTPSClient({ origin: 'https://courses.localhost', localLoopback: true });
  try {
    await assert.rejects(requestHTTPS(client, '//example.invalid/private'), /HTTPS_REQUEST_INVALID/);
    await assert.rejects(client.request('https://example.invalid/private'), /HTTPS_REQUEST_INVALID/);
    await assert.rejects(client.request('/fr', { headers: { Host: 'example.invalid' } }), /HTTPS_REQUEST_INVALID/);
  } finally { client.close(); }
});

test('smoke CLI preserves explicit TLS/Stripe mode while rejecting duplicate or unknown arguments', () => {
  const args = smokeArguments(['--origin', 'https://courses.localhost', '--local-loopback', 'true', '--stripe-enabled', 'false']);
  assert.equal(args.client.localLoopback, true); assert.equal(args.stripeEnabled, false);
  assert.throws(() => smokeArguments(['--origin', 'https://courses.localhost', '--origin', 'https://other.localhost']), /SMOKE_ARGUMENTS_INVALID/);
  assert.throws(() => smokeArguments(['--origin', 'https://courses.localhost', '--rejectUnauthorized', 'false']), /SMOKE_ARGUMENTS_INVALID/);
});
test('the anonymous staging mode is explicit, rejects Basic credentials and cannot be selected for production',()=>{
 const base=['--origin','https://staging.example.org','--environment','staging','--staging-basic-auth-enabled','false'],options=smokeArguments(base);assert.equal(options.environment,'staging');assert.equal(options.stagingBasicAuthEnabled,false);assert.equal(options.client.basicUsername,undefined);assert.equal(options.client.basicPasswordFile,undefined);
 for(const args of [[...base,'--basic-username','reviewer'],[...base,'--basic-password-file','SYNTHETIC'],['--origin','https://staging.example.org','--staging-basic-auth-enabled','false'],['--origin','https://courses.example.org','--environment','production','--staging-basic-auth-enabled','false'],['--origin','https://staging.example.org','--environment','staging','--staging-basic-auth-enabled',''],['--origin','https://staging.example.org','--environment','staging','--staging-basic-auth-enabled','TRUE']])assert.throws(()=>smokeArguments(args),/SMOKE_ARGUMENTS_INVALID/);
});
function smokeFixture({basicConfigured=false,stripeEnabled=true,fault}={}){
 const jar=new CookieJar('https://staging.example.org'),calls=[];
 const reply=(status,type,value,extra={})=>{const body=Buffer.from(typeof value==='string'?value:JSON.stringify(value));return{status,headers:{'content-type':type,'cache-control':'no-store',...extra},body,text:()=>body.toString('utf8'),json:()=>JSON.parse(body.toString('utf8'))};};
 const problem=(status,code)=>reply(status,'application/problem+json',{status,code,traceId:'SYNTHETIC'});
 const client={origin:'https://staging.example.org',basicConfigured,jar,async request(path,input={}){
  calls.push({path,input});const basicMissing=basicConfigured&&input.sendBasic===false;
  if(basicMissing&&path!=='/api/v1/webhooks/stripe')return reply(401,'text/plain','Protected',{'www-authenticate':'Basic realm="staging"'});
  if(path==='/fr'||path==='/en'){const locale=path.slice(1),value=reply(200,'text/html',`<html lang="${locale}"><head><script src="/_next/static/app.js"></script><link rel="stylesheet" href="/_next/static/app.css"></head></html>`,{'x-robots-tag':'noindex, nofollow'});if(fault==='indexable')delete value.headers['x-robots-tag'];if(fault==='publicChallenge')value.headers['www-authenticate']='Basic realm="unexpected"';return value;}
  if(path.endsWith('.js'))return reply(200,'application/javascript','SYNTHETIC_JS');if(path.endsWith('.css'))return reply(200,'text/css','SYNTHETIC_CSS');
  if(path==='/api/v1/system/health')return reply(200,'application/json',{status:'UP'});
  if(path==='/api/v1/auth/csrf'){jar.ingest(['SESSION=SYNTHETIC; Path=/; Secure; HttpOnly; SameSite=Lax']);return reply(200,'application/json',{token:'SYNTHETIC',headerName:'X-CSRF-TOKEN'});}
  if(path==='/api/v1/me/profile'||path.startsWith('/api/v1/admin/contents')){const result=problem(401,'AUTHENTICATION_REQUIRED');if(fault==='privateChallenge')result.headers['www-authenticate']='Basic realm="unexpected"';if(fault==='adminOpen'&&path.startsWith('/api/v1/admin'))return reply(200,'application/json',{items:[]});return result;}
  if(path==='/api/v1/auth/logout'||path==='/api/v1/webhooks/stripe/POST')return problem(403,'CSRF_INVALID');
  if(path==='/api/v1/webhooks/stripe')return fault==='webhookAccepted'?reply(200,'application/json',{}):problem(stripeEnabled?400:503,stripeEnabled?'STRIPE_WEBHOOK_INVALID':'PAYMENT_NOT_CONFIGURED');
  if(path==='/api/v1/system/unknown')return problem(404,'RESOURCE_NOT_FOUND');throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
 }};return{client,calls};
}
test('anonymous staging checks real protocol boundaries without Basic: FR/EN200, noindex, secure session, private/admin401 and signed-webhook rejection',async()=>{
 const f=smokeFixture(),result=await runSmoke(f.client,{environment:'staging',stagingBasicAuthEnabled:false,stripeEnabled:true});assert.equal(result.result,'passed');assert.equal(result.stagingBasicAuthEnabled,false);assert.equal(result.checks.find(c=>c.id==='ADMIN_UNAUTHENTICATED').status,401);assert.equal(result.checks.find(c=>c.id==='WEBHOOK_EXACT_FAIL_CLOSED').status,400);
 for(const path of ['/fr','/en','/api/v1/me/profile','/api/v1/admin/contents?page=0&size=1']){const request=f.calls.find(c=>c.path===path);assert.equal(request.input.sendBasic,false);assert.equal(request.input.sendCookies,false);}assert.equal(result.checks.some(c=>c.id==='STAGING_BASIC_PERIMETER'),false);
 for(const fault of ['indexable','publicChallenge','privateChallenge','adminOpen','webhookAccepted']){const bad=smokeFixture({fault}),r=await runSmoke(bad.client,{environment:'staging',stagingBasicAuthEnabled:false,stripeEnabled:true});assert.equal(r.result,'failed',fault);}
});
test('strict/default smoke remains compatible, and an explicit mode mismatch fails before any HTTP request',async()=>{
 const strict=smokeFixture({basicConfigured:true,stripeEnabled:false}),result=await runSmoke(strict.client);assert.equal(result.result,'passed');assert.equal(result.checks.length,12);assert.equal(result.checks.find(c=>c.id==='STAGING_BASIC_PERIMETER').status,401);
 for(const options of [{environment:'production',stagingBasicAuthEnabled:false},{environment:'staging',stagingBasicAuthEnabled:false},{environment:'staging',stagingBasicAuthEnabled:'false'}]){const f=smokeFixture({basicConfigured:true});assert.equal((await runSmoke(f.client,options)).result,'failed');assert.equal(f.calls.length,0);}
});

test('CLI configuration failures emit a safe JSON summary without private origin arguments', () => {
  const sentinel = 'SYNTHETIC_PRIVATE_ARGUMENT', script = fileURLToPath(new URL('../../scripts/deployment/smoke.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--origin', `https://user:${sentinel}@courses.localhost/?secret=${sentinel}`], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 1); assert.equal((result.stdout + result.stderr).includes(sentinel), false);
  const summary = JSON.parse(result.stdout); assert.equal(summary.result, 'failed'); assert.equal(summary.failedCheck, 'INITIAL_CONFIGURATION'); assert.deepEqual(summary.checks, []);
});
