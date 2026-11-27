import { connect } from 'node:net';
import { expect,test } from '@playwright/test';
import { checkedUuid,createFixtureOffer,prepareOrder } from '../browser/commerce-fixture';
import { methodLearner,loginMethodAccount } from '../browser/methods-fixture';
import { createPaymentCheckout,waitForPayment } from '../browser/payments-fixture';
import { refundSources,refundContext,requestRefund,approveRefund,executeRefund,allocations,memberPath,operation,operations } from '../browser/refunds-fixture';
import { refundRecoveryWaitMs } from '../browser/refund-lease-wait';

type Lease={operationState:string;jobState:string;leaseActive:boolean;leaseRemainingMs:number;sameLeaseAsAbandoned:boolean;operationCount:number;grantCount:number;revokedGrantCount:number};
async function control(operation:string,fields:Record<string,unknown>={}){
  return await new Promise<Record<string,unknown>>((resolve,reject)=>{
    const socket=connect(process.env.COURSES_BROWSER_IPC!);let input='',settled=false;
    const fail=()=>{if(!settled){settled=true;socket.destroy();reject(Error('Owned observation control unavailable'));}};
    socket.setTimeout(360000,fail);socket.once('error',fail);socket.once('connect',()=>socket.write(JSON.stringify({token:process.env.COURSES_BROWSER_TOKEN,operation,...fields})+'\n'));
    socket.on('data',chunk=>{input+=chunk.toString('utf8');if(input.length>32768)return fail();if(!input.includes('\n'))return;try{const value=JSON.parse(input.slice(0,input.indexOf('\n')));if(value.ok!==true)return fail();settled=true;socket.end();resolve(value);}catch{fail();}});socket.once('close',fail);
  });
}
test('owned abandoned refund lease exercises the shared remaining-lease wait guard without another create',async({playwright})=>{
  const sources=await refundSources(playwright),learner=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});
  try{
    const owner=await methodLearner(learner,'fr');await loginMethodAccount(learner,owner);
    const offer=await createFixtureOffer(sources.operator,sources.actor,[sources.a.learning.course.fr]);
    const order=await prepareOrder(learner,owner.id,offer.value,'fr');const fixture={owner,offer,order,locale:'fr' as const};
    await createPaymentCheckout(learner,fixture);
    const paid=await control('advance-payment',{orderId:checkedUuid(order.value.id),state:'PAID',type:'checkout.session.completed'});
    expect(paid.status).toBe(200);expect(paid.received).toBe(true);await waitForPayment(learner,order.value.id,'PAID','READY');
    async function captureUnexpectedAccess(httpStatus:number){
      if(httpStatus===200)return;
      const nodes=Object.fromEntries(['course','module','activity'].map(role=>{
        const node=(role==='activity'?sources.a.learning.premium:sources.a.learning[role as 'course'|'module']).fr.value;
        return [role,{resourceId:node.resourceId,versionId:node.versionId}];
      }));
      await control('observe-access',{ownerId:owner.id,orderId:order.value.id,nodes,httpStatus});
    }
    const accessBeforeRefundStatus=(await learner.get(memberPath(sources.a.learning))).status();
    await captureUnexpectedAccess(accessBeforeRefundStatus);
    await control('record-safe-check',{facts:{accessBeforeRefundStatus}});expect(accessBeforeRefundStatus).toBe(200);
    const financial=await refundContext(learner,order.value.id),request=await requestRefund(learner,fixture);
    const prepared=await approveRefund(sources,request.value.id,financial.paidAmountMinor,allocations(financial,financial.paidAmountMinor,'REVOKE'));
    await control('configure-refund',{orderId:order.value.id,state:'TIMEOUT'});await executeRefund(sources,prepared.id);
    const unknownInitial=(await operation(learner,prepared.id)).state==='UNKNOWN';
    const accessWhileUnknownStatus=(await learner.get(memberPath(sources.a.learning))).status();
    await captureUnexpectedAccess(accessWhileUnknownStatus);
    await control('record-safe-check',{facts:{unknownInitial,accessWhileUnknownStatus}});expect(unknownInitial).toBe(true);expect(accessWhileUnknownStatus).toBe(200);
    await control('arm-lookup-crash',{orderId:order.value.id,operationId:prepared.id});
    const crash=await control('start-refund-worker');expect(crash.intentionalCrashConfirmed).toBe(true);
    const abandoned=await control('lease-snapshot',{phase:'after-crash'}) as unknown as Lease;
    const abandonedLeaseObserved=abandoned.jobState==='PROCESSING'&&abandoned.leaseActive;
    expect(abandonedLeaseObserved).toBe(true);expect(abandoned.sameLeaseAsAbandoned).toBe(true);expect(abandoned.operationState).toBe('UNKNOWN');
    await control('release-abandoned-lookup');const restarted=await control('start-api');expect(restarted.ready).toBe(true);
    const resumed=await control('lease-snapshot',{phase:'after-restart'}) as unknown as Lease;
    // This observation requires that the deliberately abandoned lease survives restart.
    // If startup consumed it, retain BRANCH_NOT_EXERCISED facts rather than claiming the old branch ran.
    expect(resumed.jobState==='PROCESSING'&&resumed.leaseActive&&resumed.sameLeaseAsAbandoned).toBe(true);
    const waitMs=refundRecoveryWaitMs(abandonedLeaseObserved,resumed),sharedWaitBranchExercised=waitMs>10000;
    await control('record-safe-check',{facts:{waitMs,sharedWaitBranchExercised,abandonedLeaseObserved}});expect(sharedWaitBranchExercised).toBe(true);
    await expect.poll(async()=>(await operation(learner,prepared.id)).state,{timeout:waitMs,intervals:[250,500,1000]}).toBe('SUCCEEDED');
    const final=await control('lease-snapshot',{phase:'final'}) as unknown as Lease;
    expect(final.grantCount).toBe(1);expect(final.revokedGrantCount).toBe(1);expect(final.operationCount).toBe(1);
    const accessAfterRefundStatus=(await learner.get(memberPath(sources.a.learning))).status(),finalOperationCount=(await operations(learner,order.value.id)).total;
    await control('record-safe-check',{facts:{accessAfterRefundStatus,finalOperationCount}});expect(accessAfterRefundStatus).toBe(403);expect(finalOperationCount).toBe(1);
    const transport=await control('transport-observation');const refunds=transport.refunds as {createCalls:number;stableKeys:number;localRecords:number};
    expect(refunds.createCalls).toBe(1);expect(refunds.stableKeys).toBe(1);expect(refunds.localRecords).toBe(1);
  }finally{await learner.dispose();await sources.operator.dispose();await sources.secondEditor.dispose();}
});
