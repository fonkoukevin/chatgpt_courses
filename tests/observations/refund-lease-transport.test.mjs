import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefundTransport } from '../../scripts/lib/browser-refunds.mjs';
const order='11111111-1111-1111-1111-111111111111';
const sessions=new Map([['fixture',{id:'cs_fixture',intent:'pi_fixture',charge:'ch_fixture',order,amount:1200,currency:'eur',state:'PAID',created:1}]]);
test('default lookup transport responds normally without a gate',async()=>{
  const sent=[];const transport=createRefundTransport({sessions,send:(_res,status,value)=>sent.push({status,value}),sendEvent:async()=>({received:true})});
  assert.equal(await transport.handle({method:'GET'},{},new URL('http://localhost/v1/payment_intents/pi_fixture')),true);
  assert.equal(sent.length,1);assert.equal(sent[0].status,200);assert.equal(transport.observation().createCalls,0);
});
test('explicit gate retains only the known lookup and is not a financial POST',async()=>{
  let release,hit;const blocked=new Promise(resolve=>{release=resolve;}),reached=new Promise(resolve=>{hit=resolve;});const sent=[];
  const transport=createRefundTransport({sessions,send:(_res,status)=>sent.push(status),sendEvent:async()=>({received:true}),beforeLookup:async facts=>{assert.equal(facts.orderId,order);assert.equal(facts.kind,'payment-intent');hit();await blocked;}});
  const lookup=transport.handle({method:'GET'},{},new URL('http://localhost/v1/payment_intents/pi_fixture'));
  await reached;assert.equal(sent.length,0);assert.equal(transport.observation().createCalls,0);release();await lookup;
  assert.deepEqual(sent,[200]);assert.equal(transport.observation().createCalls,0);
});
