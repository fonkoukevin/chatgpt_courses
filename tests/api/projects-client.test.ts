import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { createProject, getProject, getProjectTemplate, getMemberProjectTemplate, revealSolution, submitSelfAssessment, updateProject } from "../../apps/web/src/lib/api/projects-client";
import { decodeProjectsResponse } from "../../apps/web/src/lib/api/projects-response";
import { isMemberProjectTemplate, isProjectContext, isProjectPreset, isProjectStatus, isProjectTemplate, isProjectView, isSelfAssessmentView, isSolutionRevealView, projectEtag } from "../../apps/web/src/lib/api/projects-validation";
import type { CreateProject, ProjectContext, ProjectFields, ProjectPreset, ProjectRubricDefinition, ProjectStatus, ProjectTemplate, ProjectView, ResourceDetail, SelfAssessmentView, SubmitSelfAssessment } from "../../apps/web/src/lib/api/generated/types.gen";
import { parseProjectDraft, projectDraftTtlMs } from "../../apps/web/src/lib/auth/project-draft";
import { authHref, safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { projectBlockingKeys, projectCriterionKeys } from "../../apps/web/src/lib/projects/schema";

// Unit tests with synthetic network responses; these are not HTTP/PostgreSQL or browser validations.
const originalFetch=globalThis.fetch;

test("un corrigé révélé ne livre que ses fichiers localisés sans URL ou identité de propriétaire", () => {
  const file = { assetId: randomUUID(), filename: "corrige-br01-fr.md", locale: "fr" };
  const value = { id: randomUUID(), projectId: randomUUID(), projectRevisionId: randomUUID(), activityId: randomUUID(), activityVersionId: randomUUID(), revisionId: randomUUID(), locale: "fr", correction: "Une formulation possible, sans revue humaine.", revealedAt: "2026-11-09T00:00:00Z", files: [file] };
  assert.equal(isSolutionRevealView(value), true);
  for (const invalid of [{ ...value, files: [{ ...file, locale: "en" }] }, { ...value, files: [{ ...file, filename: "../private.md" }] }, { ...value, files: [{ ...file, url: "https://example.invalid/secret" }] }, { ...value, files: [file, file] }, { ...value, ownerId: randomUUID() }]) assert.equal(isSolutionRevealView(invalid), false);
});
const actor=randomUUID(),projectId=randomUUID(),projectRevisionId=randomUUID(),activityId=randomUUID(),versionId=randomUUID(),sourceRevisionId=randomUUID(),rubricId=randomUUID();
const date="2026-11-08T00:00:00Z",csrf={token:"unit-only-project-csrf",headerName:"X-CSRF-TOKEN",parameterName:"_csrf"};
function fields():ProjectFields{return {title:"Proposition personnelle fictive",locale:"fr",objective:"",scope:"",method:"",timeline:"",budget:"",clarifications:"",nextStep:"",externalText:"Mon texte français autonome."};}
function definition():ProjectRubricDefinition{return {sourceRevisionId,locale:"fr",caseCode:"BR01",passPoints:16,maxPoints:20,revealPolicy:"EXPLICIT",criteria:projectCriterionKeys.map((key)=>({key,category:key.split("-",1)[0] as "fidelity",label:`Contrôle synthétique ${key}`,points:1,blocking:false})) as ProjectRubricDefinition["criteria"],blockingIssues:projectBlockingKeys.map((key)=>({key,label:`Erreur synthétique ${key}`})) as ProjectRubricDefinition["blockingIssues"]};}
function project():ProjectView{return {id:projectId,revision:2,currentRevisionId:projectRevisionId,revisionNumber:3,fields:fields(),stage:"READY_FOR_SELF_ASSESSMENT",origin:{activityId,activityVersionId:versionId,activityVersionNumber:1,translationId:randomUUID(),revisionId:sourceRevisionId,locale:"fr",title:"Atelier fictif",slug:"atelier-fictif",enrollmentId:null,courseResourceId:null,courseVersionId:null,courseTitle:null},rubric:{id:rubricId,...definition()},createdAt:date,updatedAt:date,savedAt:date};}
function assessment():SelfAssessmentView{return {id:randomUUID(),submissionId:randomUUID(),projectId,projectRevisionId,rubricVersionId:rubricId,method:"SELF_ASSESSMENT",scorePoints:16,maxPoints:20,passPoints:16,thresholdMet:true,needsRevision:false,answers:projectCriterionKeys.map((key,index)=>({key,satisfied:index<16,comment:""})) as SelfAssessmentView["answers"],blockingDeclarations:projectBlockingKeys.map((key)=>({key,present:false,comment:""})) as SelfAssessmentView["blockingDeclarations"],blockingIssues:[],comment:"Bilan personnel déclaré.",evaluatedAt:date,authorId:actor,evaluatorId:null,declaredByUser:true};}
function resource():ResourceDetail{return {resourceId:activityId,kind:"ACTIVITY",versionId,versionNumber:1,locale:"fr",slug:"atelier-fictif",availability:"PUBLISHED",revisionId:sourceRevisionId,title:"Atelier fictif",summary:"Référence synthétique de test.",access:"FREE",document:{objective:"Préparer une proposition.",expectedResult:"Une proposition à vérifier.",prerequisites:[],blocks:[],estimatedMinutes:null,exerciseInstructions:"Rédiger librement.",quiz:[],rubric:definition().criteria.map(({key,label,points,blocking})=>({key,label,points,blocking})),access:"FREE",media:[],relatedResourceIds:[],methodDefinition:null,quizPolicy:null,projectPolicy:{caseCode:"BR01",passPoints:16,revealPolicy:"EXPLICIT",blockingIssues:definition().blockingIssues}},metadata:{goalCodes:[],level:null,audience:[],tools:[],sources:[],faq:[],evaluationDescription:null},reviewedAt:date,languages:[{locale:"fr",status:"PUBLISHED",slug:"atelier-fictif"}],curriculum:[],related:[],objective:"Préparer une proposition.",expectedResult:"Une proposition à vérifier.",prerequisites:[],estimatedMinutes:null};}
function template():ProjectTemplate{return {activityId,activityVersionId:versionId,revisionId:sourceRevisionId,locale:"fr",title:"Atelier fictif",availability:"PUBLISHED",resource:resource(),rubric:definition()};}
function createBody():CreateProject{return {creationId:randomUUID(),activityId,activityVersionId:versionId,revisionId:sourceRevisionId,sourceLocale:"fr",enrollmentId:null,fields:fields(),stage:"READY_FOR_SELF_ASSESSMENT"};}
function submitBody(value:SelfAssessmentView):SubmitSelfAssessment{return {submissionId:value.submissionId,projectRevisionId,rubricVersionId:rubricId,answers:value.answers,blockingDeclarations:value.blockingDeclarations,comment:value.comment};}
function problem(status:number,code:string){return Response.json({type:"about:blank",title:"Request failed",status,detail:"Safe synthetic project error.",instance:"/api/v1/me/projects",code,traceId:randomUUID()},{status,headers:{"Content-Type":"application/problem+json"}});}
beforeEach(()=>clearCsrfToken());
afterEach(()=>{globalThis.fetch=originalFetch;clearCsrfToken();});

test("la production exige son ETag fort exact et refuse propriétaires, secrets ou états dérivés injectés",async()=>{
  const value=project();assert.equal(isProjectView(value),true);
  assert.equal((await decodeProjectsResponse(Response.json(value,{headers:{ETag:projectEtag(value)}}),isProjectView)).ok,true);
  for(const wrong of [undefined,`W/${projectEtag(value)}`,`"project-${projectId}-r1"`,`"project-${randomUUID()}-r2"`]){
    assert.deepEqual(await decodeProjectsResponse(Response.json(value,{headers:wrong?{ETag:wrong}:{}}),isProjectView),{ok:false,error:{kind:"invalid-response",status:200}});
  }
  for(const extra of [{ownerId:actor},{passwordHash:"synthetic-secret"},{state:"SELF_ASSESSED"},{latestAssessment:assessment()}])assert.equal(isProjectView({...value,...extra}),false);
  assert.equal(isProjectView({...value,rubric:{...value.rubric,sourceRevisionId:randomUUID()}}),false);
  assert.equal(isProjectView({...value,rubric:{...value.rubric,locale:"en"}}),false);
});

test("le score déclaré reste cohérent avec vingt réponses et le statut vise la révision exacte",()=>{
  const value=assessment();assert.equal(isSelfAssessmentView(value),true);
  for(const bad of [{...value,scorePoints:20},{...value,thresholdMet:false},{...value,needsRevision:true},{...value,evaluatorId:actor},{...value,declaredByUser:false},
    {...value,answers:[...value.answers.slice(0,19),value.answers[0]]},
    {...value,blockingDeclarations:[{...value.blockingDeclarations[0],present:true},...value.blockingDeclarations.slice(1)]}])assert.equal(isSelfAssessmentView(bad),false);
  const status:ProjectStatus={projectId,currentRevisionId:projectRevisionId,stage:"READY_FOR_SELF_ASSESSMENT",state:"SELF_ASSESSED",latestAssessment:value};
  assert.equal(isProjectStatus(status),true);
  assert.equal(isProjectStatus({...status,currentRevisionId:randomUUID()}),false);
  assert.equal(isProjectStatus({...status,projectId:randomUUID()}),false);
  assert.equal(isProjectStatus({...status,state:"READY_FOR_SELF_ASSESSMENT"}),false);
  assert.equal(isProjectStatus({...status,latestAssessment:null}),false);
  assert.equal(isProjectStatus({...status,state:"DRAFT",stage:"DRAFT",latestAssessment:null}),true);
});

test("les projections pédagogiques refusent un corps protégé ou contradictoire et admettent NOT_CONFIGURED",async()=>{
  const value=template();assert.equal(isProjectTemplate(value),true);
  assert.equal(isProjectTemplate({...value,availability:"NOT_CONFIGURED",resource:null,rubric:null}),true);
  assert.equal(isProjectTemplate({...value,availability:"PROTECTED",resource:null,rubric:null}),true);
  assert.equal(isProjectTemplate({...value,availability:"PROTECTED"}),false);
  assert.equal(isProjectTemplate({...value,resource:{...value.resource!,resourceId:randomUUID()}}),false);
  assert.equal(isProjectTemplate({...value,resource:{...value.resource!,locale:"en"}}),false);
  const ctx:ProjectContext={projectId,activityId,activityVersionId:versionId,availability:"PUBLISHED",accessStatus:"ACTIVE",sourceRevisionId,currentPublishedRevisionId:sourceRevisionId,sourceChanged:false,resource:resource()};
  assert.equal(isProjectContext(ctx),true);
  assert.equal(isProjectContext({...ctx,accessStatus:"PROTECTED"}),false);
  assert.equal(isProjectContext({...ctx,availability:"WITHDRAWN"}),false);
  const preset:ProjectPreset={caseCode:"BR01",locale:"fr",policy:value.resource!.document!.projectPolicy!,rubric:value.resource!.document!.rubric as ProjectPreset["rubric"]};
  assert.equal(isProjectPreset({...preset,rubric:[{...preset.rubric[0],label:"a".repeat(2000)},...preset.rubric.slice(1)]}),true);
  assert.equal(isProjectPreset({...preset,rubric:[{...preset.rubric[0],label:"a".repeat(2001)},...preset.rubric.slice(1)]}),false);
  assert.equal(isProjectPreset({...preset,policy:{...preset.policy,caseCode:["BR01"]}}),false);
  assert.equal(isProjectPreset({...preset,policy:{...preset.policy,revealPolicy:["EXPLICIT"]}}),false);
  const member = { ...value, resource: { ...value.resource!, access: "PROTECTED" as const, document: { ...value.resource!.document!, access: "PROTECTED" as const } } };
  assert.equal(isProjectTemplate(member), false); assert.equal(isMemberProjectTemplate(member), true);
  assert.equal(isProjectContext({ ...ctx, resource: member.resource }), true);
  assert.equal(isMemberProjectTemplate({ ...member, resource: { ...member.resource, document: { ...member.resource.document, correction: "Not permitted" } } }), false);
  globalThis.fetch = async (path, init) => { assert.equal(String(path).startsWith("/api/v1/me/project-templates/"), true); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); return Response.json(member); };
  assert.equal((await getMemberProjectTemplate(activityId, versionId, "fr")).ok, true);
  let request:RequestInit|undefined;globalThis.fetch=async(_path,init)=>{request=init;return Response.json(value);};
  assert.equal((await getProjectTemplate(activityId,versionId,"fr")).ok,true);assert.equal(request?.credentials,"omit");assert.equal(request?.cache,"no-store");
});

