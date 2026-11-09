import test from 'node:test';
import assert from 'node:assert/strict';
import { repository, validateManifest, manifestBytes, sha256, parseManifest, protectedEnvironment, targetConfiguration, validateBackupReceipt, validateSchemaFacts } from '../../scripts/deployment/release.mjs';

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
test('an auto-created, bypassable or self-approved environment is not a protected target',()=>{
 const approved={can_admins_bypass:false,deployment_branch_policy:{protected_branches:true},protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'Team',reviewer:{id:1}}]}]};
 protectedEnvironment(approved);
 for(const value of [{},{...approved,can_admins_bypass:true},{...approved,protection_rules:[]},{...approved,protection_rules:[{...approved.protection_rules[0],prevent_self_review:false}]},{...approved,deployment_branch_policy:null}])assert.throws(()=>protectedEnvironment(value),/PROTECTED_ENVIRONMENT/);
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
