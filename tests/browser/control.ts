import { connect } from 'node:net';

type Result = { ok: boolean; webPid: number; apiPid?: number; error?: string; eventId?: string; status?: number; received?: boolean; externalReplayRequested?: boolean;
  sessionId?: string; refundId?:string; chargeId?:string; paymentIntentId?: string | null; eventType?: string; sourceEventApiVersion?: string | null; amountMinor?: number; currency?: string; metadataOrderMatches?: boolean; replayHttpAcknowledged?: boolean };
export type ExternalStripeFacts = Result & {orderId:string;operationId:string;sessionId:string;testMode:boolean;sessionStatus:string;paymentStatus:string;paymentIntentStatus?:string;refundCount:number;refundedMinor:number;refunds?:{refundId:string;amountMinor:number;status:string;operationId:string|null;metadataOrderMatches:boolean}[]};

export async function inspectExternalStripeOrder(orderId:string,operationId:string,sessionId:string):Promise<ExternalStripeFacts>{
  return await sendControl('inspect-external-stripe-order',{orderId,operationId,sessionId}) as ExternalStripeFacts;
}

export function replayExternalStripeEvent(eventId: string, orderId: string): Promise<Result> {
  return sendControl('replay-external-stripe-event', { eventId, orderId });
}

export function controlRefund(operation:'configure-refund'|'advance-refund'|'external-refund',data:{orderId:string;operationId?:string;state:string;type?:string;amountMinor?:number}):Promise<Result>{
  return sendControl(operation,data);
}

export function controlApi(operation: 'stop-api' | 'start-api' | 'pause-mailpit' | 'resume-mailpit' | 'start-payment-worker' | 'stop-payment-worker'|'start-refund-worker'|'stop-refund-worker'): Promise<Result> {
  return sendControl(operation);
}

/** Controls only the isolated provider transport; never a product HTTP backdoor. */
export function controlPayment(orderId: string, state: 'OPEN'|'PROCESSING'|'PAID'|'FAILED'|'EXPIRED'|'REFUNDED', type: string, replayId?: string): Promise<Result> {
  return sendControl('advance-payment', {orderId,state,type,...(replayId ? {replayId} : {})});
}

function sendControl(operation: string, data: Record<string, string|number> = {}): Promise<Result> {
  const ipc = process.env.COURSES_BROWSER_IPC;
  const token = process.env.COURSES_BROWSER_TOKEN;
  if (!ipc || !token) throw new Error('Superviseur navigateur absent.');
  return new Promise((resolveCommand, rejectCommand) => {
    const socket = connect(ipc);
    let input = '';
    let settled = false;
    const fail = (error: Error) => { settled = true; socket.destroy(); rejectCommand(error); };
    socket.setTimeout(process.env.COURSES_BROWSER_PHASE?.startsWith('P12') || ['P13', 'P15','P19','P19_EXTERNAL'].includes(process.env.COURSES_BROWSER_PHASE ?? '') ? 360_000 : 90_000, () => fail(new Error('Commande IPC expirée.')));
    socket.once('error', () => fail(new Error('Connexion au superviseur interrompue.')));
    socket.once('connect', () => socket.write(`${JSON.stringify({ token, operation, ...data })}\n`));
    socket.on('data', (chunk) => {
      input += chunk.toString('utf8');
      if (input.length > 4096) return fail(new Error('Réponse IPC invalide.'));
      if (!input.includes('\n')) return;
      let result: Result;
      try { result = JSON.parse(input.slice(0, input.indexOf('\n'))) as Result; }
      catch { return fail(new Error('Réponse IPC illisible.')); }
      if (!result.ok || !Number.isInteger(result.webPid)) return fail(new Error(result.error || 'Commande IPC non confirmée.'));
      settled = true;
      socket.end();
      resolveCommand(result);
    });
    socket.once('close', () => { if (!settled) rejectCommand(new Error('Superviseur fermé sans confirmation.')); });
  });
}