test("le client transmet CSRF compte et If-Match sans inventer un score ni répéter une mutation en échec",async()=>{
  const value=project(),result=assessment(),create=createBody(),submit=submitBody(result);let reads=0;
  const calls:Array<{path:string;init:RequestInit}>=[];
  globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf"){reads++;return Response.json(csrf);}calls.push({path:String(path),init:init??{}});return String(path).endsWith("/self-assessments")?Response.json(result,{status:201}):Response.json(value,{status:201,headers:{ETag:projectEtag(value)}});};
  const original=structuredClone({create,submit});assert.equal((await createProject(create,actor)).ok,true);assert.equal((await submitSelfAssessment(projectId,projectEtag(value),submit,actor)).ok,true);
  assert.equal(reads,1);assert.equal(calls.length,2);assert.deepEqual({create,submit},original);
  for(const call of calls){const headers=new Headers(call.init.headers),body=JSON.parse(String(call.init.body));assert.equal(headers.get("X-CSRF-TOKEN"),csrf.token);assert.equal(headers.get("X-Account-Context"),actor);assert.equal(call.init.cache,"no-store");assert.equal(call.init.credentials,"same-origin");assert.equal(headers.get("If-Match"),call.path.endsWith("/self-assessments")?projectEtag(value):null);for(const key of ["scorePoints","ownerId","evaluatedAt","evaluatorId"])assert.equal(Object.hasOwn(body,key),false);}
  for(const [status,code]of [[409,"ACCOUNT_CONTEXT_CHANGED"],[412,"REVISION_CONFLICT"],[428,"PRECONDITION_REQUIRED"],[503,"SERVICE_UNAVAILABLE"]]as const){
    clearCsrfToken();let writes=0;const body={fields:fields(),stage:"DRAFT" as const},copy=structuredClone(body);
    globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf")return Response.json(csrf);assert.equal(init?.method,"PATCH");writes++;return problem(status,code);};
    const error=await updateProject(projectId,projectEtag(value),body,actor);assert.equal(error.ok,false);if(!error.ok){assert.equal(error.error.status,status);assert.equal(error.error.kind,status===503?"unavailable":"http");assert.equal(error.error.problem?.code,code);}assert.equal(writes,1);assert.deepEqual(body,copy);
  }
});

