import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BACKUP_RECEIPT_BYTES, repository, validateSourceRepository, ghcrConfiguration, ghcrRemoteScript, requireGhcrAnonymousReadDenied, requireGhcrPrivatePackage, validateManifest, manifestBytes, sha256, parseManifest, protectedEnvironment, targetConfiguration, stagingPaymentTestFlag, validateBackupReceipt, validateSchemaFacts } from '../../scripts/deployment/release.mjs';

const prefix='registry.invalid/team/courses';
const candidate=()=>({schemaVersion:1,sourceCommit:'a'.repeat(40),web:{repository:prefix+'/web',digest:'sha256:'+'b'.repeat(64)},api:{repository:prefix+'/api',digest:'sha256:'+'c'.repeat(64)},schema:{min:19,max:19}});
const ghcrEnvironment=()=>({GITHUB_REPOSITORY:'fonkoukevin/chatgpt_courses',IMAGE_REPOSITORY:'ghcr.io/fonkoukevin/chatgpt_courses',GITHUB_ACTOR:'fonkoukevin',GITHUB_RUN_ID:'123456',GITHUB_TOKEN:'SYNTHETIC_EPHEMERAL_JOB_TOKEN_42'});
test('a canonical release binds both immutable images and the tested source/schema; altered pairs do not promote',()=>{
 const manifest=validateManifest(candidate(),prefix),bytes=manifestBytes(manifest),hash=sha256(bytes);
 assert.deepEqual(parseManifest(bytes.toString(),prefix,hash),manifest);
 const altered=candidate();altered.api.digest='sha256:'+'d'.repeat(64);assert.throws(()=>parseManifest(JSON.stringify(altered),prefix,hash),/HASH_MISMATCH/);
 assert.throws(()=>parseManifest(JSON.stringify(manifest),prefix,'0'.repeat(64)),/HASH_MISMATCH/);
 assert.throws(()=>parseManifest(bytes.toString(),prefix.replace('team','other'),hash),/DIGEST_REQUIRED/);
});
test('tags, URL credentials, extra private fields and invented schema compatibility are refused',()=>{
 for(const mutate of [value=>value.web.digest='latest',value=>value.api.repository+=':latest',value=>value.schema.max=20,value=>value.owner='SYNTHETIC_PRIVATE',value=>value.web.url='https://user:password@registry.invalid']){const value=candidate();mutate(value);assert.throws(()=>validateManifest(value,prefix));}
 assert.equal(repository('registry.invalid/courses'),'registry.invalid/courses');
 for(const invalid of ['https://registry.invalid/team/courses','registry.invalid/user/../courses','user:password@registry.invalid/team/courses','registry.invalid/team/courses\nCOMMAND','-registry.invalid/courses','registry:99999/courses','ambiguous/courses'])assert.throws(()=>repository(invalid));
});
test('duplicate keys or noncanonical input cannot disguise a different displayed manifest',()=>{
 const value=candidate(),hash=sha256(manifestBytes(value));
 assert.throws(()=>parseManifest(JSON.stringify(value,null,2),prefix,hash),/CANONICAL/);
 const duplicate=JSON.stringify(value).replace('"schemaVersion":1','"schemaVersion":0,"schemaVersion":1');
 assert.throws(()=>parseManifest(duplicate,prefix,hash),/CANONICAL/);
 assert.throws(()=>parseManifest('x'.repeat(4097),prefix,hash),/MANIFEST_AND_HASH/);
});
test('an absent environment or insufficient branch policy is refused without inventing an administrator-bypass API field',()=>{
 const approved={id:1,name:'staging',created_at:'2026-11-01T00:00:00Z',deployment_branch_policy:{protected_branches:true,custom_branch_policies:false},protection_rules:[]};
 const workflow={created_at:'2026-11-09T00:00:00Z'},branch={protected:true};
 const observed=protectedEnvironment(approved,'staging',workflow,branch);assert.equal(observed.reviewersConfigured,false);assert.equal(observed.adminBypassUiObserved,false);
 for(const value of [{},{...approved,id:0},{...approved,name:'production'},{...approved,deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},{...approved,deployment_branch_policy:null}])assert.throws(()=>protectedEnvironment(value,'staging',workflow,branch),/PROTECTED_ENVIRONMENT/);
 for(const value of [{},{protected:false}])assert.throws(()=>protectedEnvironment(approved,'staging',workflow,value),/DEFAULT_BRANCH_MUST_BE_PROTECTED/);
 assert.throws(()=>protectedEnvironment({...approved,created_at:'2026-11-10T00:00:00Z'},'staging',workflow,branch),/MUST_PREEXIST/);
 const optionalReview={...approved,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:1}}]}]};assert.equal(protectedEnvironment(optionalReview,'staging',workflow,branch).preventSelfReview,false);
 assert.throws(()=>protectedEnvironment({...optionalReview,protection_rules:[{type:'required_reviewers',reviewers:[]}]},'staging',workflow,branch),/REVIEWER_RULE_INVALID/);
});
test('SSH and HTTPS destinations come only from strict authorized environment configuration',()=>{
 const env={TARGET_ENVIRONMENT:'staging',DEPLOY_TARGET_AUTHORIZED:'true',DEPLOY_HOST:'host.example.com',DEPLOY_USER:'courses',DEPLOY_PORT:'22',DEPLOY_DIRECTORY:'/srv/courses/staging',DEPLOY_PUBLIC_ORIGIN:'https://courses.example.com'};
 assert.equal(targetConfiguration(env).directory,'/srv/courses/staging');
 for(const bad of [{DEPLOY_TARGET_AUTHORIZED:'false'},{DEPLOY_HOST:'-oProxyCommand=bad'},{DEPLOY_USER:'courses;command'},{DEPLOY_PORT:'22\nCOMMAND'},{DEPLOY_DIRECTORY:'/srv/courses/../other'},{DEPLOY_DIRECTORY:'/'},{DEPLOY_PUBLIC_ORIGIN:'https://user:password@courses.example.com'},{DEPLOY_PUBLIC_ORIGIN:'http://courses.example.com'},{DEPLOY_PUBLIC_ORIGIN:'https://courses.example.com/?secret=x'}])assert.throws(()=>targetConfiguration({...env,...bad}));
});
test('a manual payment TEST flag is false unless explicitly enabled for staging and is carried to the target',()=>{
 const env={TARGET_ENVIRONMENT:'staging',DEPLOY_TARGET_AUTHORIZED:'true',DEPLOY_HOST:'host.example.com',DEPLOY_USER:'courses',DEPLOY_PORT:'22',DEPLOY_DIRECTORY:'/srv/courses/staging',DEPLOY_PUBLIC_ORIGIN:'https://staging.example.com'};
 for(const value of [undefined,'','false'])assert.equal(stagingPaymentTestFlag({...env,STAGING_PAYMENT_TEST:value}),false);
 assert.equal(targetConfiguration({...env,STAGING_PAYMENT_TEST:'true'}).stagingPaymentTest,true);
 assert.equal(targetConfiguration({...env,TARGET_ENVIRONMENT:'production',STAGING_PAYMENT_TEST:'false'}).stagingPaymentTest,false);
 for(const value of ['TRUE','1','yes','false\ntrue',true,false,null])assert.throws(()=>stagingPaymentTestFlag({...env,STAGING_PAYMENT_TEST:value}),/PAYMENT_TEST_INVALID/);
 assert.throws(()=>targetConfiguration({...env,TARGET_ENVIRONMENT:'production',STAGING_PAYMENT_TEST:'true'}),/PAYMENT_TEST_STAGING_ONLY/);
});
test('the remote Node executable accepts an explicit user installation without accepting shell text or path traversal',()=>{
 const env={TARGET_ENVIRONMENT:'staging',DEPLOY_TARGET_AUTHORIZED:'true',DEPLOY_HOST:'host.example.com',DEPLOY_USER:'plumora',DEPLOY_PORT:'22',DEPLOY_DIRECTORY:'/home/plumora/courses/staging',DEPLOY_PUBLIC_ORIGIN:'https://courses.example.com'};
 assert.equal(targetConfiguration(env).nodePath,'node');assert.equal(targetConfiguration({...env,DEPLOY_NODE_PATH:''}).nodePath,'node');
 const userNode='/home/plumora/.local/lib/node-v24.22.2-linux-x64/bin/node';
 assert.equal(targetConfiguration({...env,DEPLOY_NODE_PATH:userNode}).nodePath,userNode);
 for(const path of ['node --eval anything','./node','../node','/home/plumora/../other/node','/home/plumora/./node','/home/plumora//node','/home/plumora/node;command','/home/plumora/node\ncommand','/home/plumora/$(command)/node',"/home/plumora/'/node",'/home/plumora/`command`/node','/home/plumora/node\0','/home/plumora/node/'])assert.throws(()=>targetConfiguration({...env,DEPLOY_NODE_PATH:path}),/NODE_PATH_INVALID/);
});
test('GHCR credentials are scoped to the workflow repository and never embedded in the remote shell text',()=>{
 const env=ghcrEnvironment(),configuration=ghcrConfiguration(env);
 assert.equal(configuration.sourceUrl,'https://github.com/fonkoukevin/chatgpt_courses');assert.equal(configuration.registry,'ghcr.io');
 assert.equal(JSON.stringify(configuration).includes(env.GITHUB_TOKEN),false);
 const script=ghcrRemoteScript(env,'exit 7');
 assert.equal(script.includes(env.GITHUB_TOKEN),false);assert.equal(script.includes('REGISTRY_TOKEN'),false);
 assert.match(script,/test "\$\(stat -f -c %T \/dev\/shm\)" = tmpfs/u);assert.match(script,/--password-stdin/u);
 assert.match(script,/trap cleanup_registry EXIT/u);assert.match(script,/logout ghcr\.io/u);assert.match(script,/rm -rf -- "\$registry_config"/u);
 assert.match(script,/export DOCKER_CONFIG="\$registry_config"/u);
 for(const changed of [{IMAGE_REPOSITORY:'ghcr.io/other/chatgpt_courses'},{IMAGE_REPOSITORY:'registry.invalid/fonkoukevin/chatgpt_courses'},{GITHUB_REPOSITORY:'fonkoukevin/../other'},{GITHUB_ACTOR:"actor'; command"}])assert.throws(()=>ghcrConfiguration({...env,...changed}));
 assert.throws(()=>ghcrRemoteScript({...env,GITHUB_RUN_ID:'12;command'},'exit 0'),/REMOTE_CONTEXT/);
});
test('source visibility changes require an explicit expected mode and concordant authoritative repository facts',()=>{
 const env=ghcrEnvironment(),privateSource={full_name:env.GITHUB_REPOSITORY,visibility:'private',private:true},publicSource={...privateSource,visibility:'public',private:false};
 assert.equal(validateSourceRepository(privateSource,env),'private');assert.throws(()=>validateSourceRepository(publicSource,env),/VISIBILITY_MISMATCH/);
 const publicEnv={...env,EXPECTED_SOURCE_VISIBILITY:'public'};assert.equal(validateSourceRepository(publicSource,publicEnv),'public');
 for(const changed of [{visibility:'private'},{private:true},{full_name:'other/repository'}])assert.throws(()=>validateSourceRepository({...publicSource,...changed},publicEnv),/VISIBILITY_MISMATCH/);
 assert.throws(()=>validateSourceRepository(privateSource,{...env,EXPECTED_SOURCE_VISIBILITY:'UNKNOWN'}),/VISIBILITY_INVALID/);
});
test('anonymous GHCR probes refuse readable packages and do not borrow any job credentials',async()=>{
 const image=ghcrEnvironment().IMAGE_REPOSITORY+'/web',calls=[];
 const reply=(status,body='')=>({status,ok:status>=200&&status<300,text:async()=>body});
 const denied=JSON.stringify({errors:[{code:'DENIED',message:'SYNTHETIC_PRIVATE_MESSAGE'}]});
 await requireGhcrAnonymousReadDenied(image,async(url,options)=>{calls.push({url,options});return calls.length===1?reply(200,JSON.stringify({token:'SYNTHETIC_ANONYMOUS_TOKEN'})):reply(403,denied);});
 assert.equal(calls.length,2);assert.equal(calls[0].options.headers,undefined);assert.deepEqual(calls[1].options.headers,{Authorization:'Bearer SYNTHETIC_ANONYMOUS_TOKEN'});
 assert.equal(JSON.stringify(calls).includes(ghcrEnvironment().GITHUB_TOKEN),false);
 await assert.rejects(requireGhcrAnonymousReadDenied(image,async url=>url.includes('/token?')?reply(200,JSON.stringify({token:'SYNTHETIC_ANONYMOUS_TOKEN'})):reply(200)),/PRIVATE_PACKAGE_REQUIRED/);
 await assert.rejects(requireGhcrAnonymousReadDenied(image,async()=>reply(503)),/PRIVACY_UNVERIFIED/);
 const contamination='SYNTHETIC_PRIVATE_PAYLOAD';
 await assert.rejects(requireGhcrAnonymousReadDenied(image,async()=>reply(200,contamination)),error=>error.message==='RELEASE_GHCR_PRIVACY_UNVERIFIED'&&!error.message.includes(contamination));
 let deniedCalls=0;await requireGhcrAnonymousReadDenied(image,async()=>{deniedCalls++;return reply(403,denied);});assert.equal(deniedCalls,1);
 for(const response of [reply(403),reply(401,'not structured'),reply(403,JSON.stringify({errors:[{code:'UNKNOWN'}]})),reply(429,denied),reply(500,denied)])await assert.rejects(requireGhcrAnonymousReadDenied(image,async()=>response),/PRIVACY_UNVERIFIED/);
 await assert.rejects(requireGhcrAnonymousReadDenied(image,async url=>url.includes('/token?')?reply(200,JSON.stringify({token:'SYNTHETIC_ANONYMOUS_TOKEN'})):reply(404,JSON.stringify({errors:[{code:'NAME_UNKNOWN'}]}))),/PRIVACY_UNVERIFIED/);
});
test('private package metadata must positively bind visibility, owner and the exact expected source repository',async()=>{
 const env=ghcrEnvironment(),calls=[],metadata={name:'chatgpt_courses/web',package_type:'container',owner:{login:'fonkoukevin'},visibility:'private',repository:{full_name:env.GITHUB_REPOSITORY,private:true}};
 const reply=(status,value)=>({status,ok:status>=200&&status<300,text:async()=>JSON.stringify(value)});
 const denied={errors:[{code:'DENIED',message:'SYNTHETIC_PRIVATE_MESSAGE'}]};
 const request=async(url,options)=>{calls.push({url,options});return url.startsWith('https://api.github.com/')?reply(200,metadata):reply(403,denied);};
 assert.equal(await requireGhcrPrivatePackage(env,'web',{request}),'private');
 assert.equal(calls[0].url,'https://api.github.com/user/packages/container/chatgpt_courses%2Fweb');
 assert.equal(calls[0].options.headers.Authorization,`Bearer ${env.GITHUB_TOKEN}`);assert.equal(calls[1].options.headers,undefined);
 const publicSourceEnv={...env,EXPECTED_SOURCE_VISIBILITY:'public'},publicSourceMetadata={...metadata,repository:{full_name:env.GITHUB_REPOSITORY,private:false}};
 assert.equal(await requireGhcrPrivatePackage(publicSourceEnv,'web',{request:async url=>url.startsWith('https://api.github.com/')?reply(200,publicSourceMetadata):reply(403,denied)}),'private');
 await assert.rejects(requireGhcrPrivatePackage(publicSourceEnv,'web',{request:async()=>reply(200,{...publicSourceMetadata,visibility:'public'})}),/PRIVATE_PACKAGE_REQUIRED/);
 for(const changed of [{visibility:'public'},{visibility:'internal'},{visibility:'UNKNOWN'},{visibility:undefined},{repository:null},{repository:{full_name:'other/repository',private:true}},{repository:{full_name:env.GITHUB_REPOSITORY,private:false}},{owner:{login:'other'}},{owner:{login:1}},{name:'another/web'},{package_type:'npm'}]){
  let probes=0;await assert.rejects(requireGhcrPrivatePackage(env,'web',{request:async()=>{probes++;return reply(200,{...metadata,...changed});}}),/PRIVATE_PACKAGE_REQUIRED|PACKAGE_SOURCE_REQUIRED|PACKAGE_IDENTITY_MISMATCH/);assert.equal(probes,1);
 }
});
test('missing metadata is allowed only before initial publication with a structured anonymous denial; unknown capability blocks',async()=>{
 const env=ghcrEnvironment(),reply=(status,value)=>({status,ok:status>=200&&status<300,text:async()=>value===undefined?'':JSON.stringify(value)}),denied={errors:[{code:'UNAUTHORIZED',message:'SYNTHETIC_PRIVATE_MESSAGE'}]};
 const absent=async url=>url.startsWith('https://api.github.com/')?reply(404):reply(401,denied);
 assert.equal(await requireGhcrPrivatePackage(env,'web',{allowMissing:true,request:absent}),'absent');
 await assert.rejects(requireGhcrPrivatePackage(env,'web',{request:absent}),/PACKAGE_METADATA_UNAVAILABLE/);
 for(const status of [401,403,429,500,503]){
  let probes=0;await assert.rejects(requireGhcrPrivatePackage(env,'web',{allowMissing:true,request:async()=>{probes++;return reply(status);}}),/PACKAGE_METADATA_UNAVAILABLE/);assert.equal(probes,1);
 }
 await assert.rejects(requireGhcrPrivatePackage(env,'web',{allowMissing:true,request:async url=>url.startsWith('https://api.github.com/')?reply(404):reply(403)}),/PRIVACY_UNVERIFIED/);
 await assert.rejects(requireGhcrPrivatePackage(env,'web',{allowMissing:true,request:async url=>url.startsWith('https://api.github.com/')?reply(404):url.includes('/token?')?reply(200,{token:'SYNTHETIC_ANONYMOUS_TOKEN'}):reply(200,{tags:['public']})}),/PRIVATE_PACKAGE_REQUIRED/);
});
test('backup evidence is bound to actual receipt bytes, successful authenticated encryption and the exact target',()=>{
 const target={project:'courses-staging',environment:'staging',database:'courses_staging'},value={result:'passed',authenticatedEncryption:true,...target};
 const bytes=Buffer.from(JSON.stringify(value)),hash=sha256(bytes);validateBackupReceipt(bytes,hash,target);
 assert.throws(()=>validateBackupReceipt(Buffer.from(JSON.stringify({...value,project:'courses-production'})),hash,target),/HASH_MISMATCH/);
 for(const changed of [{result:'failed'},{authenticatedEncryption:false},{environment:'production'},{database:'other_database'}]){const altered=Buffer.from(JSON.stringify({...value,...changed}));assert.throws(()=>validateBackupReceipt(altered,sha256(altered),target),/TARGET_MISMATCH/);}
});
test('the bounded receipt accepts the full supported object inventory instead of rejecting ordinary backups above 64 KiB',()=>{
 const target={project:'courses-staging',environment:'staging',database:'courses_staging'};
 const item=name=>({name,bytes:1048636,sha256:'a'.repeat(64),format:'aes-256-gcm-v1'});
 for(const objects of [600,100000]){
  const files=[item('database.enc'),item('objects-manifest.enc'),...Array.from({length:objects},(_,index)=>item(`object-${String(index).padStart(6,'0')}.enc`)),item('notification-key.enc')];
  const receipt={schemaVersion:1,result:'passed',authenticatedEncryption:true,...target,sourceCommit:'b'.repeat(40),postgresql:'18.6',createdAt:'2026-11-09T00:00:00.000Z',objects,files,keyFingerprint:'c'.repeat(64),outboxKeyFingerprint:'d'.repeat(64),offHostCopyObserved:false};
  const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
  assert.ok(bytes.length>65536);assert.ok(bytes.length<=MAX_BACKUP_RECEIPT_BYTES);validateBackupReceipt(bytes,sha256(bytes),target);
 }
 const tooLarge=Buffer.alloc(MAX_BACKUP_RECEIPT_BYTES+1);assert.throws(()=>validateBackupReceipt(tooLarge,'0'.repeat(64),target),/SIZE_INVALID/);
});
test('observed schema facts prevent incompatible rollback and false first-install backup exemptions',()=>{
 const manifest=candidate(),facts={historyPresent:true,version:19,failed:0,userTables:80},rollback={operation:'rollback',currentSchemaVersion:19,rollbackSchemaReviewed:true};
 validateSchemaFacts(facts,manifest,rollback);
 assert.throws(()=>validateSchemaFacts({...facts,version:20},manifest,rollback),/NOT_COMPATIBLE/);
 assert.throws(()=>validateSchemaFacts(facts,manifest,{...rollback,currentSchemaVersion:18}),/REVIEW_REQUIRED/);
 const empty={historyPresent:false,version:0,failed:0,userTables:0},first={operation:'deploy',firstInstallEmptyDatabase:true};validateSchemaFacts(empty,manifest,first);
 assert.throws(()=>validateSchemaFacts({...empty,userTables:1},manifest,first),/EMPTY_DATABASE/);
 assert.throws(()=>validateSchemaFacts(facts,manifest,first),/EMPTY_DATABASE/);
 assert.throws(()=>validateSchemaFacts(facts,manifest,{operation:'deploy',offHostBackupAttested:false}),/BACKUP_REQUIRED/);
 assert.throws(()=>validateSchemaFacts({...facts,failed:1},manifest,{operation:'deploy',offHostBackupAttested:true}),/NOT_COMPATIBLE/);
});
