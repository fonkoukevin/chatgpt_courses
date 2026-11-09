/** Cleanup is limited to known TEST sessions; no refund is ever attempted here. */
export async function expireKnownExternalSessions(proof, expireOne) {
  if (!Array.isArray(proof?.sessions) || proof.sessions.length > 2) throw new Error('EXTERNAL_TEST_SESSION_REFERENCES_INVALID');
  const sessions = [];
  let failed = 0;
  for (const reference of proof.sessions) {
    try { sessions.push(await expireOne(reference)); }
    catch { failed++; }
  }
  const unknownLookup = proof.checkoutOperationLookupFailed === true;
  if (failed || unknownLookup) {
    const error = new Error('EXTERNAL_TEST_SESSION_CLEANUP_UNCONFIRMED');
    error.cleanupFacts = { attempted: proof.sessions.length, failed, unknownLookup };
    throw error;
  }
  return { testMode: true, cleanupConfirmed: true, sessions };
}
