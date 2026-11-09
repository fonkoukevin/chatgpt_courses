import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import type { CurrencyMetrics, OfferView, OperationsMetrics, SupportDraftView, SupportTicketView } from "../../apps/web/src/lib/api/generated/types.gen";
import { downloadOperationsMetrics, getOperationsDashboard, requestOrderReconciliation, retryIncident } from "../../apps/web/src/lib/api/operations-client";
import { createAdminOffer } from "../../apps/web/src/lib/api/offers-admin-client";
import { offerEtag } from "../../apps/web/src/lib/api/offers-admin-validation";
import { getSupportDraft, publishSupportDraft, saveSupportDraft } from "../../apps/web/src/lib/api/operations-support-client";
import { isOperationsDashboard, isOperationsMetrics } from "../../apps/web/src/lib/api/operations-validation";
import { draftEtag, isPublishedSupportReply, isSupportTimeEntry } from "../../apps/web/src/lib/api/support-work-validation";
import { accountIntent } from "../../apps/web/src/lib/account/intent";
import { safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { operationsCount, operationsMoney } from "../../apps/web/src/lib/operations/format";
import { operationsPeriod, parseOperationsQuery } from "../../apps/web/src/lib/operations/query";
import { operationsHref, operationsPath, safeOperationsDestination } from "../../apps/web/src/lib/operations/routes";

const originalFetch=globalThis.fetch,actor=randomUUID(),ticketId=randomUUID(),orderId=randomUUID(),now="2026-11-09T00:00:00Z",period={from:"2026-11-01T00:00:00.000Z",to:"2026-11-09T00:00:00.000Z"};
const csrf={token:"unit-only-operations-csrf",headerName:"X-CSRF-TOKEN",parameterName:"_csrf"};
const draft=():SupportDraftView=>({ticketId,authorId:actor,revision:1,text:"Synthetic operator working draft",state:"DRAFT",publishedMessageId:null,updatedAt:now});
const ticket=():SupportTicketView=>({id:ticketId,revision:2,category:"OTHER",subject:"Synthetic support request",locale:"fr",state:"OPEN",context:null,createdAt:now,updatedAt:now});
function metrics():OperationsMetrics{const currency:CurrencyMetrics={currency:"EUR",grossPaidMinor:"9007199254740993123",confirmedRefundedMinor:"24",netCollectedBeforeCostsMinor:"9007199254740993099",taxesMinor:null,feesMinor:null,variableCostsMinor:null,supportCostMinor:null,estimatedContributionMinor:null,unknownReasons:["TAX_NOT_RECORDED","COST_NOT_RECORDED"]};return {period,generatedAt:now,revisionTrackingSince:now,counts:[{code:"USEFUL_VISITS",value:null,availability:"UNKNOWN",unavailableReason:"NOT_CONFIGURED",definition:{code:"USEFUL_VISITS",unit:"count",source:"not configured",dateField:"none",deduplication:"none",denominator:"none",coverage:"none",limitation:"measurement unavailable"}}],currencies:[currency,{...currency,currency:"USD",grossPaidMinor:"10",confirmedRefundedMinor:"20",netCollectedBeforeCostsMinor:"-10"}],recordedSupportMinutes:null,supportMinutesAvailability:"UNKNOWN"};}
beforeEach(()=>clearCsrfToken());afterEach(()=>{globalThis.fetch=originalFetch;clearCsrfToken();});

test("operational returns preserve canonical UTC filters and reject ambiguous or impossible input",()=>{
  const href=operationsHref("fr","orders",{...period,page:2,currency:"EUR"});
  assert.equal(safeReturnTo(href,"fr"),href);assert.equal(translateReturnTo(href,"en"),href.replace(/^\/fr\//,"/en/"));
  assert.equal(safeOperationsDestination(`${operationsPath("fr","orders")}?from=${encodeURIComponent(period.from)}&from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`,"fr"),null);
  assert.equal(safeReturnTo("/fr/admin/operations/orders?returnTo=https://example.invalid","fr"),"/fr/compte");
  assert.throws(()=>operationsPeriod("2026-02-31T00:00:00Z",period.to));assert.throws(()=>operationsPeriod(period.to,period.from));
  assert.throws(()=>parseOperationsQuery("orders",new URLSearchParams({...period,paymentStatus:"NOT_A_PAYMENT_STATE"})));
  assert.throws(()=>parseOperationsQuery("support",new URLSearchParams("state=ALL")));
});
test("aggregates retain exact decimal strings, unknown costs and separate currencies beyond Number precision",()=>{
  const value=metrics();assert.equal(isOperationsMetrics(value),true);
  assert.equal(operationsCount("9007199254740993123","en"),"9,007,199,254,740,993,123");
  assert.equal(operationsMoney("9007199254740993123","EUR","en"),"\u20ac90,071,992,547,409,931.23");assert.equal(operationsMoney("-1","GBP","en"),"-\u00a30.01");
  assert.throws(()=>operationsMoney("100","JPY","en"));
  assert.equal(isOperationsMetrics({...value,currencies:[value.currencies[0],value.currencies[0]]}),false);
  assert.equal(isOperationsMetrics({...value,currencies:[{...value.currencies[0],netCollectedBeforeCostsMinor:"9007199254740993100"}]}),false);
  assert.equal(isOperationsMetrics({...value,counts:[{...value.counts[0],value:"0"}]}),false);
  assert.equal(isOperationsMetrics({...value,recordedSupportMinutes:"0"}),false);
  assert.equal(isOperationsMetrics({...value,currencies:[{...value.currencies[0],feesMinor:0}]}),false);
});
test("dashboard reads bind the requested period and keep forbidden counters distinct from zero",async()=>{
  const data={period,generatedAt:now,counters:[{code:"ORDERS_CREATED",value:null,availability:"FORBIDDEN",unavailableReason:"SOURCE_PERMISSION_REQUIRED"}]};
  assert.equal(isOperationsDashboard(data),true);assert.equal(isOperationsDashboard({...data,counters:[{...data.counters[0],value:"0"}]}),false);
  globalThis.fetch=async()=>Response.json({...data,period:{...period,to:"2026-11-08T00:00:00Z"}});
  const result=await getOperationsDashboard(period);assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error.kind,"invalid-response");
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(data);};assert.throws(()=>getOperationsDashboard({...period,from:period.to}));assert.equal(calls,0);
});
test("CSV exports verify decoded application size and SHA independently of transport compression",async()=>{
  const bytes=new TextEncoder().encode("metric,value\r\nPAYMENT_CONFIRMED,2\r\n"),headers={"Content-Type":"text/csv;charset=UTF-8","X-Content-Size":String(bytes.length),"Content-Disposition":'attachment; filename="operations-metrics-20261101-20261109.csv"',"X-Content-SHA256":createHash("sha256").update(bytes).digest("hex")};
  const transports:Array<Record<string,string>>=[{}, {"Content-Encoding":"gzip","Content-Length":String(gzipSync(bytes).byteLength)}];
  for(const transport of transports){
    // Fetch exposes decoded bytes; any transport length describes the encoded
    // representation, while the verified application size describes this body.
    globalThis.fetch=async(path,init)=>{assert.match(String(path),/^\/api\/v1\/admin\/metrics\/export\?/);assert.equal(init?.cache,"no-store");assert.equal(init?.credentials,"same-origin");assert.equal(init?.redirect,"error");return new Response(bytes,{headers:{...headers,...transport}});};
    const result=await downloadOperationsMetrics(period);assert.equal(result.ok,true);if(result.ok)assert.equal(await result.data.blob.text(),new TextDecoder().decode(bytes));
  }
  for(const extra of [{"X-Content-SHA256":"a".repeat(64)},{"X-Content-Size":String(bytes.length+1)},{"X-Content-Size":String(bytes.length-1)},{"X-Content-Size":"1048577"},{"Content-Type":"text/html;charset=UTF-8"},{"Content-Disposition":'attachment; filename="operations-metrics-20261001-20261109.csv"'}]){globalThis.fetch=async()=>new Response(bytes,{headers:{...headers,...extra}});const rejected=await downloadOperationsMetrics(period);assert.equal(rejected.ok,false);if(!rejected.ok)assert.equal(rejected.error.kind,"invalid-response");}
  const missingSize=new Headers(headers);missingSize.delete("X-Content-Size");missingSize.set("Content-Length",String(bytes.length));globalThis.fetch=async()=>new Response(bytes,{headers:missingSize});const missing=await downloadOperationsMetrics(period);assert.equal(missing.ok,false);if(!missing.ok)assert.equal(missing.error.kind,"invalid-response");
});
test("reconciliation preserves account-scoped intentions after an ambiguous response and never forces payment",async()=>{
  const body={reason:"MANUAL_RECONCILIATION" as const,expectedOrderRevision:3,forcePaid:true},intent=accountIntent(null,`order:${orderId}:3`,actor,{reason:body.reason,expectedOrderRevision:3},randomUUID),writes:Array<{body:string;key:string|null;context:string|null}>=[];
  globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf")return Response.json(csrf);const headers=new Headers(init?.headers);writes.push({body:String(init?.body),key:headers.get("Idempotency-Key"),context:headers.get("X-Account-Context")});if(writes.length===1)throw new TypeError("Synthetic unavailable transport");return Response.json({actionId:randomUUID(),kind:"ORDER",targetId:orderId,state:"PENDING",recordedAt:now,replayed:true},{status:202});};
  assert.equal((await requestOrderReconciliation(orderId,body,intent.key,actor)).ok,false);
  const retry=accountIntent(intent,intent.target,actor,{reason:body.reason,expectedOrderRevision:3},()=>{throw new Error("The same intention keeps its key");});assert.equal((await requestOrderReconciliation(orderId,body,retry.key,actor)).ok,true);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(JSON.parse(writes[0].body),{reason:body.reason,expectedOrderRevision:3});assert.equal(writes[0].context,actor);
  assert.notEqual(accountIntent(intent,intent.target,randomUUID(),{reason:body.reason,expectedOrderRevision:3},randomUUID).key,intent.key);
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(csrf);};assert.throws(()=>retryIncident("NOT_ALLOWED",randomUUID(),{reason:"MANUAL_RETRY",ackDuplicate:false},randomUUID(),actor));assert.equal(calls,0);
});
test("reply draft saving is private, revision-bound and separate from explicit publication",async()=>{
  const value=draft(),requests:Array<{path:string;method:string|undefined}>=[];
  globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf")return Response.json(csrf);requests.push({path:String(path),method:init?.method});const headers=new Headers(init?.headers);assert.equal(headers.get("X-Account-Context"),actor);assert.equal(headers.get("If-Match"),draftEtag(value));return Response.json({...value,revision:2},{headers:{ETag:draftEtag({...value,revision:2})}});};
  assert.equal((await saveSupportDraft(ticketId,draftEtag(value),{text:value.text},actor)).ok,true);assert.equal(requests.length,1);assert.equal(requests[0].method,"PUT");assert.ok(requests.every(item=>!item.path.includes("publications")));
  assert.throws(()=>saveSupportDraft(ticketId,`W/${draftEtag(value)}`,{text:value.text},actor));
  globalThis.fetch=async()=>Response.json({...value,authorId:randomUUID()},{headers:{ETag:draftEtag(value)}});assert.equal((await getSupportDraft(ticketId,actor)).ok,false);
  const messageId=randomUUID(),published={ticket:ticket(),message:{id:messageId,ticketId,authorKind:"SUPPORT",message:value.text,attachments:[],createdAt:now,notificationStatus:"PENDING"},draft:{...value,state:"PUBLISHED",publishedMessageId:messageId}};
  assert.equal(isPublishedSupportReply(published),true);assert.equal(isPublishedSupportReply({...published,message:{...published.message,message:"Different unpublished text"}}),false);
  clearCsrfToken();globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf")return Response.json(csrf);assert.match(String(path),/\/reply-draft\/publications$/);assert.equal(new Headers(init?.headers).get("Idempotency-Key")!==null,true);assert.deepEqual(JSON.parse(String(init?.body)),{expectedTicketRevision:2,reason:"Synthetic explicit publication"});return Response.json(published,{status:201});};
  assert.equal((await publishSupportDraft(ticketId,draftEtag(value),{expectedTicketRevision:2,reason:"Synthetic explicit publication"},randomUUID(),actor)).ok,true);
});
test("incomplete offers preserve null commercial parameters and require an exact acknowledged working copy",async()=>{
  const fields={copies:[],resources:[],locales:[],price:null,tax:null,conditions:null},source:OfferView={id:randomUUID(),productId:randomUUID(),revision:0,currentRevisionId:randomUUID(),revisionNumber:1,code:"demo-p15-unit-incomplete",kind:"COURSE",state:"DRAFT",fields,createdAt:now,updatedAt:now};
  globalThis.fetch=async(path,init)=>{if(path==="/api/v1/auth/csrf")return Response.json(csrf);assert.equal(new Headers(init?.headers).get("X-Account-Context"),actor);assert.deepEqual(JSON.parse(String(init?.body)).fields,fields);return Response.json(source,{status:201,headers:{ETag:offerEtag(source)}});};
  const body={code:source.code,kind:source.kind,fields,reason:"Synthetic draft with no commercial decisions"};assert.equal((await createAdminOffer(body,actor)).ok,true);
  globalThis.fetch=async()=>Response.json({...source,fields:{...fields,price:{amountMinor:999,currency:"EUR"}}},{status:201,headers:{ETag:offerEtag(source)}});assert.equal((await createAdminOffer(body,actor)).ok,false);
});
test("an explicitly recorded zero support duration is distinct from a missing or coerced measurement",()=>{
  const value={id:randomUUID(),ticketId,authorId:actor,minutes:0,reason:"Synthetic explicit zero measurement",createdAt:now};assert.equal(isSupportTimeEntry(value),true);assert.equal(isSupportTimeEntry({...value,minutes:null}),false);assert.equal(isSupportTimeEntry({...value,minutes:"0"}),false);assert.equal(isSupportTimeEntry({...value,minutes:0.5}),false);
});
