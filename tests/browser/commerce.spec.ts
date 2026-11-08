import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect,test,type APIRequestContext,type Page } from '@playwright/test';
import type { OfferView,OrderView,PurchaseContext } from '../../apps/web/src/lib/api/generated/types.gen';
import { getCommerceDictionary } from '../../apps/web/src/lib/i18n/commerce';
import { offersPath,ordersPath } from '../../apps/web/src/lib/commerce/routes';
import { methodLearner,loginMethodAccount,fillMethodLogin } from './methods-fixture';
import { commerceHeaders,commerceSql,checkedUuid,createCommerceSources,createFixtureOffer,prepareOrder,type CommerceSources } from './commerce-fixture';
import { controlApi } from './control';

type Locale='fr'|'en';
async function capture(page:Page,name:string,width=390){
  await page.setViewportSize({width,height:1000});await page.getByRole('main').focus();
  await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done())));});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:join(process.env.COURSES_BROWSER_EVIDENCE!,`${name}.png`),fullPage:true,animations:'disabled'});
}
async function revise(request:APIRequestContext,actor:string,offer:OfferView,amountMinor=1799){
  const read=await request.get(`/api/v1/admin/offers/${offer.id}`);expect(read.status()).toBe(200);
  const current=await read.json() as OfferView;
  const change=await request.patch(`/api/v1/admin/offers/${offer.id}`,{headers:await commerceHeaders(request,actor,read.headers().etag),data:{fields:{...current.fields,price:{amountMinor,currency:'EUR'}},reason:'P11 explicit test price revision'}});expect(change.status()).toBe(200);
  const activated=await request.post(`/api/v1/admin/offers/${offer.id}/activate`,{headers:await commerceHeaders(request,actor,change.headers().etag),data:{reason:'P11 test-only reactivation'}});expect(activated.status()).toBe(200);
  return await activated.json() as OfferView;
}
test.describe('P11 offres et commandes sans paiement fictif',()=>{
  let editor:APIRequestContext,sources:CommerceSources;
  test.beforeAll(async({playwright})=>{editor=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});sources=await createCommerceSources(editor);});
  test.afterAll(async()=>{await editor?.dispose();});

  for(const locale of ['fr','en'] as const)test(`${locale} · connexion conservée, consentement explicite et commande privée réelle`,async({page,context,browser})=>{
    const t=getCommerceDictionary(locale),offer=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]);
    const account=await methodLearner(context.request,locale);
    await page.goto(offersPath(locale,offer.value.id));
    await expect(page.getByRole('heading',{level:1})).toContainText(locale==='fr'?'offre fictive':'fictional');
    await page.getByRole('link',{name:t.signIn,exact:true}).click();
    await fillMethodLogin(page,locale,account);await expect(page).toHaveURL(new RegExp(`${offersPath(locale,offer.value.id)}$`));
    const prepare=page.getByRole('button',{name:t.prepare,exact:true});await expect(prepare).toBeEnabled();await prepare.click();
    await expect(page.getByText(t.acceptRequired,{exact:true})).toBeVisible();
    expect(commerceSql(`SELECT count(*) FROM orders WHERE owner_id='${checkedUuid(account.id)}';`)).toBe('0');
    await page.getByRole('checkbox',{name:t.acceptTerms,exact:true}).check();await expect(prepare).toBeEnabled();
    await prepare.click();await expect(page).toHaveURL(new RegExp(`/${locale==='fr'?'recapitulatif':'summary'}$`));
    const orderId=checkedUuid((await page.locator('[data-order-id]').getAttribute('data-order-id'))!);
    const response=await context.request.get(`/api/v1/me/orders/${orderId}`);expect(response.status()).toBe(200);const order=await response.json() as OrderView;
    expect(order.snapshot.total).toEqual({amountMinor:1299,currency:'EUR'});expect(order.snapshot.resources).toHaveLength(1);expect(order.snapshot.locales).toEqual(['fr','en']);
    expect([order.orderStatus,order.paymentStatus,order.fulfillmentStatus]).toEqual(['PREPARED','NOT_STARTED','NOT_STARTED']);expect(order.acceptedTermsVersion).toBe('p11-test-v1');
    await expect(page.getByText(t.notPayment,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:t.checkout,exact:true})).toBeDisabled();
    await capture(page,`${locale}-1440-order-prepared`,1440);await capture(page,`${locale}-390-order-prepared`);await capture(page,`${locale}-320-order-prepared`,320);
    await page.goto(ordersPath(locale));await expect(page.getByRole('link',{name:t.openOrder,exact:true})).toBeVisible();await capture(page,`${locale}-390-orders-list`);
    const other=await browser.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});try{
      const second=await methodLearner(other.request,locale);await loginMethodAccount(other.request,second);
      expect((await other.request.get(`/api/v1/me/orders/${orderId}`)).status()).toBe(404);
      const b=await other.newPage();await b.goto(ordersPath(locale,orderId));await expect(b.locator('[data-order-id]')).toHaveCount(0);await expect(b.getByText(t.orderUnavailable,{exact:true})).toBeVisible();await capture(b,`${locale}-390-other-owner-refused`);
    }finally{await other.close();}
    expect(commerceSql('SELECT count(*) FROM access_grants;')).toBe('0');
  });

  test('fr · offre modifiée après lecture : revue exigée sans commande au nouveau prix',async({page,context})=>{
    const t=getCommerceDictionary('fr'),offer=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]);const account=await methodLearner(context.request);await loginMethodAccount(context.request,account);
    await page.goto(offersPath('fr',offer.value.id));await page.getByRole('checkbox',{name:t.acceptTerms,exact:true}).check();
    await revise(editor,sources.actor,offer.value);
    await page.getByRole('button',{name:t.prepare,exact:true}).click();await expect(page.getByText(t.offerChanged,{exact:true})).toBeVisible();
    expect(commerceSql(`SELECT count(*) FROM orders WHERE owner_id='${checkedUuid(account.id)}';`)).toBe('0');
    await capture(page,'fr-390-offer-changed-review-required');
    await page.getByRole('button',{name:t.reloadOffer,exact:true}).click();await expect(page.getByRole('checkbox',{name:t.acceptTerms,exact:true})).not.toBeChecked();
  });

  test('fr · instantané conservé après révision du prix de l’offre',async({page,context})=>{
    const offer=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]);const account=await methodLearner(context.request);await loginMethodAccount(context.request,account);
    const created=await prepareOrder(context.request,account.id,offer.value,'fr');await revise(editor,sources.actor,offer.value,2399);
    const read=await context.request.get(`/api/v1/me/orders/${created.value.id}`);expect(read.status()).toBe(200);const after=await read.json() as OrderView;
    expect(after.snapshot).toEqual(created.value.snapshot);expect(after.acceptedAt).toBe(created.value.acceptedAt);
    await page.goto(ordersPath('fr',created.value.id));await expect(page.locator('[data-order-id]')).toBeVisible();await capture(page,'fr-390-original-order-snapshot');
    const t=getCommerceDictionary('fr');await page.goto(offersPath('fr',offer.value.id));await expect(page.getByRole('link',{name:t.openExisting,exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:t.acceptTerms,exact:true}).check();await page.getByRole('button',{name:t.prepare,exact:true}).click();
    await expect(page).toHaveURL(new RegExp('/recapitulatif$'));const replacement=checkedUuid((await page.locator('[data-order-id]').getAttribute('data-order-id'))!);expect(replacement).not.toBe(created.value.id);
    const old=await context.request.get(`/api/v1/me/orders/${created.value.id}`);const retained=await old.json() as OrderView;expect(retained.orderStatus).toBe('CANCELLED');expect(retained.snapshot).toEqual(created.value.snapshot);
    const latest=await context.request.get(`/api/v1/me/orders/${replacement}`);expect((await latest.json() as OrderView).snapshot.total.amountMinor).toBe(2399);
  });

  test('fr · offre incomplète suspendue, prix absent et action bloquée',async({page,context})=>{
    const t=getCommerceDictionary('fr'),offer=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]);
    const save=await editor.patch(`/api/v1/admin/offers/${offer.value.id}`,{headers:await commerceHeaders(editor,sources.actor,offer.etag),data:{fields:{...offer.value.fields,price:null},reason:'P11 explicit incomplete configuration fixture'}});expect(save.status()).toBe(200);
    const account=await methodLearner(context.request);await loginMethodAccount(context.request,account);await page.goto(offersPath('fr',offer.value.id));
    await expect(page.getByText(t.priceUnknown,{exact:true})).toBeVisible();await expect(page.getByText(t.notReady,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:t.prepare,exact:true})).toBeDisabled();
    await capture(page,'fr-390-incomplete-offer');await capture(page,'fr-320-incomplete-offer',320);
  });

  for(const locale of ['fr','en'] as const)test(`${locale} · pack partiellement acquis sans réduction, parcours détenu à reprendre`,async({page,context})=>{
    const t=getCommerceDictionary(locale),single=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]),pack=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr,sources.second.fr],2599);
    const account=await methodLearner(context.request,locale);await loginMethodAccount(context.request,account);
    const course=sources.learning.course.fr.value;
    commerceSql(`INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at) VALUES(gen_random_uuid(),'${checkedUuid(account.id)}','${checkedUuid(course.resourceId)}','${checkedUuid(course.versionId)}','MANUAL_TEST',gen_random_uuid(),'["fr","en"]'::jsonb,'PINNED',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day');`);
    const coverage=await context.request.get(`/api/v1/me/offers/${pack.value.id}/purchase-context?locale=${locale}`);expect(coverage.status()).toBe(200);const value=await coverage.json() as PurchaseContext;expect(value.coverage.status).toBe('PARTIAL');expect(value.coverage.alreadyAccessibleCount).toBe(1);expect(value.offer.price?.amountMinor).toBe(2599);
    await page.goto(offersPath(locale,pack.value.id));await expect(page.getByText(t.partiallyAccessible,{exact:true})).toBeVisible();await capture(page,`${locale}-390-partial-bundle`);
    await page.goto(offersPath(locale,single.value.id));await expect(page.getByText(t.alreadyAccessible,{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:t.resume,exact:true}).first()).toBeVisible();await expect(page.getByRole('button',{name:t.prepare,exact:true})).toHaveCount(0);await capture(page,`${locale}-390-already-accessible`);
  });

  test('fr · service indisponible distingué de zéro offre et reprise réelle',async({page})=>{
    const t=getCommerceDictionary('fr');await controlApi('stop-api');
    try{await page.goto(offersPath('fr'));await expect(page.getByText(t.unavailable,{exact:true})).toBeVisible();await expect(page.getByText(t.noOffers,{exact:true})).toHaveCount(0);await capture(page,'fr-1440-offers-api-unavailable',1440);}
    finally{await controlApi('start-api');}
    await page.goto(offersPath('fr'));await expect(page.locator('[data-offer-id]').first()).toBeVisible();await capture(page,'fr-390-offers-recovered');
  });
});