test("le brouillon volontaire expire en deux heures et refuse un propriétaire ou une inscription privée",()=>{
  const now=Date.parse(date),body=createBody(),source={activityId:body.activityId,activityVersionId:body.activityVersionId,revisionId:body.revisionId,sourceLocale:body.sourceLocale,enrollmentId:null};
  const draft={version:1,id:randomUUID(),expiresAt:now+projectDraftTtlMs,fields:fields(),source};
  assert.deepEqual(parseProjectDraft(JSON.stringify(draft),now),draft);
  assert.equal(parseProjectDraft(JSON.stringify(draft),draft.expiresAt),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,expiresAt:now+projectDraftTtlMs+1}),now),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,ownerId:actor}),now),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,source:{...source,enrollmentId:randomUUID()}}),now),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,fields:{...fields(),scorePoints:20}}),now),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,source:{...source,ownerId:actor}}),now),null);
  assert.equal(parseProjectDraft(JSON.stringify({...draft,source:{...source,sourceLocale:["fr"]}}),now),null);
});

test("une réponse valide d’un autre projet est refusée en lecture autoévaluation et révélation sans retry",async()=>{
  const foreignId=randomUUID(),foreignProject={...project(),id:foreignId},declared=assessment(),foreignAssessment={...declared,projectId:foreignId};
  let reads=0,assessments=0,reveals=0;
  globalThis.fetch=async(path,init)=>{
    if(path==="/api/v1/auth/csrf")return Response.json(csrf);
    if(String(path).endsWith("/self-assessments")){assessments++;assert.equal(init?.method,"POST");return Response.json(foreignAssessment,{status:201});}
    if(String(path).endsWith("/solution-reveals")){reveals++;return Response.json({id:randomUUID(),projectId:foreignId,projectRevisionId,activityId,activityVersionId:versionId,revisionId:sourceRevisionId,locale:"fr",correction:"Corrigé synthétique d’une autre production.",revealedAt:date,files:[]});}
    reads++;return Response.json(foreignProject,{headers:{ETag:projectEtag(foreignProject)}});
  };
  const original=structuredClone(declared);
  assert.deepEqual(await getProject(projectId),{ok:false,error:{kind:"invalid-response",status:200}});
  assert.deepEqual(await submitSelfAssessment(projectId,projectEtag(project()),submitBody(declared),actor),{ok:false,error:{kind:"invalid-response",status:201}});
  assert.deepEqual(await revealSolution(activityId,{projectId,projectRevisionId,activityVersionId:versionId,revisionId:sourceRevisionId,locale:"fr"},actor),{ok:false,error:{kind:"invalid-response",status:200}});
  assert.deepEqual([reads,assessments,reveals],[1,1,1]);assert.deepEqual(declared,original);
});

