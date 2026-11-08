import { randomBytes } from 'node:crypto';

/** Provider HTTP transport only, private to the owned PostgreSQL recipe. Never calls Stripe. */
export function createRefundTransport({ sessions, send, sendEvent }) {
  const refunds = new Map(), keys = new Map(), nextStates = new Map();
  let createCalls = 0, ambiguityCount = 0;
  const sessionForIntent = id => [...sessions.values()].find(session => session.intent === id);
  const successTotal = intent => [...refunds.values()].filter(refund => refund.intent === intent && refund.state === 'SUCCEEDED').reduce((total, refund) => total + refund.amount, 0);
  const committedTotal = (intent, except) => [...refunds.values()].filter(refund => refund.intent === intent && refund.id !== except && ['SUCCEEDED', 'PENDING', 'REQUIRES_ACTION'].includes(refund.state)).reduce((total, refund) => total + refund.amount, 0);
  const view = refund => ({ id: refund.id, object: 'refund', amount: refund.amount, currency: refund.currency, payment_intent: refund.intent, charge: refund.charge, created: refund.created,
    status: refund.state.toLowerCase(), metadata: refund.metadata, reason: 'requested_by_customer', failure_reason: refund.state === 'FAILED' ? 'unknown' : null, pending_reason: refund.state === 'PENDING' ? 'processing' : null });
  const chargeView = session => ({ id: session.charge, object: 'charge', livemode: false, paid: true, amount: session.amount,
    amount_refunded: Math.max(session.state === 'REFUNDED' ? session.amount : 0, successTotal(session.intent)), refunded: successTotal(session.intent) >= session.amount || session.state === 'REFUNDED', currency: session.currency,
    payment_intent: session.intent, created: session.created, metadata: { order_id: session.order, operation_id: session.operation } });
  const intentView = session => ({ id: session.intent, object: 'payment_intent', livemode: false, status: ['PAID', 'REFUNDED'].includes(session.state) ? 'succeeded' : session.state === 'PROCESSING' ? 'processing' : 'requires_payment_method', amount: session.amount,
    amount_received: ['PAID', 'REFUNDED'].includes(session.state) ? session.amount : 0, currency: session.currency, latest_charge: chargeView(session), metadata: { order_id: session.order, operation_id: session.operation } });
  function create(session, amount, state, metadata = {}) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > session.amount || !['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED'].includes(state)) throw new Error('Controlled refund parameters invalid.');
    const refund = { id: 're_browser' + randomBytes(14).toString('hex'), intent: session.intent, charge: session.charge, amount, currency: session.currency, state, created: Math.floor(Date.now() / 1000), metadata };
    refunds.set(refund.id, refund); return refund;
  }
  return {
    refundedAmount: successTotal,
    async handle(req, res, url) {
      const intent = /^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/.exec(url.pathname);
      if (req.method === 'GET' && intent) { const session = sessionForIntent(intent[1]); send(res, session ? 200 : 404, session ? intentView(session) : { error: { type: 'invalid_request_error', message: 'Unknown controlled intent.' } }); return true; }
      const charge = /^\/v1\/charges\/(ch_[A-Za-z0-9_]+)$/.exec(url.pathname);
      if (req.method === 'GET' && charge) { const session = [...sessions.values()].find(value => value.charge === charge[1]); send(res, session ? 200 : 404, session ? chargeView(session) : { error: { type: 'invalid_request_error', message: 'Unknown controlled charge.' } }); return true; }
      const one = /^\/v1\/refunds\/(re_[A-Za-z0-9_]+)$/.exec(url.pathname);
      if (req.method === 'GET' && one) { const refund = refunds.get(one[1]); send(res, refund ? 200 : 404, refund ? view(refund) : { error: { type: 'invalid_request_error', message: 'Unknown controlled refund.' } }); return true; }
      if (url.pathname !== '/v1/refunds') return false;
      if (req.method === 'GET') {
        const intent = url.searchParams.get('payment_intent'), charge = url.searchParams.get('charge');
        const all = [...refunds.values()].filter(value => intent ? value.intent === intent : charge ? value.charge === charge : true).reverse();
        const after = url.searchParams.get('starting_after'), start = after ? all.findIndex(value => value.id === after) + 1 : 0, limit = Math.min(100, Number(url.searchParams.get('limit') ?? 10));
        const page = all.slice(start, start + limit);
        send(res, 200, { object: 'list', data: page.map(view), has_more: start + limit < all.length, url: '/v1/refunds' }); return true;
      }
      if (req.method !== 'POST') { send(res, 405, { error: { type: 'invalid_request_error', message: 'Controlled refund method refused.' } }); return true; }
      createCalls++;
      let raw = ''; for await (const chunk of req) { raw += chunk.toString('utf8'); if (Buffer.byteLength(raw) > 32768) { send(res, 413, { error: { type: 'invalid_request_error', message: 'Controlled refund size bound.' } }); return true; } }
      const params = new URLSearchParams(raw), key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{1,100}$/.test(key)) { send(res, 400, { error: { type: 'invalid_request_error', message: 'Stable refund key required.' } }); return true; }
      const canonical = JSON.stringify([...params.entries()].sort(([left], [right]) => left.localeCompare(right))), existing = keys.get(key);
      if (existing) { send(res, existing.body === canonical ? 200 : 409, existing.body === canonical ? view(refunds.get(existing.id)) : { error: { type: 'idempotency_error', message: 'Controlled refund body changed.' } }); return true; }
      const session = sessionForIntent(params.get('payment_intent')), amount = Number(params.get('amount'));
      if (!session || !['PAID', 'REFUNDED'].includes(session.state) || !Number.isSafeInteger(amount) || amount < 1 || amount + committedTotal(session.intent) > session.amount) { send(res, 400, { error: { type: 'invalid_request_error', message: 'Controlled refund amount unavailable.' } }); return true; }
      const metadata = Object.fromEntries([...params].filter(([name]) => /^metadata\[[a-z_]+\]$/.test(name)).map(([name, value]) => [name.slice(9, -1), value]));
      if (!/^[a-f0-9-]{36}$/.test(metadata.refund_operation_id ?? '') || metadata.order_id !== session.order || key !== `cc-refund-${metadata.refund_operation_id}` || params.get('reason') !== 'requested_by_customer') { send(res, 400, { error: { type: 'invalid_request_error', message: 'Controlled refund binding refused.' } }); return true; }
      const selected = nextStates.get(session.order) ?? 'SUCCEEDED'; nextStates.delete(session.order);
      const refund = create(session, amount, selected === 'TIMEOUT' ? 'SUCCEEDED' : selected, metadata); keys.set(key, { id: refund.id, body: canonical });
      if (selected === 'TIMEOUT') {
        // Persist the provider operation, then exceed the configured 2s read
        // timeout. An immediate reset can be transparently retried by the HTTP
        // transport and is not a deterministic lost-response timeout.
        ambiguityCount++; await new Promise(resolve => setTimeout(resolve, 3500));
      }
      send(res, 200, view(refund)); return true;
    },
    configure(orderId, state) {
      if (!/^[a-f0-9-]{36}$/.test(orderId) || !['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'].includes(state)) throw new Error('Controlled refund transition refused.');
      nextStates.set(orderId, state); return { configured: true };
    },
    async advance(orderId, operationId, state, type) {
      const session = [...sessions.values()].find(value => value.order === orderId), refund = [...refunds.values()].find(value => value.intent === session?.intent && value.metadata.refund_operation_id === operationId);
      if (!session || !refund || !['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED'].includes(state) || !['refund.created', 'refund.updated', 'refund.failed', 'charge.refunded'].includes(type)) throw new Error('Owned controlled refund required.');
      if (['SUCCEEDED', 'PENDING', 'REQUIRES_ACTION'].includes(state) && refund.amount + committedTotal(session.intent, refund.id) > session.amount) throw new Error('Controlled provider refund reservations exceeded.');
      refund.state = state;
      return await sendEvent({ id: 'evt_browser' + randomBytes(14).toString('hex'), object: 'event', api_version: '2026-10-28.endive', created: Math.floor(Date.now() / 1000), livemode: false, type,
        data: { object: type === 'charge.refunded' ? { id: session.charge, object: 'charge' } : { id: refund.id, object: 'refund' } } });
    },
    async external(orderId, amount, state = 'SUCCEEDED') {
      const session = [...sessions.values()].find(value => value.order === orderId);
      if (!session || amount + committedTotal(session.intent) > session.amount) throw new Error('Owned external controlled refund required.');
      const refund = create(session, amount, state);
      const receipt = await sendEvent({ id: 'evt_browser' + randomBytes(14).toString('hex'), object: 'event', api_version: '2026-10-28.endive', created: Math.floor(Date.now() / 1000), livemode: false,
        type: 'refund.created', data: { object: { id: refund.id, object: 'refund' } } });
      return { ...receipt, refundId: refund.id };
    },
    observation: () => ({ createCalls, stableKeys: keys.size, localRecords: [...refunds.values()].filter(value => value.metadata.refund_operation_id).length, records: refunds.size, successful: [...refunds.values()].filter(value => value.state === 'SUCCEEDED').length, ambiguityCount, externalStripe: false }),
  };
}
