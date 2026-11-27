/** Shared test guard, never an application retry or a lease/date mutation. */
export function refundRecoveryWaitMs(abandonedLeaseObserved: boolean, resumed: {jobState: string; leaseActive: boolean; leaseRemainingMs: number}) {
  const waitMs = abandonedLeaseObserved && resumed.jobState === 'PROCESSING' && resumed.leaseActive ? resumed.leaseRemainingMs + 30_000 : 10_000;
  if (waitMs > 180_000) throw new Error('The observed lease exceeds this scenario budget; no lease is shortened to pass.');
  return waitMs;
}
