import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";
import { commerceHeaders, commerceSql, createCommerceSources, createFixtureOffer, fixtureOfferFields, prepareOrder } from "./commerce-fixture";
import { methodLearner, loginMethodAccount } from "./methods-fixture";
import { accountHeaders, createTicket } from "./account-fixture";
import { advancePayment, createPaymentCheckout, waitForPayment } from "./payments-fixture";
import type { OfferView } from "../../apps/web/src/lib/api/generated/types.gen";

export async function operationsSources(playwright: PlaywrightWorkerArgs["playwright"]) {
  const operator = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  const owner = await playwright.request.newContext({ baseURL: process.env.COURSES_BROWSER_ORIGIN });
  const source = await createCommerceSources(operator), actor = source.actor;
  const roles = ["OPERATIONS_MANAGER", "OPERATIONS_READER", "SUPPORT_OPERATOR", "REFUND_OPERATOR"];
  const quoted = roles.map(role => `'${role}'`).join(",");
  expect(commerceSql(`INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${actor}',id FROM roles WHERE code IN(${quoted}) ON CONFLICT DO NOTHING; SELECT count(*) FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE u.user_id='${actor}' AND r.code IN(${quoted}) AND u.revoked_at IS NULL;`)).toBe(String(roles.length));
  const me = await operator.get("/api/v1/auth/me"); expect(me.status()).toBe(200);
  const permissions = (await me.json() as { permissions: string[] }).permissions;
  for (const permission of ["operations.read", "operations.metrics.read", "support.drafts", "support.internal.write"]) expect(permissions).toContain(permission);
  const account = await methodLearner(owner); await loginMethodAccount(owner, account);
  const euroOffer = await createFixtureOffer(operator, actor, [source.learning.course.fr], 1000), euroOrder = await prepareOrder(owner, account.id, euroOffer.value, "fr");
  await createPaymentCheckout(owner, { owner: account, offer: euroOffer, order: euroOrder, locale: "fr" });
  await advancePayment(euroOrder.value.id, "PAID", "checkout.session.completed"); await waitForPayment(owner, euroOrder.value.id, "PAID", "READY");
  const dollarFields = fixtureOfferFields([source.second.fr], 3000); dollarFields.price = { amountMinor: 3000, currency: "USD" };
  const draft = await operator.post("/api/v1/admin/offers", { headers: await commerceHeaders(operator, actor), data: { code: `demo-p15-${randomUUID()}`, kind: "COURSE", fields: dollarFields, reason: "Explicit synthetic USD verification offer only." } }); expect(draft.status()).toBe(201);
  const draftValue = await draft.json() as OfferView, activated = await operator.post(`/api/v1/admin/offers/${draftValue.id}/activate`, { headers: await commerceHeaders(operator, actor, draft.headers().etag), data: { reason: "Test-only activation, no commercial price." } }); expect(activated.status()).toBe(200);
  const dollarOffer = { value: await activated.json() as OfferView, etag: activated.headers().etag }, dollarOrder = await prepareOrder(owner, account.id, dollarOffer.value, "fr");
  await createPaymentCheckout(owner, { owner: account, offer: dollarOffer, order: dollarOrder, locale: "fr" });
  await advancePayment(dollarOrder.value.id, "PAID", "checkout.session.completed"); await waitForPayment(owner, dollarOrder.value.id, "PAID", "READY");
  const ticket = await createTicket(owner, account.id, { subject: `P15 assistance locale ${randomUUID()}` });
  const period = { from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() };
  return { operator, owner, actor, source, account, ticket, period, euroOrder: euroOrder.value, dollarOrder: dollarOrder.value };
}
export type OperationsSources = Awaited<ReturnType<typeof operationsSources>>;
export async function staffWrite(request: APIRequestContext, actor: string, method: "post" | "put" | "patch", path: string, data: unknown, etag?: string) {
  return request[method](path, { headers: await accountHeaders(request, actor, etag, randomUUID()), data });
}
