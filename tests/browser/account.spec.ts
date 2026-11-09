import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { ActivityNoteView, AssetDownloadAccess, AttestationView, DataRequestPage, NotificationPage, SupportMessagePage, SupportTicketPage, SupportTicketView } from '../../apps/web/src/lib/api/generated/types.gen';
import { accountPath, attestationsPath, dataRequestsPath, helpHref, helpPath } from '../../apps/web/src/lib/account/routes';
import { ordersPath } from '../../apps/web/src/lib/commerce/routes';
import { getAccountDictionary, getAccountStateDictionary } from '../../apps/web/src/lib/i18n/account';
import { accountHeaders, captureAccount, createDataRequest, createTicket, eligibility, grantSupportOperator, issue, nameProfile, profile, supportReply, ticket, uploadSupportFile } from './account-fixture';
import { createCommerceSources, createFixtureOffer, prepareOrder, type CommerceSources } from './commerce-fixture';
import { controlApi } from './control';
import { enrollLearning, learningHeaders, submitLearningQuiz } from './learning-fixture';
import { createPersonalMethod, fillMethodLogin, loginMethodAccount, methodFields, methodLearner } from './methods-fixture';
import { createPersonalProject, createProjectFixture, type ProjectFixture } from './projects-fixture';

test.describe('P14 · compte, aide et participation réels sans service financier externe',()=>{
  test.describe.configure({mode:'serial'});
  let editor:APIRequestContext, operator:APIRequestContext, sources:CommerceSources, projects:ProjectFixture, operatorId:string;
  test.beforeAll(async({playwright},info)=>{
    info.setTimeout(180000);editor=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});
    sources=await createCommerceSources(editor);
    const otherEditor=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});
    try{projects=await createProjectFixture(otherEditor);}finally{await otherEditor.dispose();}
    operator=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});
    const account=await methodLearner(operator);operatorId=account.id;grantSupportOperator(account.id);await loginMethodAccount(operator,account);
  });
  test.afterAll(async()=>{await editor?.dispose();await operator?.dispose();});

  for(const locale of ['fr','en'] as const)test(`${locale} · profil révisionné, clavier, préférence et travail dans sa langue`,async({page,context})=>{
    const t=getAccountDictionary(locale),account=await methodLearner(context.request,locale);await loginMethodAccount(context.request,account);
    const fields=methodFields('fr');const method=await createPersonalMethod(context.request,account.id,fields);
    const project=await createPersonalProject(context.request,account.id,projects.BR01.fr);
    const activity=sources.learning.activity.fr.value;
    const nr=await context.request.post('/api/v1/me/activity-notes',{headers:await accountHeaders(context.request,account.id),data:{activityId:activity.resourceId,activityVersionId:activity.versionId,locale:'fr',text:'Note synthétique française P14 conservée.'}});expect(nr.status()).toBe(201);const note=await nr.json() as ActivityNoteView;
    await page.goto(accountPath(locale));const input=page.getByRole('textbox',{name:t.displayName,exact:true});await expect(input).toBeEnabled();await input.focus();await expect(input).toBeFocused();
    const name=`P14 · Élodie ${locale}`;await input.fill(name);await page.getByRole('button',{name:t.saveProfile,exact:true}).click();
    await expect.poll(async()=>(await profile(context.request)).value.displayName).toBe(name);
    await expect(page.locator('[data-account-profile]').getByText(t.saved,{exact:true})).toBeVisible();
    await captureAccount(page,`${locale}-1440-profile`,1440);await captureAccount(page,`${locale}-320-profile`,320);
    const selected=locale==='fr'?'en':'fr';await page.getByRole('combobox',{name:t.interfaceLanguage,exact:true}).selectOption(selected);await page.getByRole('button',{name:t.savePreferences,exact:true}).click();
    await expect.poll(async()=>(await(await context.request.get('/api/v1/me/preferences')).json() as {locale:string}).locale).toBe(selected);
    await page.goto(accountPath(selected));await expect(page.getByRole('heading',{name:getAccountDictionary(selected).title,exact:true})).toBeVisible();
    const afterMethod=await context.request.get(`/api/v1/me/methods/${method.id}`),afterProject=await context.request.get(`/api/v1/me/projects/${project.id}`),afterNote=await context.request.get(`/api/v1/me/activity-notes/${note.id}`);
    expect(afterMethod.status()).toBe(200);expect(afterProject.status()).toBe(200);expect(afterNote.status()).toBe(200);
    expect((await afterMethod.json() as {locale:string;text:string}).locale).toBe('fr');expect((await afterProject.json() as {fields:{locale:string}}).fields.locale).toBe('fr');expect((await afterNote.json() as ActivityNoteView).text===note.text).toBe(true);
  });

  for(const locale of ['fr','en'] as const)test(`${locale} · demande d’aide enregistrée et conversation réelle`,async({page,context,playwright})=>{
    const t=getAccountDictionary(locale),account=await methodLearner(context.request,locale);await loginMethodAccount(context.request,account);
    let chosen:Awaited<ReturnType<typeof uploadSupportFile>>|undefined,chosenProject:string|undefined;
    if(locale==='fr'){const project=await createPersonalProject(context.request,account.id,projects.BR01.fr);chosenProject=project.id;const binary=await playwright.request.newContext();try{chosen=await uploadSupportFile(context.request,binary,account.id,project.id);}finally{await binary.dispose();}}
    const source=sources.learning.activity.fr.value,destination=helpHref(locale,chosenProject?{projectId:chosenProject,contextLocale:'fr'}:{resourceId:source.resourceId,versionId:source.versionId,revisionId:source.publishedRevisionId!,contextLocale:'fr'});
    if(locale==='en'){expect((await context.request.post('/api/v1/auth/logout',{headers:await accountHeaders(context.request,account.id)})).status()).toBe(204);await page.goto(destination);await expect(page).toHaveURL(/\/en\/sign-in/);await page.getByRole('link',{name:'Français',exact:true}).click();await expect(page).toHaveURL(/\/fr\/connexion/);await page.getByRole('link',{name:'English',exact:true}).click();await fillMethodLogin(page,'en',account);await expect(page).toHaveURL(/\/en\/account\/help\?/);expect(new URL(page.url()).searchParams.get('contextLocale')).toBe('fr');}
    else await page.goto(destination);
    const subject=`P14 local ${locale} ${randomUUID()}`,form=page.locator('[data-support-create]');await expect(form.getByRole('checkbox',{name:t.includeContext,exact:true})).not.toBeChecked();await form.getByRole('checkbox',{name:t.includeContext,exact:true}).check();
    if(chosen&&chosenProject){await form.getByRole('button',{name:t.chooseAttachment,exact:true}).click();await form.getByRole('combobox',{name:t.chooseProject,exact:true}).selectOption(chosenProject);await form.getByRole('checkbox',{name:new RegExp(chosen.asset.filename.replace('.','\\.'))}).check();await captureAccount(page,'fr-390-support-explicit-selection');}
    await page.getByRole('textbox',{name:t.subject,exact:true}).fill(subject);await page.getByRole('textbox',{name:t.message,exact:true}).fill('Message de recette choisi explicitement ; aucune note jointe.');
    await page.getByRole('button',{name:t.sendRequest,exact:true}).click();
    await expect.poll(async()=>(await(await context.request.get('/api/v1/me/support-tickets')).json() as SupportTicketPage).total).toBe(1);
    await expect(page.getByText(t.requestRecorded,{exact:true})).toBeVisible();
    const own=(await(await context.request.get('/api/v1/me/support-tickets')).json() as SupportTicketPage).items[0];expect(own.state).toBe('OPEN');expect(own.locale).toBe(locale);expect(own.context?.locale).toBe('fr');if(chosenProject)expect(own.context?.projectId).toBe(chosenProject);else expect(own.context).toMatchObject({resourceId:source.resourceId,versionId:source.versionId,revisionId:source.publishedRevisionId,locale:'fr'});
    await page.goto(helpPath(locale,own.id));await expect(page.locator(`[data-support-ticket="${own.id}"]`)).toBeVisible();
    await page.getByRole('textbox',{name:t.message,exact:true}).fill('Précision réellement ajoutée à la conversation de test.');await page.getByRole('button',{name:t.addMessage,exact:true}).click();
    await expect.poll(async()=>(await(await context.request.get(`/api/v1/me/support-tickets/${own.id}/messages`)).json() as SupportMessagePage).total).toBe(2);
    await expect(page.getByText(t.messageRecorded,{exact:true})).toBeVisible();
    await captureAccount(page,`${locale}-390-support-conversation`);await captureAccount(page,`${locale}-1440-support-conversation`,1440);
    const messages=await(await context.request.get(`/api/v1/me/support-tickets/${own.id}/messages`)).json() as SupportMessagePage;expect(messages.items.every(m=>m.authorKind==='USER'&&m.notificationStatus==='NOT_REQUIRED')).toBe(true);expect(messages.items[0].attachments.map(a=>a.assetId)).toEqual(chosen?[chosen.asset.id]:[]);expect(messages.items[1].attachments).toEqual([]);
  });

  test('fr · demande relative aux données conservée, annulation au clavier et aucune suppression',async({page,context})=>{
    const locale='fr',t=getAccountDictionary(locale),account=await methodLearner(context.request);await loginMethodAccount(context.request,account);await nameProfile(context.request,account.id);
    await page.goto(dataRequestsPath(locale));await page.getByRole('combobox',{name:t.requestType,exact:true}).selectOption('ERASURE');await page.getByRole('textbox',{name:t.dataReason,exact:true}).fill('Demande synthétique à instruire après validation de la conservation.');
    await page.locator('[data-data-request-form]').getByRole('button',{name:t.sendRequest,exact:true}).click();
    await expect.poll(async()=>(await(await context.request.get('/api/v1/me/data-requests')).json() as DataRequestPage).total).toBe(1);
    await expect(page.getByText(t.requestRecorded,{exact:true})).toBeVisible();
    const before=(await(await context.request.get('/api/v1/me/data-requests')).json() as DataRequestPage).items[0];expect(before.state).toBe('WAITING_POLICY');expect(before.processingUnavailableReason).toBe('RETENTION_POLICY_UNCONFIGURED');
    await captureAccount(page,'fr-390-data-waiting-policy');const card=page.locator(`[data-data-request="${before.id}"]`);await card.getByRole('button',{name:t.cancelDataRequest,exact:true}).click();
    const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:t.close,exact:true})).toBeFocused();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    const reason=dialog.getByRole('textbox');if(await reason.count())await reason.fill('Annulation explicite de cette demande de recette uniquement.');
    await captureAccount(page,'fr-320-data-cancel-dialog',320);await dialog.getByRole('button',{name:t.cancelDataRequest,exact:true}).click();
    await expect.poll(async()=>(await(await context.request.get(`/api/v1/me/data-requests/${before.id}`)).json() as {state:string}).state).toBe('CANCELLED');
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(200);expect((await profile(context.request)).value.displayName).not.toBeNull();
    const history=await(await context.request.get(`/api/v1/me/data-requests/${before.id}/events`)).json() as {items:Array<{type:string}>};expect(history.items.map(e=>e.type)).toEqual(['REQUESTED','CANCELLED']);
    await page.goto(dataRequestsPath('en'));await expect(page.locator(`[data-data-request="${before.id}"]`)).toBeVisible();await captureAccount(page,'en-390-data-cancelled');
  });

  for(const locale of ['fr','en'] as const)test(`${locale} · critères serveur, document HTML réel et instantané immuable`,async({page,context})=>{
    const t=getAccountDictionary(locale),account=await methodLearner(context.request,locale);await loginMethodAccount(context.request,account);const oldName=`Élodie P14 ${locale}`;await nameProfile(context.request,account.id,oldName);
    const enrollment=await enrollLearning(context.request,sources.learning,account.id,locale);expect((await eligibility(context.request,enrollment.summary.id,locale)).eligible).toBe(false);
    const activity=sources.learning.activity[locale].value,path=`/api/v1/me/activity-progress/${activity.resourceId}`;
    const before=await context.request.get(`${path}?enrollmentId=${enrollment.summary.id}&activityVersionId=${activity.versionId}`);expect(before.status()).toBe(200);
    expect((await context.request.put(path,{headers:await learningHeaders(context.request,account.id,before.headers().etag),data:{enrollmentId:enrollment.summary.id,activityVersionId:activity.versionId,read:true,completed:false,locale}})).status()).toBe(200);
    expect((await eligibility(context.request,enrollment.summary.id,locale)).eligible).toBe(false);await submitLearningQuiz(context.request,sources.learning,enrollment.summary.id,account.id,locale);
    await page.goto(`${attestationsPath(locale)}?enrollmentId=${enrollment.summary.id}`);await page.getByRole('button',{name:t.checkEligibility,exact:true}).click();await expect(page.locator('[data-attestation-eligibility]')).toBeVisible();
    await captureAccount(page,`${locale}-390-attestation-criteria`);await page.getByRole('button',{name:t.issue,exact:true}).click();const confirmation=page.getByRole('alertdialog');await expect(confirmation.getByRole('button',{name:t.cancel,exact:true})).toBeFocused();const created=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/enrollments/${enrollment.summary.id}/attestations`));await confirmation.getByRole('button',{name:t.issue,exact:true}).click();
    const response=await created;expect(response.status()).toBe(201);const issued=await response.json() as AttestationView;expect(issued.evidence.humanReview).toBe(false);expect(issued.evidence.identityVerified).toBe(false);expect(issued.evidence.quizzes.length).toBe(1);expect(issued.evidence.selfAssessments.length).toBe(0);await expect(page.getByText(t.issued,{exact:true})).toBeVisible();
    await page.goto(attestationsPath(locale,issued.summary.id));await expect(page.getByText(t.noHumanReview,{exact:true})).toBeVisible();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:t.downloadAttestation,exact:true}).click();const saved=await download;expect(saved.suggestedFilename()).toBe(issued.summary.document.filename);const file=await saved.path();expect(file!==null).toBe(true);const bytes=await readFile(file!);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(issued.summary.document.sha256);expect(bytes.length).toBe(issued.summary.document.sizeBytes);expect(bytes.toString('utf8').includes(oldName)).toBe(true);expect(/<script\b|https?:\/\//i.test(bytes.toString('utf8'))).toBe(false);
    const replay=await issue(context.request,account.id,enrollment.summary.id,locale);expect(replay.summary.id).toBe(issued.summary.id);await nameProfile(context.request,account.id,'Autre nom déclaré ultérieurement');const actual=await context.request.get(`/api/v1/me/attestations/${issued.summary.id}/document`);expect(actual.status()).toBe(200);expect((await actual.body()).equals(bytes)).toBe(true);
    await captureAccount(page,`${locale}-1440-attestation-snapshot`,1440);await captureAccount(page,`${locale}-320-attestation-snapshot`,320);
    const artifact=join(process.env.COURSES_BROWSER_LOGS!,`attestation-${issued.summary.id}.html`);await writeFile(artifact,bytes,{flag:'wx'});const preview=await context.newPage();
    try{await preview.goto(pathToFileURL(artifact).href);await expect(preview.getByRole('heading',{level:1})).toBeVisible();await expect(preview.getByText(oldName,{exact:true})).toBeVisible();await captureAccount(preview,`${locale}-1440-actual-html-document`,1440);}finally{await preview.close();}
  });

  test('propriété · commandes, demandes, pièces choisies et attestations d’autrui refusées',async({context,playwright,page})=>{
    const account=await methodLearner(context.request);await loginMethodAccount(context.request,account);await nameProfile(context.request,account.id);
    const project=await createPersonalProject(context.request,account.id,projects.BR01.fr);const binary=await playwright.request.newContext();
    const other=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});
    try{
      const chosen=await uploadSupportFile(context.request,binary,account.id,project.id),unselected=await uploadSupportFile(context.request,binary,account.id,project.id,'p14-unselected.txt');
      const own=await createTicket(context.request,account.id,{attachmentIds:[chosen.asset.id]});const data=await createDataRequest(context.request,account.id);
      const enrollment=await enrollLearning(context.request,sources.learning,account.id);await submitLearningQuiz(context.request,sources.learning,enrollment.summary.id,account.id);const attestation=await issue(context.request,account.id,enrollment.summary.id);
      const offer=await createFixtureOffer(editor,sources.actor,[sources.learning.course.fr]);const order=await prepareOrder(context.request,account.id,offer.value,'fr');
      const docs=await context.request.get(`/api/v1/me/orders/${order.value.id}/documents`);expect(docs.status()).toBe(200);expect(await docs.json()).toMatchObject({state:'NONE_AVAILABLE',documents:[],unavailableReason:'NO_VERIFIED_COMMERCIAL_DOCUMENT'});
      await page.goto(ordersPath('fr',order.value.id));await expect(page.getByText(getAccountDictionary('fr').noDocuments,{exact:true})).toBeVisible();await captureAccount(page,'fr-390-order-documents-unavailable');
      const stranger=await methodLearner(other);await loginMethodAccount(other,stranger);
      for(const route of [`/me/orders/${order.value.id}`,`/me/orders/${order.value.id}/documents`,`/me/support-tickets/${own.id}`,`/me/support-tickets/${own.id}/messages`,`/me/support-tickets/${own.id}/events`,`/me/data-requests/${data.id}`,`/me/data-requests/${data.id}/events`,`/me/attestations/${attestation.summary.id}`,`/me/attestations/${attestation.summary.id}/document`,`/me/enrollments/${enrollment.summary.id}/attestation-eligibility?locale=fr`])expect((await other.get('/api/v1'+route)).status()).toBe(404);
      const selectedPath=`/api/v1/admin/support-tickets/${own.id}/attachments/`;
      const allowed=await operator.post(selectedPath+chosen.asset.id+'/download-access',{headers:await accountHeaders(operator,operatorId)});expect(allowed.status()).toBe(200);const access=await allowed.json() as AssetDownloadAccess;let same=false;try{const object=await binary.get(access.url);same=object.status()===200&&(await object.body()).equals(chosen.bytes);}catch{throw new Error('Selected S3 download failed; signed URL omitted.');}expect(same).toBe(true);
      expect((await operator.post(selectedPath+unselected.asset.id+'/download-access',{headers:await accountHeaders(operator,operatorId)})).status()).toBe(404);
      expect((await other.post(`/api/v1/me/support-tickets/${own.id}/attachments/${chosen.asset.id}/download-access`,{headers:await accountHeaders(other,stranger.id)})).status()).toBe(404);
    }finally{await binary.dispose();await other.dispose();}
  });

  test('ancien compte et conflit de révision · aucune réussite ni écrasement de la saisie',async({page,context,playwright})=>{
    const t=getAccountDictionary('fr'),a=await methodLearner(context.request);await loginMethodAccount(context.request,a);await nameProfile(context.request,a.id,'Avant ouverture');await page.goto(accountPath('fr'));const field=page.getByRole('textbox',{name:t.displayName,exact:true});await expect(field).toBeEnabled();await field.fill('Saisie locale conservée');
    await nameProfile(context.request,a.id,'Modification concurrente');const rejected=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/me/profile'));await page.getByRole('button',{name:t.saveProfile,exact:true}).click();expect((await rejected).status()).toBe(412);await expect(field).toHaveValue('Saisie locale conservée');await captureAccount(page,'fr-390-profile-revision-conflict');
    const temp=await playwright.request.newContext({baseURL:process.env.COURSES_BROWSER_ORIGIN});let b;
    try{b=await methodLearner(temp);}finally{await temp.dispose();}
    expect((await context.request.post('/api/v1/auth/logout',{headers:await accountHeaders(context.request,a.id)})).status()).toBe(204);await loginMethodAccount(context.request,b);
    const changed=await context.request.patch('/api/v1/me/profile',{headers:await accountHeaders(context.request,a.id,(await profile(context.request)).etag),data:{displayName:'Ancien formulaire'}});expect(changed.status()).toBe(409);expect((await profile(context.request)).value.displayName).toBeNull();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('chatgpt-courses-account-event',{detail:{kind:'signed-in',nonce:crypto.randomUUID()}})));await expect(page.getByText(t.accountChanged,{exact:true})).toBeVisible();await expect(field).toHaveValue('Saisie locale conservée');await captureAccount(page,'fr-320-profile-account-changed',320);
  });

  test('SMTP interrompu · réponse persistée, incident réel puis Mailpit local sans destinataire externe',async({page,context})=>{
    test.setTimeout(160000);const account=await methodLearner(context.request);await loginMethodAccount(context.request,account);const own=await createTicket(context.request,account.id);
    try{
      await controlApi('pause-mailpit');await supportReply(operator,operatorId,own.id);
      await expect.poll(async()=>{const r=await context.request.get(`/api/v1/me/support-tickets/${own.id}/messages`);const p=await r.json() as SupportMessagePage;return p.items.find(m=>m.authorKind==='SUPPORT')?.notificationStatus;},{timeout:45000,intervals:[250,500,1000]}).toBe('ISSUE');
      expect((await ticket(context.request,own.id)).value.state).toBe('WAITING_FOR_USER');await page.goto(helpPath('fr',own.id));await expect(page.locator(`[data-support-ticket="${own.id}"]`)).toBeVisible();await captureAccount(page,'fr-390-support-email-issue');
    }finally{await controlApi('resume-mailpit');}
    const notifications=await(await operator.get('/api/v1/admin/notifications?page=0&pageSize=100')).json() as NotificationPage;const item=notifications.items.find(n=>n.type==='SUPPORT_REPLY'&&n.status==='INDETERMINATE');expect(item!==undefined).toBe(true);
    expect((await operator.post(`/api/v1/admin/notifications/${item!.id}/retry`,{headers:await accountHeaders(operator,operatorId),data:{reason:'CONFIGURATION_FIXED',ackDuplicate:true}})).status()).toBe(200);
    await expect.poll(async()=>{const p=await(await context.request.get(`/api/v1/me/support-tickets/${own.id}/messages`)).json() as SupportMessagePage;return p.items.find(m=>m.authorKind==='SUPPORT')?.notificationStatus;},{timeout:30000}).toBe('SENT');
    const mailOrigin=process.env.COURSES_MAILPIT_ORIGIN!;expect(new URL(mailOrigin).hostname).toBe('127.0.0.1');const mail=await fetch(`${mailOrigin}/api/v1/search?query=${encodeURIComponent('to:'+account.email)}`);const messages=await mail.json() as {messages:Array<{Subject:string}>};expect(messages.messages.some(m=>/aide|support|assistance/i.test(m.Subject))).toBe(true);
    await page.reload();await expect(page.getByText(getAccountStateDictionary('fr').notification.SENT,{exact:true})).toBeVisible();await expect(page.getByText('Réponse de recette réellement enregistrée par le compte opérateur de test.',{exact:true})).toBeVisible();await captureAccount(page,'fr-390-support-email-sent');
  });

  test('réponse retardée · une saisie plus récente ne reçoit aucun faux acquittement',async({page,context})=>{
    const t=getAccountDictionary('fr'),account=await methodLearner(context.request);await loginMethodAccount(context.request,account);
    for(const section of ['support','data'] as const){
      const endpoint=section==='support'?'/api/v1/me/support-tickets':'/api/v1/me/data-requests',pattern=`**${endpoint}`;
      let entered!:()=>void,release!:()=>void;const received=new Promise<void>(resolve=>{entered=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});let writes=0,serverStatus=0;
      await page.route(pattern,async route=>{if(route.request().method()!=='POST')return route.continue();writes++;const response=await route.fetch();serverStatus=response.status();entered();await hold;await route.fulfill({response});});
      try{
        await page.goto(section==='support'?helpPath('fr'):dataRequestsPath('fr'));
        if(section==='support')await page.getByRole('textbox',{name:t.subject,exact:true}).fill('P14 réponse retardée réelle');
        const field=page.getByRole('textbox',{name:section==='support'?t.message:t.dataReason,exact:true}),form=page.locator(section==='support'?'[data-support-create]':'[data-data-request-form]');
        await field.fill('Version réellement envoyée au serveur.');await form.getByRole('button',{name:t.sendRequest,exact:true}).click();await received;expect(serverStatus).toBe(201);
        await field.fill('Saisie plus récente, encore jamais envoyée.');const acknowledged=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===endpoint);release();expect((await acknowledged).status()).toBe(201);
        await expect(form.getByText(t.unsubmittedChanges,{exact:true})).toBeVisible();await expect(field).toHaveValue('Saisie plus récente, encore jamais envoyée.');expect(await form.getByText(t.requestRecorded,{exact:true}).count()).toBe(0);expect(writes).toBe(1);
        const stored=await(await context.request.get(endpoint)).json() as SupportTicketPage|DataRequestPage;expect(stored.total).toBe(1);
        await captureAccount(page,`fr-390-${section}-late-ack-unsent-text`);
      }finally{release();await page.unroute(pattern);}
    }
  });

  test('panne réelle API · message de demande conservé et aucune création annoncée',async({page,context})=>{
    const t=getAccountDictionary('fr'),account=await methodLearner(context.request);await loginMethodAccount(context.request,account);await page.goto(helpPath('fr'));await page.getByRole('textbox',{name:t.subject,exact:true}).fill('P14 outage local');const field=page.getByRole('textbox',{name:t.message,exact:true});await field.fill('Message non envoyé conservé dans cette page.');
    try{await controlApi('stop-api');await page.getByRole('button',{name:t.sendRequest,exact:true}).click();await expect(field).toHaveValue('Message non envoyé conservé dans cette page.');await expect(page.getByText(t.unavailable,{exact:true})).toBeVisible();expect(await page.getByText(t.requestRecorded,{exact:true}).count()).toBe(0);await captureAccount(page,'fr-390-support-api-unavailable');}
    finally{await controlApi('start-api');}
    expect((await(await context.request.get('/api/v1/me/support-tickets')).json() as SupportTicketPage).total).toBe(0);await expect(field).toHaveValue('Message non envoyé conservé dans cette page.');
  });
});
