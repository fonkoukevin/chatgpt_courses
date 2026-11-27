import { randomBytes,randomUUID,createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { environment,root,runtimeDir,start,terminateOwned,waitFor,windows } from './lib/runtime.mjs';
import { isolatedEnvironment } from './ci-run.mjs';
import { createBrowserDatabase,stopBrowserDatabase,observeBrowserDatabase } from './lib/browser-database.mjs';
import { createBrowserServices,stopBrowserService } from './lib/browser-services.mjs';
import { createBrowserPayments } from './lib/browser-payments.mjs';
import { createBrowserControlEndpoint } from './lib/browser-control-endpoint.mjs';
import { observeApiJar } from './lib/observation-jar.mjs';
import { observationSql } from './lib/observation-sql.mjs';

// Explicit observation only. No next/browser process, external provider, shared DB or business date rewrite.
const env=isolatedEnvironment(environment({loadLocal:false}));
const runId=new Date().toISOString().replaceAll(/[:.]/gu,'-')+'-'+randomUUID();
const directory=join(runtimeDir,'refund-lease-observation-'+runId);fs.mkdirSync(directory,{recursive:true,mode:0o700});
const evidencePath=join(root,'docs/evidence/FINAL-01-P19-lease-'+runId+'.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['scripts/observe-refund-lease.mjs','scripts/lib/browser-refunds.mjs','scripts/lib/browser-payments.mjs','scripts/lib/observation-sql.mjs','scripts/lib/observation-jar.mjs','tests/browser/refund-lease-wait.ts','tests/browser/refunds.spec.ts','tests/observations/refund-lease.observation.spec.ts','tests/observations/refund-lease.config.ts'];
const sourceHashes=Object.fromEntries(sourceFiles.map(path=>[path,hash(fs.readFileSync(join(root,path)))]));
const nextFile=join(root,'apps/web/next-env.d.ts'),nextBefore=fs.readFileSync(nextFile);
const jarSource=join(root,'apps/api/target/chatgpt-courses-api.jar');
const jarFacts=observeApiJar(jarSource,join(root,'apps/api/target/classes'));
if(!jarFacts.applicationClassesMatch)throw Error('OBSERVATION_CURRENT_APPLICATION_JAR_REQUIRED');
const jar=join(directory,'api.jar');fs.copyFileSync(jarSource,jar,fs.constants.COPYFILE_EXCL);
const records=[],observations=[],sockets=new Set(),cleanup=[];
let database,services=[],payments,sql,endpoint,api,stopping=false,stage='PREPARE',failure,playwrightExit=null;
let queue=Promise.resolve(),target=null,abandonedLease=null,abandonedLeaseUntil=null,crashedApi=null,gateRelease=null,gateWait=null,crashCapture=null,crashTriggered=false,recoveryLookupCaptured=false;
const token=randomBytes(32).toString('hex');
function persist(phase,value){const observation={phase,capturedAt:new Date().toISOString(),...value};observations.push(observation);fs.writeFileSync(join(directory,String(observations.length).padStart(3,'0')+'-'+phase+'.json'),JSON.stringify(observation,null,2)+'\n',{flag:'wx',mode:0o600});return observation;}
const uuid=value=>{if(typeof value!=='string'||!/^\w{8}-(?:\w{4}-){3}\w{12}$/u.test(value)||!/^[a-f0-9-]{36}$/u.test(value))throw Error('OBSERVATION_UUID_REQUIRED');return value;};
function launch(name,file,args){
  const handle=fs.openSync(join(directory,name+'-'+records.length+'.private.log'),'a',0o600);let child;
  try{child=start(file,args,{env,detached:!windows,stdio:['ignore',handle,handle]});}finally{fs.closeSync(handle);}
  const record={name,child,terminated:false};record.exit=new Promise(resolve=>{child.once('exit',(code,signal)=>{record.exitObserved=true;resolve({code,signal});});child.once('error',()=>resolve({code:1,signal:null}));});records.push(record);return record;
}
async function terminate(record){if(!record||record.terminated)return;if(!await terminateOwned(record.child.pid,!windows))throw Error('OBSERVATION_OWNED_PROCESS_STOP_UNCONFIRMED');await record.exit;record.terminated=true;}
async function startApi(){
  if(stopping)throw Error('OBSERVATION_STOPPING');
  if(!api||api.terminated){const java=env.JAVA_HOME?join(env.JAVA_HOME,'bin',windows?'java.exe':'java'):'java';api=launch('api',java,['-jar',jar,'--debug=false']);}
  const current=api;
  try{await Promise.race([waitFor(env.API_INTERNAL_URL+'/api/v1/system/health',300000),current.exit.then(()=>{throw Error('OBSERVATION_API_EXITED_BEFORE_READY');})]);return {ready:true};}
  catch(error){if(crashTriggered&&current===crashedApi&&crashCapture){await crashCapture;return {ready:false,intentionalCrashConfirmed:true};}throw error;}
}
async function waitForOwnedCrash(){
  const deadline=Date.now()+15000;
  while(!crashCapture&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  if(!crashCapture)throw Error('OBSERVATION_WORKER_LOOKUP_NOT_REACHED');
  await crashCapture;return {intentionalCrashConfirmed:true};
}
async function leaseSnapshot(phase){
  if(!target)throw Error('OBSERVATION_REFUND_TARGET_REQUIRED');
  const order=uuid(target.orderId),operation=uuid(target.operationId);
  const value=await sql.query(`SELECT jsonb_build_object('sameOrder',p.order_id='${order}','operationState',p.state,'accessState',p.access_state,
    'jobState',coalesce(j.state,'NONE'),'leaseActive',coalesce(j.lease_until>clock_timestamp(),false),
    'leaseRemainingMs',coalesce(greatest(0,ceil(extract(epoch FROM(j.lease_until-clock_timestamp()))*1000)),0),
    'leaseUntil',j.lease_until,'databaseNow',clock_timestamp(),'privateLeaseId',j.lease_id,
    'operationCount',(SELECT count(*) FROM refund_operations WHERE order_id='${order}'),
    'grantCount',(SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id='${order}'),
    'revokedGrantCount',(SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id='${order}' AND g.revoked_at IS NOT NULL))
    FROM refund_operations p LEFT JOIN refund_reconciliation_jobs j ON j.order_id=p.order_id WHERE p.id='${operation}';`);
  if(value.sameOrder!==true||!Number.isSafeInteger(value.leaseRemainingMs)||value.leaseRemainingMs<0||value.leaseRemainingMs>600000)throw Error('OBSERVATION_EXACT_BOUNDED_LEASE_REQUIRED');
  const privateLease=value.privateLeaseId;delete value.privateLeaseId;
  if(phase==='abandoned-claim-after-owned-crash'){abandonedLease=privateLease;abandonedLeaseUntil=value.leaseUntil;}
  value.sameLeaseAsAbandoned=abandonedLease!==null&&privateLease===abandonedLease;
  return persist(phase,value);
}
async function observeUnexpectedAccess(message){
  const owner=uuid(message.ownerId),order=uuid(message.orderId),course=uuid(message.nodes?.course?.versionId),module=uuid(message.nodes?.module?.versionId),activity=uuid(message.nodes?.activity?.versionId);
  const expectedResources=['course','module','activity'].map(role=>uuid(message.nodes[role].resourceId));
  if(!Number.isSafeInteger(message.httpStatus)||message.httpStatus===200)throw Error('OBSERVATION_UNEXPECTED_ACCESS_STATUS_REQUIRED');
  const nodeValues=[[course,expectedResources[0],'COURSE'],[module,expectedResources[1],'MODULE'],[activity,expectedResources[2],'ACTIVITY']].map(([version,resource,role])=>`('${version}'::uuid,'${resource}'::uuid,'${role}')`).join(',');
  try{
    const facts=await sql.query(`SELECT jsonb_build_object(
      'httpStatus',${message.httpStatus},'ownerPresent',EXISTS(SELECT 1 FROM user_accounts WHERE id='${owner}'),
      'ownerActive',EXISTS(SELECT 1 FROM user_accounts WHERE id='${owner}' AND status='ACTIVE'),
      'order',(SELECT jsonb_build_object('sameOwner',owner_id='${owner}','paymentStatus',payment_status,'fulfillmentStatus',fulfillment_status) FROM orders WHERE id='${order}'),
      'clock',jsonb_build_object('observedAt',clock_timestamp(),'transactionAt',transaction_timestamp(),'statementAt',statement_timestamp()),
      'observerIsolation',current_setting('transaction_isolation'),'observerReadOnly',current_setting('transaction_read_only'),'observerSnapshot',pg_current_snapshot()::text,
      'origins',(SELECT coalesce(jsonb_agg(jsonb_build_object('originType',g.origin_type,'exactCourseResource',g.resource_id='${expectedResources[0]}','exactCourseVersion',g.version_id='${course}',
         'fromExactOrder',r.order_id='${order}','startsAt',g.starts_at,'expiresAt',g.expires_at,'revokedAt',g.revoked_at,'frenchIncluded',g.locales @> '["fr"]'::jsonb,'versionPolicy',g.version_policy,'updatesUntil',g.updates_until)),'[]'::jsonb)
         FROM access_grants g LEFT JOIN order_resources r ON r.id=g.order_resource_id WHERE g.owner_id='${owner}'),
      'pinnedNodes',(SELECT jsonb_agg(jsonb_build_object('expectedKind',n.kind,'exactResource',v.resource_id=n.resource,'actualKind',r.kind,'resourceAvailable',r.archived_at IS NULL,
         'frenchPresent',t.id IS NOT NULL,'editorialState',t.editorial_state,'publishedDocument',e.id IS NOT NULL AND e.document_json IS NOT NULL,
         'sourceFresh',t.id IS NOT NULL AND(t.source_translation_id IS NULL OR coalesce(t.published_source_revision_id=s.current_revision_id AND s.editorial_state NOT IN('ARCHIVED','STALE'),false))))
         FROM (VALUES ${nodeValues}) n(version,resource,kind) LEFT JOIN pedagogical_versions v ON v.id=n.version LEFT JOIN learning_resources r ON r.id=v.resource_id
         LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale='fr' LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations s ON s.id=t.source_translation_id),
      'courseModuleEdge',EXISTS(SELECT 1 FROM version_compositions WHERE parent_version_id='${course}' AND child_version_id='${module}'),
      'moduleActivityEdge',EXISTS(SELECT 1 FROM version_compositions WHERE parent_version_id='${module}' AND child_version_id='${activity}'));
    `);
    return persist('unexpected-member-access-authoritative-facts',{...facts,readOnlyFactsCaptured:true,observedAfterHttpDecision:true,httpDecisionSnapshotReproduced:false,httpDecisionClockReconstructed:false});
  }catch(error){persist('unexpected-member-access-capture-failed',{httpStatus:message.httpStatus,readOnlyFactsCaptured:false});throw error;}
}
async function beforeLookup({orderId,kind}){
  if(!target||orderId!==target.orderId||kind!=='payment-intent')return;
  if(!crashTriggered){
    crashTriggered=true;const current=api;crashedApi=current;
    if(!current||current.terminated||current.child.exitCode!==null||!Number.isInteger(current.child.pid)||!current.child.spawnargs.includes(jar))throw Error('OBSERVATION_LIVE_OWNED_JAVA_REQUIRED');
    // Use the exact ChildProcess handle created above, not a searched/reused PID. Kill before the 2s provider read timeout.
    crashCapture=(async()=>{const exited=await current.exit;current.terminated=true;if(exited.signal!=='SIGKILL'&&exited.code===0)throw Error('OBSERVATION_HARD_CRASH_NOT_CONFIRMED');const claimed=await leaseSnapshot('abandoned-claim-after-owned-crash');if(claimed.operationState!=='UNKNOWN'||claimed.jobState!=='PROCESSING'||!claimed.leaseActive||claimed.leaseRemainingMs>120000||!claimed.sameLeaseAsAbandoned)throw Error('OBSERVATION_ACTIVE_DEFAULT_LEASE_REQUIRED');})();
    if(!current.child.kill('SIGKILL'))throw Error('OBSERVATION_HARD_CRASH_SIGNAL_FAILED');
    await crashCapture;await gateWait;return;
  }
  if(!recoveryLookupCaptured){
    recoveryLookupCaptured=true;const started=performance.now();const recovered=await leaseSnapshot('natural-expiry-new-claim-before-provider-reply');
    const elapsed=performance.now()-started;persist('recovery-lookup-observation-cost',{elapsedMs:elapsed});
    if(elapsed>=1000)throw Error('OBSERVATION_LOOKUP_CAPTURE_TOO_SLOW');
    const priorLeaseNaturallyExpiredBeforeNewClaim=Number.isFinite(Date.parse(abandonedLeaseUntil))&&Date.parse(recovered.databaseNow)>=Date.parse(abandonedLeaseUntil)&&!recovered.sameLeaseAsAbandoned&&recovered.jobState==='PROCESSING'&&recovered.leaseActive;
    persist('natural-expiry-boundary',{priorLeaseNaturallyExpiredBeforeNewClaim});
    if(!priorLeaseNaturallyExpiredBeforeNewClaim)throw Error('OBSERVATION_PRIOR_LEASE_EXPIRY_REQUIRED');
  }
}
const control=createServer(socket=>{
  sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(360000,()=>socket.destroy());let input='',handled=false;
  socket.on('data',chunk=>{if(handled)return;input+=chunk.toString('utf8');if(input.length>4096)return socket.destroy();if(!input.includes('\n'))return;handled=true;let message;try{message=JSON.parse(input.slice(0,input.indexOf('\n')));}catch{return socket.destroy();}if(message.token!==token)return socket.destroy();
    queue=queue.then(async()=>{
      if(stopping)throw Error('OBSERVATION_STOPPING');
      switch(message.operation){
        case 'advance-payment': return await payments.advance(uuid(message.orderId),message.state,message.type);
        case 'configure-refund': return payments.configureRefund(uuid(message.orderId),message.state);
        case 'arm-lookup-crash':
          if(target||env.REFUND_WORKER_ENABLED!=='false')throw Error('OBSERVATION_ONE_TARGET_WORKER_STOPPED_REQUIRED');
          target={orderId:uuid(message.orderId),operationId:uuid(message.operationId)};gateWait=new Promise(resolve=>{gateRelease=resolve;});await leaseSnapshot('armed-after-unknown');return {armed:true};
        case 'start-refund-worker': await terminate(api);env.REFUND_WORKER_ENABLED='true';await startApi();return await waitForOwnedCrash();
        case 'release-abandoned-lookup': if(!crashTriggered)throw Error('OBSERVATION_NO_CRASH_TO_RELEASE');gateRelease();return {released:true};
        case 'start-api': return await startApi();
        case 'lease-snapshot': return await leaseSnapshot(message.phase==='after-restart'?'after-restart':message.phase==='after-crash'?'after-crash-confirmation':'final-state');
        case 'observe-access': return await observeUnexpectedAccess(message);
        case 'transport-observation': return payments.observation();
        case 'record-safe-check': {
          const allowed=['unknownInitial','accessBeforeRefundStatus','accessWhileUnknownStatus','accessAfterRefundStatus','waitMs','sharedWaitBranchExercised','abandonedLeaseObserved','finalOperationCount'];
          if(!message.facts||Object.keys(message.facts).some(key=>!allowed.includes(key))||Object.values(message.facts).some(value=>typeof value!=='boolean'&&!Number.isSafeInteger(value)))throw Error('OBSERVATION_SAFE_FACTS_REQUIRED');
          return persist('asserted-api-checks',message.facts);
        }
        default: throw Error('OBSERVATION_CONTROL_NOT_ALLOWED');
      }
    });queue.then(value=>socket.end(JSON.stringify({ok:true,...value})+'\n'),()=>socket.end('{"ok":false,"code":"OBSERVATION_CONTROL_FAILED"}\n'));queue=queue.catch(()=>{});
  });
});
try{
  const portServer=createServer();await new Promise((resolve,reject)=>{portServer.once('error',reject);portServer.listen({host:'127.0.0.1',port:0},resolve);});const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  Object.assign(env,{APP_ENV:'test',SPRING_PROFILES_ACTIVE:'test',APP_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,API_INTERNAL_URL:`http://127.0.0.1:${port}`,API_PORT:String(port),SESSION_COOKIE_SECURE:'false'});
  stage='DATABASE';database=await createBrowserDatabase(env,directory,runId,value=>{database=value;});
  stage='SERVICES';services=await createBrowserServices(env,directory,runId,value=>{services=value;});
  Object.assign(env,{MAIL_MODE:'disabled',NOTIFICATION_OUTBOX_ENABLED:'false',ASSET_STAGING_CLEANUP_WORKER_ENABLED:'false'});
  stage='TRANSPORT';payments=await createBrowserPayments(env,{refundsEnabled:true,beforeRefundLookup:beforeLookup});Object.assign(env,{PAYMENT_INBOX_ENABLED:'true',REFUND_WORKER_ENABLED:'false',APP_PUBLISHED_LOCALES:'',VIDEO_ENABLED:'false'});
  const sqlLog=fs.openSync(join(directory,'read-only-sql.private.log'),'a',0o600);try{sql=await observationSql(database,env,sqlLog);}finally{fs.closeSync(sqlLog);}
  endpoint=createBrowserControlEndpoint();await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(endpoint.path,resolve);});
  stage='API';await startApi();
  stage='CONTROLLED_LEASE_OBSERVATION';
  const childEnv={...env,COURSES_BROWSER_ORIGIN:env.APP_PUBLIC_ORIGIN,COURSES_BROWSER_IPC:endpoint.path,COURSES_BROWSER_TOKEN:token,COURSES_BROWSER_DB_ID:database.id,COURSES_BROWSER_RUN_ID:runId,COURSES_OBSERVATION_RUNTIME:directory};
  for(const key of Object.keys(childEnv))if(key.startsWith('STRIPE_'))delete childEnv[key];
  const handle=fs.openSync(join(directory,'playwright.private.log'),'a',0o600);let testProcess;
  try{testProcess=start(process.execPath,[join(root,'node_modules/@playwright/test/cli.js'),'test','--config',join(root,'tests/observations/refund-lease.config.ts')],{env:childEnv,stdio:['ignore',handle,handle]});}finally{fs.closeSync(handle);}
  const testRecord={name:'playwright',child:testProcess,terminated:false};testRecord.exit=new Promise(resolve=>{testProcess.once('exit',(code,signal)=>{testRecord.exitObserved=true;resolve({code,signal});});testProcess.once('error',()=>resolve({code:1}));});records.push(testRecord);
  const result=await testRecord.exit;testRecord.terminated=true;playwrightExit=result.code;if(result.code!==0)throw Error('OBSERVATION_ASSERTION_FAILED');
  if(!recoveryLookupCaptured||!observations.some(value=>value.priorLeaseNaturallyExpiredBeforeNewClaim===true))throw Error('OBSERVATION_NATURAL_EXPIRY_LOOKUP_REQUIRED');
  stage='COMPLETE';
}catch(error){failure={stage,code:typeof error?.message==='string'&&/^OBSERVATION_[A-Z_]+$/u.test(error.message)?error.message:'OBSERVATION_FAILED'};}
finally{
  stopping=true;gateRelease?.();
  for(const socket of sockets)socket.destroy();
  try{await queue;}catch{}
  for(const record of records.toReversed())try{await terminate(record);cleanup.push({stage:record.name,confirmed:true});}catch{cleanup.push({stage:record.name,confirmed:false});}
  try{await sql?.close();cleanup.push({stage:'read-only-sql',confirmed:true});}catch{cleanup.push({stage:'read-only-sql',confirmed:false});}
  try{await payments?.stop();cleanup.push({stage:'controlled-transport',confirmed:true});}catch{cleanup.push({stage:'controlled-transport',confirmed:false});}
  if(control.listening)try{await new Promise((resolve,reject)=>control.close(error=>error?reject(error):resolve()));endpoint?.cleanup();cleanup.push({stage:'ipc',confirmed:true});}catch{cleanup.push({stage:'ipc',confirmed:false});}
  let aggregate;try{if(database&&!database.stopped)aggregate=observeBrowserDatabase(database);}catch{aggregate={available:false};}
  for(const service of services.toReversed())try{stopBrowserService(service);cleanup.push({stage:service.kind,confirmed:true});}catch{cleanup.push({stage:service.kind,confirmed:false});}
  try{stopBrowserDatabase(database);cleanup.push({stage:'database',confirmed:true});}catch{cleanup.push({stage:'database',confirmed:false});}
  const sourceChanged=sourceFiles.filter(path=>sourceHashes[path]!==hash(fs.readFileSync(join(root,path))));
  const cleanupConfirmed=cleanup.every(value=>value.confirmed),nextPreserved=nextBefore.equals(fs.readFileSync(nextFile));
  const report={phase:'FINAL-01-P19',verifiedAt:new Date().toISOString(),result:!failure&&cleanupConfirmed&&nextPreserved&&!sourceChanged.length?'passed':'failed',failure,playwrightExit,jar:{sha256:jarFacts.jarSha256,applicationClassesCompared:jarFacts.applicationClassesCompared,allApplicationClassesMatched:true},sourceHashes,sourceChanged,observations,transport:payments?.observation(),databaseAggregate:aggregate,cleanup,cleanupConfirmed,userNextFilePreserved:nextPreserved,userNextFileSha256:hash(nextBefore),isolation:{localEnvironmentRead:false,externalStripe:false,sharedDatabase:false,nextOrChromiumStarted:false,leaseDatesRewritten:false,leaseDurationChanged:false,providerReadTimeoutChanged:false},limits:{historicalP19TimeoutCauseEstablished:false,historicalP12P15IncidentsClosed:false,fullOriginalUiCaseReplayed:false,sharedWaitGuardBranch:'see asserted-api-checks',clockModified:false}};
  fs.writeFileSync(evidencePath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({result:report.result,stage,cleanupConfirmed,evidence:evidencePath.replace(root+'\\','').replaceAll('\\','/'),externalStripe:false}));
  if(report.result!=='passed')process.exitCode=1;
}
