export type RefundIntent = { target: string; accountId: string; body: string; key: string };
export function refundIntent(previous: RefundIntent | null, target: string, accountId: string, body: unknown, newKey: () => string): RefundIntent {
  const serialized = JSON.stringify(body);
  return previous?.target === target && previous.accountId === accountId && previous.body === serialized ? previous : { target, accountId, body: serialized, key: newKey() };
}