test("les retours d’authentification projets FR EN conservent une destination exacte sans redirection ouverte",()=>{
  const draft=randomUUID(),fr=`/fr/espace/projets/${projectId}`,en=`/en/my/projects/${projectId}`;
  assert.equal(safeReturnTo(fr,"fr"),fr);assert.equal(translateReturnTo(fr,"en"),en);assert.equal(translateReturnTo(en,"fr"),fr);
  const fresh=`/fr/espace/projets/nouveau?draft=${draft}`,translated=`/en/my/projects/new?draft=${draft}`;
  assert.equal(safeReturnTo(fresh,"fr"),fresh);assert.equal(translateReturnTo(fresh,"en"),translated);
  assert.equal(new URL(authHref("fr","sign-in",fresh),"https://courses.invalid").searchParams.get("returnTo"),fresh);
  for(const bad of [`https://evil.invalid${fr}`,`//evil.invalid${fr}`,`${fr}?ownerId=${actor}`,`${fr}/../${projectId}`,`${fr}?returnTo=https://evil.invalid`,`${fresh}&draft=${randomUUID()}`,`${fr}#private`,`/fr/espace/projets/%2e%2e/${projectId}`,fr.replace("/espace/","\\espace/")])assert.equal(safeReturnTo(bad,"fr"),"/fr/compte");
});
