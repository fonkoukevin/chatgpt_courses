import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { checkQuiz, getActivityProgress, getLearningActivity, setActivityProgress, submitQuiz, updateActivityNote } from "../../apps/web/src/lib/api/learning-client";
import { decodeLearningResponse } from "../../apps/web/src/lib/api/learning-response";
import { activityNoteEtag, activityProgressEtag, isActivityNoteView, isActivityProgressView, isEnrollmentView, isLearningActivity, isQuizAttemptView, isQuizCheckResult } from "../../apps/web/src/lib/api/learning-validation";
import type { ActivityNoteView, ActivityProgressView, EnrollmentView, LearningActivity, QuizAttemptView, QuizCheckResult, ResourceDetail, SubmitQuiz } from "../../apps/web/src/lib/api/generated/types.gen";
import { authHref, safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { safeLearningDestination } from "../../apps/web/src/lib/learning/destination";

// These are unit tests with mocked network replies, not PostgreSQL or browser evidence.
const originalFetch=globalThis.fetch;
const actor=randomUUID(), activityId=randomUUID(), versionId=randomUUID(), revisionId=randomUUID(), enrollmentId=randomUUID();
const moduleId=randomUUID(),moduleVersionId=randomUUID(),courseId=randomUUID(),courseVersionId=randomUUID(),progressId=randomUUID();
const policy={passPercent:100,maxAttempts:null};
function progress():ActivityProgressView{return {id:progressId,enrollmentId,activityId,activityVersionId:versionId,revision:3,readAt:"2026-11-08T00:01:00Z",completedAt:null};}
function note():ActivityNoteView{return {id:randomUUID(),activityId,activityVersionId:versionId,locale:"fr",text:"Ma note française fictive.",revision:1,createdAt:"2026-11-08T00:00:00Z",updatedAt:"2026-11-08T00:01:00Z"};}
function resource():ResourceDetail{return {resourceId:activityId,kind:"ACTIVITY",versionId,versionNumber:1,locale:"fr",slug:"brief-fictif",availability:"PUBLISHED",revisionId,title:"Clarifier BR01",summary:"Fictional unit-test learning data",access:"FREE",
  document:{objective:"Distinguer les faits fournis.",expectedResult:"Un tableau faits/inconnues.",prerequisites:[],blocks:[{type:"PARAGRAPH",text:"Quatre pages existantes.",url:null}],estimatedMinutes:null,exerciseInstructions:"Repérer une inconnue.",quiz:[{key:"brief-fact",prompt:"Quel fait est fourni ?",options:["Quatre pages","Logo chiffré"],points:2}],rubric:[],access:"FREE",media:[],relatedResourceIds:[],methodDefinition:null,quizPolicy:null,projectPolicy:null},
  metadata:{goalCodes:[],level:null,audience:[],tools:[],sources:[],faq:[],evaluationDescription:null},reviewedAt:"2026-11-08T00:00:00Z",languages:[{locale:"fr",status:"PUBLISHED",slug:"brief-fictif"}],curriculum:[],related:[],objective:"Distinguer les faits fournis.",expectedResult:"Un tableau faits/inconnues.",prerequisites:[],estimatedMinutes:null};}
function activity():LearningActivity{return {enrollmentId,activityId,activityVersionId:versionId,moduleId,moduleVersionId,position:1,totalActivities:1,resource:resource(),progress:progress(),previous:null,next:null,quiz:{policy,attemptsUsed:0,attemptsRemaining:null,latestAttemptId:null,passed:false},accessStatus:"ACTIVE",availability:"PUBLISHED"};}
function enrollment():EnrollmentView{return {summary:{id:enrollmentId,courseResourceId:courseId,courseVersionId,courseVersionNumber:1,title:"Parcours fictif",enrolledLocale:"fr",courseSlug:"parcours-fictif",accessStatus:"PROTECTED",availability:"PUBLISHED",progress:{totalActivities:1,readActivities:1,completedActivities:0,quizPassedActivities:0,projectAvailability:"NOT_AVAILABLE"},createdAt:"2026-11-08T00:00:00Z",lastVisitedAt:null},curriculum:[],activities:[{activityId,activityVersionId:versionId,moduleId,moduleVersionId,position:1,title:"Clarifier BR01",accessStatus:"ACTIVE",availability:"PUBLISHED",progress:progress()}]};}
function grade():QuizCheckResult{return {activityId,activityVersionId:versionId,revisionId,locale:"fr",scorePoints:2,maxPoints:2,passed:true,policy,results:[{key:"brief-fact",prompt:"Quel fait est fourni ?",options:["Quatre pages","Logo chiffré"],selectedOption:0,correctOption:0,correct:true,explanation:"Quatre pages sont fournies, aucun prix de logo.",points:2,awardedPoints:2}]};}
function attempt():QuizAttemptView{return {...grade(),id:randomUUID(),submissionId:randomUUID(),enrollmentId,attemptNumber:1,submittedAt:"2026-11-08T00:01:00Z"};}
const csrf={token:"unit-only-learning-csrf",headerName:"X-CSRF-TOKEN",parameterName:"_csrf"};
function problem(status:number,code:string){return Response.json({type:"about:blank",title:"Request failed",status,detail:"Safe unit-test error.",instance:"/api/v1/me/activity-notes",code,traceId:randomUUID()},{status,headers:{"Content-Type":"application/problem+json"}});}
beforeEach(()=>clearCsrfToken());
afterEach(()=>{globalThis.fetch=originalFetch;clearCsrfToken();});

test("une note et un progrès demandent leur propre ETag fort et refusent un propriétaire ou score ajouté",async()=>{
  const n=note(),p=progress();
  assert.equal((await decodeLearningResponse(Response.json(n,{headers:{ETag:activityNoteEtag(n)}}),isActivityNoteView)).ok,true);
  assert.equal((await decodeLearningResponse(Response.json(p,{headers:{ETag:activityProgressEtag(p)}}),isActivityProgressView)).ok,true);
  for(const wrongTag of [undefined,`W/${activityNoteEtag(n)}`,activityProgressEtag(p),`"activity-note-${n.id}-r0"`]){
    const result=await decodeLearningResponse(Response.json(n,{headers:wrongTag?{ETag:wrongTag}:{}}),isActivityNoteView);
    assert.deepEqual(result,{ok:false,error:{kind:"invalid-response",status:200}});
  }
  assert.equal(isActivityNoteView({...n,ownerId:actor}),false);assert.equal(isActivityNoteView({...n,passwordHash:"unexpected-unit-data"}),false);
  assert.equal(isActivityProgressView({...p,scorePoints:100}),false);assert.equal(isActivityProgressView({...p,projectValidated:true}),false);
});

test("la correction est cohérente avec ses réponses, ses points et sa politique sans fabriquer de tentative anonyme",()=>{
  const value=grade();assert.equal(isQuizCheckResult(value),true);assert.equal(isQuizAttemptView(attempt()),true);
  for(const invalid of [{...value,passed:false},{...value,scorePoints:0},{...value,maxPoints:3},
    {...value,results:[{...value.results[0],correct:false}]},{...value,results:[{...value.results[0],awardedPoints:0}]},
    {...value,results:[{...value.results[0],correctOption:1}]},{...value,attemptId:randomUUID()},{...value,ownerId:actor}])assert.equal(isQuizCheckResult(invalid),false);
  const initial=activity();assert.equal(isLearningActivity(initial),true);
  const document=initial.resource.document!;
  const protectedResource={...initial.resource,access:"PROTECTED" as const,document:{...document,access:"PROTECTED" as const}};
  assert.equal(isLearningActivity({...initial,resource:protectedResource}),true);
  assert.equal(isLearningActivity({...initial,accessStatus:"PROTECTED",resource:protectedResource}),false);
  assert.equal(isLearningActivity({...initial,availability:"WITHDRAWN",resource:{...protectedResource,availability:"WITHDRAWN"}}),false);
  assert.equal(isLearningActivity({...initial,resource:{...initial.resource,document:{...document,quiz:[{...document.quiz[0],correctOption:0}]}}}),false);
});

test("le client garde CSRF en mémoire, transmet compte et If-Match au privé, mais aucune autorité de score",async()=>{
  let tokenReads=0;const calls:Array<{path:string;init:RequestInit}>=[];const p=progress(),savedAttempt=attempt();
  globalThis.fetch=async(path,init)=>{
    if(path==="/api/v1/auth/csrf"){tokenReads++;return Response.json(csrf);}
    calls.push({path:String(path),init:init??{}});
    if(String(path).endsWith("/quiz-checks"))return Response.json(grade());
    if(String(path).endsWith("/quiz-attempts"))return Response.json(savedAttempt,{status:201});
    return Response.json(p,{headers:{ETag:activityProgressEtag(p)}});
  };
  const declaration={enrollmentId,activityVersionId:versionId,read:true,completed:false,locale:"fr" as const};
  const answers=[{key:"brief-fact",optionIndex:0}],quiz:SubmitQuiz={enrollmentId,activityVersionId:versionId,revisionId,locale:"fr",submissionId:savedAttempt.submissionId,answers};
  const snapshot=structuredClone(quiz);
  assert.equal((await setActivityProgress(activityId,activityProgressEtag(p),declaration,actor)).ok,true);
  assert.equal((await submitQuiz(activityId,quiz,actor)).ok,true);
  assert.equal((await checkQuiz(activityId,versionId,{revisionId,locale:"fr",answers})).ok,true);
  assert.equal(tokenReads,1);assert.equal(calls.length,3);assert.deepEqual(quiz,snapshot);
  for(const call of calls){const headers=new Headers(call.init.headers),body=JSON.parse(String(call.init.body));
    assert.equal(headers.get("X-CSRF-TOKEN"),csrf.token);assert.equal(call.init.cache,"no-store");assert.equal(call.init.credentials,"same-origin");
    for(const absent of ["scorePoints","maxPoints","passed","correctOption","ownerId"])assert.equal(Object.hasOwn(body,absent),false);
    assert.equal(headers.get("X-Account-Context"),call.path.endsWith("/quiz-checks")?null:actor);
    assert.equal(headers.get("If-Match"),call.init.method==="PUT"?activityProgressEtag(p):null);
  }
});

test("412, 428 et 503 restent différents et ne répètent jamais la sauvegarde du texte conservé",async()=>{
  for(const [status,code]of [[412,"REVISION_CONFLICT"],[428,"PRECONDITION_REQUIRED"],[503,"SERVICE_UNAVAILABLE"]]as const){
    clearCsrfToken();let writes=0,reads=0;const n=note(),body={text:"Une retouche locale conservée."},snapshot=structuredClone(body);
    globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf"){reads++;return Response.json(csrf);}assert.equal(init?.method,"PATCH");writes++;return problem(status,code);};
    const result=await updateActivityNote(n.id,activityNoteEtag(n),body,actor);assert.equal(result.ok,false);
    if(!result.ok){assert.equal(result.error.status,status);assert.equal(result.error.kind,status===503?"unavailable":"http");assert.ok("problem"in result.error);assert.equal(result.error.problem?.code,code);}
    assert.equal(writes,1);assert.equal(reads,1);assert.deepEqual(body,snapshot);
  }
});

test("l’activité et sa progression restent liées à la version exacte du programme dans JSON et URL",async()=>{
  const value=activity();assert.equal(isLearningActivity(value),true);assert.equal(isEnrollmentView(enrollment()),true);
  for(const broken of [{...value,progress:{...value.progress,activityVersionId:randomUUID()}},{...value,progress:{...value.progress,enrollmentId:randomUUID()}},
    {...value,resource:{...value.resource,resourceId:randomUUID()}},{...value,resource:{...value.resource,versionId:randomUUID()}},
    {...value,accessStatus:"UNAVAILABLE",availability:"WITHDRAWN"}])assert.equal(isLearningActivity(broken),false);
  const invalidEnrollment=enrollment();invalidEnrollment.activities[0].position=2;assert.equal(isEnrollmentView(invalidEnrollment),false);
  const paths:string[]=[];globalThis.fetch=async(path)=>{paths.push(String(path));return String(path).includes("/activity-progress/")?Response.json(progress(),{headers:{ETag:activityProgressEtag(progress())}}):Response.json(value);};
  assert.equal((await getLearningActivity(enrollmentId,activityId,versionId,"fr")).ok,true);assert.equal((await getActivityProgress(activityId,enrollmentId,versionId)).ok,true);
  for(const path of paths){const url=new URL(path,"https://courses.invalid");assert.equal(url.searchParams.get("activityVersionId"),versionId);}
  assert.equal(new URL(paths[1],"https://courses.invalid").searchParams.get("enrollmentId"),enrollmentId);
});

test("le retour après connexion garde les versions et les slugs d’origine sans accepter traversée ou URL libre",()=>{
  const query=new URLSearchParams({resource:activityId,version:versionId,courseVersion:courseVersionId,returnTo:"/fr/catalogue?locale=fr"});
  const destination=`/fr/apprendre/parcours-fictif/brief-fictif?${query}`;
  assert.equal(safeLearningDestination(destination,"fr"),destination);assert.equal(safeReturnTo(destination,"en"),destination);
  assert.equal(new URL(authHref("en","sign-in",destination),"https://courses.invalid").searchParams.get("returnTo"),destination);
  assert.equal(translateReturnTo(destination,"en"),destination,"Aucun slug traduit ne doit être inventé pendant l’identification.");
  assert.equal(translateReturnTo("/fr/espace/apprentissage","en"),"/en/my/learning");
  assert.equal(safeReturnTo(`/fr/espace/apprentissage/${enrollmentId}`,"fr"),`/fr/espace/apprentissage/${enrollmentId}`);
  assert.equal(translateReturnTo(`/fr/espace/apprentissage/${enrollmentId}`,"en"),`/en/my/learning/${enrollmentId}`);
  for(const bad of ["//evil.invalid",`/fr/apprendre/foo/../parcours-fictif/brief-fictif?${query}`,`/fr/apprendre/foo/%2e%2e/parcours-fictif/brief-fictif?${query}`,
    destination+"&version="+randomUUID(),destination+"&ownerId="+actor,destination+"#fragment",destination.replace("/fr/apprendre/","/fr/\\apprendre/"),
    `/fr/apprendre/parcours-fictif/brief-fictif?resource=${activityId}&version=${versionId}`,destination.replace(encodeURIComponent("/fr/catalogue?locale=fr"),encodeURIComponent("https://evil.invalid"))]){
    assert.equal(safeLearningDestination(bad,"fr"),null,bad);assert.equal(safeReturnTo(bad,"fr"),"/fr/compte",bad);
  }
});
