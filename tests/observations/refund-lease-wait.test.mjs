import test from 'node:test';
import assert from 'node:assert/strict';
import { refundRecoveryWaitMs } from '../browser/refund-lease-wait.ts';
const active=remaining=>({jobState:'PROCESSING',leaseActive:true,leaseRemainingMs:remaining});
test('shared refund wait guard stays at ten seconds without the observed abandoned active lease',()=>{
  assert.equal(refundRecoveryWaitMs(false,active(120000)),10000);
  assert.equal(refundRecoveryWaitMs(true,{...active(120000),jobState:'WAITING'}),10000);
  assert.equal(refundRecoveryWaitMs(true,{...active(120000),leaseActive:false}),10000);
});
test('shared guard waits the real remaining lease plus thirty seconds within its unchanged cap',()=>{
  assert.equal(refundRecoveryWaitMs(true,active(120000)),150000);
  assert.equal(refundRecoveryWaitMs(true,active(150000)),180000);
  assert.throws(()=>refundRecoveryWaitMs(true,active(150001)),/no lease is shortened/);
});
