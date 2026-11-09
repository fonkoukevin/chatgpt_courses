import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BACKUP_RECEIPT_BYTES, repository, validateManifest, manifestBytes, sha256, parseManifest, protectedEnvironment, targetConfiguration, validateBackupReceipt, validateSchemaFacts } from '../../scripts/deployment/release.mjs';

const prefix='registry.invalid/team/courses';
const candidate=()=>({schemaVersion:1,sourceCommit:'a'.repeat(40),web:{repository:prefix+'/web',digest:'sha256:'+'b'.repeat(64)},api:{repository:prefix+'/api',digest:'sha256:'+'c'.repeat(64)},schema:{min:19,max:19}});
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
