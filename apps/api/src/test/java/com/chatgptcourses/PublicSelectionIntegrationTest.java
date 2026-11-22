package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.catalog.service.CatalogTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.catalog.service.PublicRouteService;
import com.chatgptcourses.catalog.service.PublicSelectionService;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.commerce.service.OrderService;
import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.commerce.service.CommerceSettings;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.editorial.service.EditorialMediaRegistry;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.shared.http.*;
import com.chatgptcourses.shared.money.Money;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real PostgreSQL, real Spring filters, and explicit discovery decisions. No provider requests. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","COMMERCE_ENABLED=true","COMMERCE_ALLOWED_CURRENCIES=EUR","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class PublicSelectionIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);}
    @Autowired JdbcTemplate jdbc;@Autowired EditorialService editorial;@Autowired PublicSelectionService selections;
    @Autowired PublicCatalogueService catalogue;@Autowired PublicRouteService routes;@Autowired OfferService offers;@Autowired OrderService orders;@Autowired ObjectMapper mapper;
    @Autowired CommerceAuthorization authorization;@Autowired PaymentGateway gateway;@Autowired ObjectProvider<EditorialMediaRegistry> mediaRegistries;@Autowired PlatformTransactionManager transactions;
    @Value("${local.server.port}") int port;

    @Test void publicationAloneOrRecipeClassificationNeverPromotesCardsFacetsSuggestionsOrSeo() {
        UUID editor=actor("EDITOR");String marker="aud01-"+UUID.randomUUID();var facetsBefore=catalogue.facets("fr");
        var free=publish(editor,create(editor,ResourceKind.GUIDE,"fr","FREE",marker+" ordinary title",List.of(),List.of()));
        var protectedContent=publish(editor,create(editor,ResourceKind.ACTIVITY,"fr","PROTECTED",marker+" protected title",List.of(),List.of()));
        var en=translate(editor,free);classify(editor,free,"RECIPE",false);classify(editor,en,"RECIPE",false);
        assertThat(catalogue.search(query(marker,"fr",null)).items()).isEmpty();assertThat(catalogue.search(query(marker,"en",null)).items()).isEmpty();
        assertThat(catalogue.facets("fr")).isEqualTo(facetsBefore);
        assertThat(routes.publications("fr",0,100).items()).noneMatch(p->p.resourceId().equals(free.resourceId()));
        assertThat(catalogue.detail(free.resourceId(),"fr").document()).isNotNull();assertThat(catalogue.bySlug(ResourceKind.GUIDE,free.slug(),"fr").resourceId()).isEqualTo(free.resourceId());
        assertThat(catalogue.version(protectedContent.resourceId(),protectedContent.versionId(),"fr").document()).isNull();
        var approved=publish(editor,create(editor,ResourceKind.ACTIVITY,"fr","FREE",marker+" approved activity",List.of(),List.of(free.resourceId())));
        classify(editor,approved,"EDITORIAL",true);
        assertThat(catalogue.search(query(marker,"fr","FREE")).items()).extracting(ResourceCard::resourceId).containsExactly(approved.resourceId());
        assertThat(catalogue.search(query(marker,"fr","PROTECTED")).items()).isEmpty();assertThat(catalogue.detail(approved.resourceId(),"fr").related()).isEmpty();
        classify(editor,protectedContent,"EDITORIAL",true);
        assertThat(catalogue.search(query(marker,"fr","PROTECTED")).items()).extracting(ResourceCard::resourceId).containsExactly(protectedContent.resourceId());
    }

    @Test void exactPublishedRevisionApprovalDoesNotTransferToAChangedPublicationAndDecisionsAreAppendOnly() {
        UUID editor=actor("EDITOR");var v=publish(editor,create(editor,ResourceKind.GUIDE,"fr","FREE","Approved then revised "+UUID.randomUUID(),List.of(),List.of()));
        var empty=selections.content(editor,v.id());assertThat(empty.provenance()).isEqualTo("UNREVIEWED");assertThat(empty.selectionRevision()).isZero();
        var approved=classify(editor,v,"EDITORIAL",true);var oldTag=PublicSelectionService.tag("content-selection",approved);
        expect(ApiError.REVISION_CONFLICT,()->selections.selectContent(editor,editor,v.id(),PublicSelectionService.tag("content-selection",empty),change(v,"EDITORIAL",false)));
        expect(ApiError.VALIDATION_FAILED,()->selections.selectContent(editor,editor,v.id(),oldTag,change(v,"RECIPE",true)));
        var hidden=selections.selectContent(editor,editor,v.id(),oldTag,change(v,"EDITORIAL",false));assertThat(hidden.selectionRevision()).isEqualTo(2);
        assertThat(catchThrowable(()->jdbc.update("UPDATE editorial_public_selections SET reason='Rewrite history' WHERE revision_id=?",v.publishedRevisionId()))).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM editorial_public_selections WHERE revision_id=?",v.publishedRevisionId()))).isInstanceOf(DataIntegrityViolationException.class);
        var current=editorial.get(editor,v.id());var revised=editorial.revise(editor,current.id(),tag(current),new SaveRevision(current.title(),"New reviewed summary",current.document(),"Explicit new publication"));
        var published=publish(editor,revised);assertThat(published.publishedRevisionId()).isNotEqualTo(v.publishedRevisionId());
        assertThat(selections.content(editor,published.id()).provenance()).isEqualTo("UNREVIEWED");
        expect(ApiError.REVISION_CONFLICT,()->selections.selectContent(editor,editor,published.id(),PublicSelectionService.tag("content-selection",hidden),change(v,"EDITORIAL",true)));
        assertThat(catalogue.search(query(published.title(),"fr",null)).items()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_public_selections WHERE revision_id=?",Integer.class,v.publishedRevisionId())).isEqualTo(2);
    }

    @Test void parentCoursesAndOffersRequireApprovedExactChildrenAndEveryIncludedLanguageWithoutChangingOrders() {
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER"),owner=actor("LEARNER");
        var activity=publish(editor,create(editor,ResourceKind.ACTIVITY,"fr","PROTECTED","Activity "+UUID.randomUUID(),List.of(),List.of()));var activityEn=translate(editor,activity);
        var module=publish(editor,create(editor,ResourceKind.MODULE,"fr","PROTECTED","Module "+UUID.randomUUID(),List.of(activity.versionId()),List.of()));var moduleEn=translate(editor,module);
        var course=publish(editor,create(editor,ResourceKind.COURSE,"fr","PROTECTED","Course "+UUID.randomUUID(),List.of(module.versionId()),List.of()));var courseEn=translate(editor,course);
        expect(ApiError.CONTENT_NOT_READY,()->classify(editor,course,"EDITORIAL",true));classify(editor,activity,"RECIPE",false);
        expect(ApiError.CONTENT_NOT_READY,()->classify(editor,module,"EDITORIAL",true));classify(editor,activity,"EDITORIAL",true);classify(editor,module,"EDITORIAL",true);classify(editor,course,"EDITORIAL",true);
        var fields=fields(course,List.of("fr","en"));var draft=offers.create(merchant,merchant,new CreateOffer("aud01-"+UUID.randomUUID(),"COURSE",fields,"Isolated synthetic offer"));
        var offer=offers.activate(merchant,merchant,draft.id(),EntityTags.forRevision("offer",draft.id(),draft.revision()),new ChangeOfferState("Explicit isolated activation"));
        assertThat(offers.listPublic(new OfferQuery(offer.code(),null,null,"fr",0,20)).items()).isEmpty();
        var selection=selections.offer(merchant,offer.id());var command=new PublicSelectionService.ChangeSelection(offer.currentRevisionId(),"EDITORIAL",true,"Approve exact isolated revision");
        expect(ApiError.OFFER_NOT_READY,()->selections.selectOffer(merchant,merchant,offer.id(),PublicSelectionService.tag("offer-selection",selection),command));
        classify(editor,activityEn,"EDITORIAL",true);classify(editor,moduleEn,"EDITORIAL",true);classify(editor,courseEn,"EDITORIAL",true);
        selections.selectOffer(merchant,merchant,offer.id(),PublicSelectionService.tag("offer-selection",selection),command);
        assertThat(offers.listPublic(new OfferQuery(offer.code(),null,null,"fr",0,20)).items()).hasSize(1);assertThat(offers.listPublic(new OfferQuery(offer.code(),null,null,"en",0,20)).items()).hasSize(1);
        var order=orders.create(owner,owner,UUID.randomUUID().toString(),new CreateOrder(offer.id(),offer.revision(),"fr",fields.conditions().termsVersion())).value();
        var before=businessRows();classify(editor,activity,"RECIPE",false);
        assertThat(catalogue.search(query(course.title(),"fr",null)).items()).isEmpty();assertThat(offers.listPublic(new OfferQuery(offer.code(),null,null,"fr",0,20)).items()).isEmpty();
        assertThat(offers.publicOffer(offer.id(),"fr").id()).isEqualTo(offer.id());assertThat(offers.lockForOrder(offer.id(),offer.revision(),"fr").id()).isEqualTo(offer.id());
        assertThat(orders.get(owner,order.id()).snapshot()).isEqualTo(order.snapshot());assertThat(businessRows()).isEqualTo(before);
        var changed=offers.save(merchant,merchant,offer.id(),EntityTags.forRevision("offer",offer.id(),offer.revision()),new SaveOffer(fields,"New immutable offer revision"));
        assertThat(selections.offer(merchant,offer.id()).selectionRevision()).isZero();
        expect(ApiError.REVISION_CONFLICT,()->selections.selectOffer(merchant,merchant,offer.id(),PublicSelectionService.tag("offer-selection",selection),command));
        assertThat(changed.currentRevisionId()).isNotEqualTo(offer.currentRevisionId());
    }

    @Test void concurrentSelectionsHaveOneWinnerAndNoLostDecision() throws Exception {
        UUID first=actor("EDITOR"),second=actor("EDITOR");var content=publish(first,create(first,ResourceKind.GUIDE,"fr","FREE","Concurrent "+UUID.randomUUID(),List.of(),List.of()));
        String etag=PublicSelectionService.tag("content-selection",selections.content(first,content.id()));var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->{gate.await();return attempt(()->selections.selectContent(first,first,content.id(),etag,change(content,"EDITORIAL",true)));});
            var b=pool.submit(()->{gate.await();return attempt(()->selections.selectContent(second,second,content.id(),etag,change(content,"RECIPE",false)));});gate.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        assertThat(selections.content(first,content.id()).selectionRevision()).isEqualTo(1);
    }

    @Test void discoveryApprovalReusesCommercialFieldReadinessWithoutEnablingCommerceOrCheckout() {
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER");
        var activity=publish(editor,create(editor,ResourceKind.ACTIVITY,"fr","PROTECTED","Disabled commerce activity "+UUID.randomUUID(),List.of(),List.of()));classify(editor,activity,"EDITORIAL",true);
        var module=publish(editor,create(editor,ResourceKind.MODULE,"fr","PROTECTED","Disabled commerce module "+UUID.randomUUID(),List.of(activity.versionId()),List.of()));classify(editor,module,"EDITORIAL",true);
        var course=publish(editor,create(editor,ResourceKind.COURSE,"fr","PROTECTED","Disabled commerce course "+UUID.randomUUID(),List.of(module.versionId()),List.of()));classify(editor,course,"EDITORIAL",true);
        var complete=fields(course,List.of("fr"));var draft=offers.create(merchant,merchant,new CreateOffer("aud01-disabled-"+UUID.randomUUID(),"COURSE",complete,"Explicit isolated complete revision"));
        var active=offers.activate(merchant,merchant,draft.id(),EntityTags.forRevision("offer",draft.id(),draft.revision()),new ChangeOfferState("Isolated setup while commerce enabled"));
        var disabledOffers=new OfferService(jdbc,mapper,authorization,new CommerceSettings(false,Set.of("EUR"),Duration.ofMinutes(30)),gateway,mediaRegistries.orderedStream().toList());
        var disabledSelections=new PublicSelectionService(jdbc,authorization,disabledOffers);var transaction=new TransactionTemplate(transactions);
        var operationalState=disabledOffers.publicOffer(active.id(),"fr").readiness();assertThat(operationalState.checkoutAvailable()).isFalse();assertThat(operationalState.blockingIssues()).extracting(CommerceIssue::code).containsExactly("COMMERCE_NOT_CONFIGURED");
        var current=disabledSelections.offer(merchant,active.id());
        var selected=transaction.execute(status->disabledSelections.selectOffer(merchant,merchant,active.id(),PublicSelectionService.tag("offer-selection",current),new PublicSelectionService.ChangeSelection(active.currentRevisionId(),"EDITORIAL",true,"Review fields while commerce stays disabled")));
        assertThat(selected.approved()).isTrue();assertThat(disabledOffers.publicOffer(active.id(),"fr").readiness().checkoutAvailable()).isFalse();
        var missingPrice=new OfferFields(complete.copies(),complete.resources(),complete.locales(),null,complete.tax(),complete.conditions());
        var incomplete=offers.save(merchant,merchant,active.id(),EntityTags.forRevision("offer",active.id(),active.revision()),new SaveOffer(missingPrice,"Remove price in isolated draft preparation"));
        var empty=disabledSelections.offer(merchant,incomplete.id());
        expect(ApiError.OFFER_NOT_READY,()->transaction.execute(status->disabledSelections.selectOffer(merchant,merchant,incomplete.id(),PublicSelectionService.tag("offer-selection",empty),new PublicSelectionService.ChangeSelection(incomplete.currentRevisionId(),"EDITORIAL",true,"Incomplete revision must not be approved"))));
        assertThat(disabledSelections.offer(merchant,incomplete.id()).selectionRevision()).isZero();
        var recipe=transaction.execute(status->disabledSelections.selectOffer(merchant,merchant,incomplete.id(),PublicSelectionService.tag("offer-selection",empty),new PublicSelectionService.ChangeSelection(incomplete.currentRevisionId(),"RECIPE",false,"Classify incomplete recipe without approval")));
        assertThat(recipe.approved()).isFalse();
        var missingTerms=new OfferFields(complete.copies(),complete.resources(),complete.locales(),complete.price(),complete.tax(),null);
        var terms=offers.save(merchant,merchant,incomplete.id(),EntityTags.forRevision("offer",incomplete.id(),incomplete.revision()),new SaveOffer(missingTerms,"Remove conditions in isolated preparation"));var unreviewed=disabledSelections.offer(merchant,terms.id());
        expect(ApiError.OFFER_NOT_READY,()->transaction.execute(status->disabledSelections.selectOffer(merchant,merchant,terms.id(),PublicSelectionService.tag("offer-selection",unreviewed),new PublicSelectionService.ChangeSelection(terms.currentRevisionId(),"EDITORIAL",true,"Missing conditions must not be approved"))));
        assertThat(disabledSelections.offer(merchant,terms.id()).selectionRevision()).isZero();
    }

    @Test void incompleteInactiveOfferLocalesDoNotCrashOrEnterTheOrdinaryList() {
        UUID actor=actor("COMMERCE_MANAGER");
        for(String fields:List.of("{}","{\"locales\":null}","{\"locales\":{}}")){
            UUID product=UUID.randomUUID(),offer=UUID.randomUUID(),revision=UUID.randomUUID();String code="aud01-incomplete-"+UUID.randomUUID();
            jdbc.update("INSERT INTO products(id,code,kind) VALUES(?,?,'COURSE')",product,code);
            jdbc.update("INSERT INTO offers(id,product_id,state) VALUES(?,?,'INACTIVE')",offer,product);
            jdbc.update("INSERT INTO offer_revisions(id,offer_id,revision_number,fields_json,author_id,reason) VALUES(?,?,1,?::jsonb,?,'Synthetic incomplete legacy revision')",revision,offer,fields,actor);
            jdbc.update("UPDATE offers SET current_revision_id=?,revision=revision+1 WHERE id=?",revision,offer);
            assertThat(offers.listPublic(new OfferQuery(code,null,null,"fr",0,20)).items()).isEmpty();
        }
    }

    @Test void realHttpRequiresPermissionCsrfAccountContextExplicitRevisionAndFreshSelectionEtag() throws Exception {
        var editor=account("EDITOR");var learner=account("LEARNER");var content=publish(editor.id(),create(editor.id(),ResourceKind.GUIDE,"fr","FREE","HTTP "+UUID.randomUUID(),List.of(),List.of()));
        String path="/api/v1/admin/contents/"+content.id()+"/public-selection";assertThat(get(browser(null),path).statusCode()).isEqualTo(401);assertThat(get(learner,path).statusCode()).isEqualTo(403);
        var initial=get(editor,path);assertThat(initial.statusCode()).isEqualTo(200);assertThat(tree(initial).path("provenance").asText()).isEqualTo("UNREVIEWED");assertThat(initial.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        var body=Map.of("revisionId",content.publishedRevisionId(),"provenance","EDITORIAL","approved",true,"reason","Explicit HTTP decision");String etag=initial.headers().firstValue("ETag").orElseThrow();
        assertThat(put(editor,path,body,null,etag,editor.id()).statusCode()).isEqualTo(403);
        assertThat(put(learner,path,body,csrf(learner),etag,learner.id()).statusCode()).isEqualTo(403);
        assertThat(put(editor,path,body,csrf(editor),etag,null).statusCode()).isEqualTo(428);
        assertThat(put(editor,path,body,csrf(editor),etag,learner.id()).statusCode()).isEqualTo(409);
        assertThat(put(editor,path,body,csrf(editor),null,editor.id()).statusCode()).isEqualTo(428);
        var approved=put(editor,path,body,csrf(editor),etag,editor.id());assertThat(approved.statusCode()).isEqualTo(200);
        assertThat(put(editor,path,body,csrf(editor),etag,editor.id()).statusCode()).isEqualTo(412);
        var forged=new LinkedHashMap<String,Object>(body);forged.put("revisionId",UUID.randomUUID());
        assertThat(put(editor,path,forged,csrf(editor),approved.headers().firstValue("ETag").orElseThrow(),editor.id()).statusCode()).isEqualTo(412);
    }

    @Test void offerSelectionHttpUsesCommercePermissionsAndItsOwnCurrentRevisionEtag() throws Exception {
        var editor=account("EDITOR");var merchant=account("COMMERCE_MANAGER");
        var activity=publish(editor.id(),create(editor.id(),ResourceKind.ACTIVITY,"fr","PROTECTED","Offer HTTP activity "+UUID.randomUUID(),List.of(),List.of()));classify(editor.id(),activity,"EDITORIAL",true);
        var module=publish(editor.id(),create(editor.id(),ResourceKind.MODULE,"fr","PROTECTED","Offer HTTP module "+UUID.randomUUID(),List.of(activity.versionId()),List.of()));classify(editor.id(),module,"EDITORIAL",true);
        var course=publish(editor.id(),create(editor.id(),ResourceKind.COURSE,"fr","PROTECTED","Offer HTTP course "+UUID.randomUUID(),List.of(module.versionId()),List.of()));classify(editor.id(),course,"EDITORIAL",true);
        var draft=offers.create(merchant.id(),merchant.id(),new CreateOffer("aud01-http-"+UUID.randomUUID(),"COURSE",fields(course,List.of("fr")),"Explicit isolated offer"));
        var offer=offers.activate(merchant.id(),merchant.id(),draft.id(),EntityTags.forRevision("offer",draft.id(),draft.revision()),new ChangeOfferState("Activate isolated offer"));
        String path="/api/v1/admin/offers/"+offer.id()+"/public-selection";assertThat(get(browser(null),path).statusCode()).isEqualTo(401);assertThat(get(editor,path).statusCode()).isEqualTo(403);
        var current=get(merchant,path);assertThat(current.statusCode()).isEqualTo(200);assertThat(tree(current).path("approved").asBoolean()).isFalse();String tag=current.headers().firstValue("ETag").orElseThrow();
        var body=Map.of("revisionId",offer.currentRevisionId(),"provenance","EDITORIAL","approved",true,"reason","Explicit current offer approval");
        assertThat(put(editor,path,body,csrf(editor),tag,editor.id()).statusCode()).isEqualTo(403);
        assertThat(put(merchant,path,body,null,tag,merchant.id()).statusCode()).isEqualTo(403);
        assertThat(put(merchant,path,body,csrf(merchant),tag,null).statusCode()).isEqualTo(428);
        assertThat(put(merchant,path,body,csrf(merchant),null,merchant.id()).statusCode()).isEqualTo(428);
        var approved=put(merchant,path,body,csrf(merchant),tag,merchant.id());assertThat(approved.statusCode()).isEqualTo(200);
        assertThat(put(merchant,path,body,csrf(merchant),tag,merchant.id()).statusCode()).isEqualTo(412);
        var invalid=new LinkedHashMap<String,Object>(body);invalid.put("provenance","RECIPE");
        assertThat(put(merchant,path,invalid,csrf(merchant),approved.headers().firstValue("ETag").orElseThrow(),merchant.id()).statusCode()).isEqualTo(400);
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM offer_public_selections WHERE revision_id=?",offer.currentRevisionId()))).isInstanceOf(DataIntegrityViolationException.class);
    }

    private ContentView create(UUID actor,ResourceKind kind,String locale,String access,String title,List<UUID> children,List<UUID> related){return editorial.create(actor,new CreateContent(kind,locale,"aud01-"+UUID.randomUUID(),title,"Synthetic isolated metadata","Observable task","Declared evaluation",document(access,related),children,"Explicit unreviewed test publication"));}
    private static ContentDocument document(String access,List<UUID> related){return new ContentDocument("Use supplied facts","A checked result",List.of(),List.of(new ContentBlock("PARAGRAPH","Synthetic teaching body",null)),null,new Exercise("Prepare the result","Private correction"),List.of(),List.of(new RubricCriterion("facts","No invented facts",1,true)),access,List.of(),related);}
    private ContentView publish(UUID actor,ContentView input){var v=editorial.get(actor,input.id());v=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.TO_REVIEW,"Request exact review",null));UUID source=v.sourceTranslationId()==null?null:editorial.get(actor,v.sourceTranslationId()).currentRevisionId();v=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.READY,"Review exact revision",source));return editorial.publish(actor,v.id(),tag(v),new PublishContent(v.currentRevisionId(),"Publish without discovery approval"));}
    private ContentView translate(UUID actor,ContentView fr){var current=editorial.get(actor,fr.id());return publish(actor,editorial.translate(actor,current.id(),tag(current),new CreateTranslation("en","aud01-en-"+UUID.randomUUID(),"Synthetic English "+UUID.randomUUID(),"Equivalent fixture",current.document(),"Explicit translation")));}
    private PublicSelectionService.Selection classify(UUID actor,ContentView view,String provenance,boolean approved){var current=selections.content(actor,view.id());return selections.selectContent(actor,actor,view.id(),PublicSelectionService.tag("content-selection",current),change(view,provenance,approved));}
    private static PublicSelectionService.ChangeSelection change(ContentView view,String provenance,boolean approved){return new PublicSelectionService.ChangeSelection(view.publishedRevisionId(),provenance,approved,"Explicit isolated discovery decision");}
    private static String tag(ContentView value){return EntityTags.forRevision("content",value.id(),value.revision());}
    private static CatalogueQuery query(String marker,String locale,String access){return new CatalogueQuery(marker,null,null,null,locale,access,0,100,"TITLE");}
    private UUID actor(String role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@fixture.invalid");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code=?",id,role);return id;}
    private Map<String,List<String>> businessRows(){var result=new TreeMap<String,List<String>>();for(String table:List.of("orders","order_resources","access_grants","learning_activity_progress","learning_activity_notes","projects","project_revisions","project_self_assessments","checkout_operations","refund_operations"))result.put(table,jdbc.queryForList("SELECT row_to_json(t)::text FROM "+table+" t ORDER BY row_to_json(t)::text",String.class));return result;}
    private static OfferFields fields(ContentView course,List<String> locales){var texts=List.of(new LocalizedText("fr","Synthetic terms"),new LocalizedText("en","Synthetic terms"));return new OfferFields(List.of(new OfferCopy("fr","Synthetic offer","Isolated testing only"),new OfferCopy("en","Synthetic offer","Isolated testing only")),List.of(new OfferResourceInput(course.resourceId(),course.versionId())),locales,new Money(100,"EUR"),new OfferTax("INCLUSIVE",texts),new OfferConditions(new OfferPeriod("FIXED",2),new OfferPeriod("NONE",null),"PINNED",new OfferSupport("NONE",List.of()),false,"aud01-test-terms",texts));}
    private static void expect(ApiError error,Runnable action){var failure=catchThrowable(action::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private static String attempt(Runnable action){try{action.run();return "OK";}catch(ApiException failure){return failure.error().name();}}
    private record Browser(UUID id,HttpClient client) { }
    private static Browser browser(UUID id){return new Browser(id,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build());}
    private Browser account(String role)throws Exception{var client=browser(null);String email=UUID.randomUUID()+"@fixture.invalid",password=UUID.randomUUID()+"-synthetic-password";var register=request(client,"POST","/api/v1/auth/register",Map.of("email",email,"password",password,"locale","fr"),csrf(client),null,null);assertThat(register.statusCode()).isEqualTo(201);UUID id=UUID.fromString(tree(register).path("id").asText());if(!"LEARNER".equals(role))jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code=?",id,role);var login=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf(client)).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(email,StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build();assertThat(client.client().send(login,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);return new Browser(id,client.client());}
    private String csrf(Browser client)throws Exception{return tree(get(client,"/api/v1/auth/csrf")).path("token").asText();}
    private HttpResponse<String> get(Browser client,String path)throws Exception{return client.client().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private HttpResponse<String> put(Browser client,String path,Object body,String csrf,String tag,UUID context)throws Exception{return request(client,"PUT",path,body,csrf,tag,context);}
    private HttpResponse<String> request(Browser client,String method,String path,Object body,String csrf,String tag,UUID context)throws Exception{var builder=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));if(csrf!=null)builder.header("X-CSRF-TOKEN",csrf);if(tag!=null)builder.header("If-Match",tag);if(context!=null)builder.header("X-Account-Context",context.toString());return client.client().send(builder.build(),HttpResponse.BodyHandlers.ofString());}
    private JsonNode tree(HttpResponse<String> response){return mapper.readTree(response.body());}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
}
