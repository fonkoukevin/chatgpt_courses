import { connect } from 'node:net';

type Result = { ok: boolean; webPid: number; apiPid?: number; error?: string };

export function controlApi(operation: 'stop-api' | 'start-api' | 'pause-mailpit' | 'resume-mailpit'): Promise<Result> {
  const ipc = process.env.COURSES_BROWSER_IPC;
  const token = process.env.COURSES_BROWSER_TOKEN;
  if (!ipc || !token) throw new Error('Superviseur navigateur absent.');
  return new Promise((resolveCommand, rejectCommand) => {
    const socket = connect(ipc);
    let input = '';
    let settled = false;
    const fail = (error: Error) => { settled = true; socket.destroy(); rejectCommand(error); };
    socket.setTimeout(90_000, () => fail(new Error('Commande IPC expirée.')));
    socket.once('error', () => fail(new Error('Connexion au superviseur interrompue.')));
    socket.once('connect', () => socket.write(`${JSON.stringify({ token, operation })}\n`));
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
