package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialMediaRegistry;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.money.Money;
import java.sql.DriverManager;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false","courses.commerce.enabled=true","courses.commerce.allowed-currencies=EUR"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class OfferServiceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);}
    @Autowired OfferService offers;@Autowired EditorialService editorial;@Autowired JdbcTemplate jdbc;@Autowired TestMedia media;
    @TestConfiguration static class MediaConfiguration {@Bean TestMedia testMedia(){return new TestMedia();}}
    /** Explicit provider double: these tests verify fail-closed readiness, not S3 byte validation. */
    static class TestMedia implements EditorialMediaRegistry {
        final ConcurrentHashMap<UUID,Boolean> available=new ConcurrentHashMap<>();
        public boolean ready(UUID r,UUID v,String locale,UUID id,String kind){return Boolean.TRUE.equals(available.get(id));}
    }

    @Test void incompleteConfigurationRemainsReadableButCannotBecomeAnActiveOffer(){
        UUID merchant=actor("COMMERCE_MANAGER");var f=new OfferFields(List.of(new OfferCopy("fr","","")),List.of(),List.of("fr"),null,new OfferTax(null,List.of()),new OfferConditions(new OfferPeriod(null,null),null,null,new OfferSupport(null,List.of()),false,null,List.of()));
        var draft=offers.create(merchant,merchant,new CreateOffer(code(),"COURSE",f,"Explicit incomplete test offer"));
        assertThat(offers.get(merchant,draft.id()).fields()).isEqualTo(f);var readiness=offers.readiness(merchant,draft.id());assertThat(readiness.summaryReady()).isFalse();
        assertThat(readiness.blockingIssues()).extracting(CommerceIssue::code).contains("PRICE_REQUIRED","RESOURCES_REQUIRED","COPY_REQUIRED","ACCESS_REQUIRED","TERMS_REQUIRED","TAX_REQUIRED");
        expect(ApiError.OFFER_NOT_READY,()->offers.activate(merchant,merchant,draft.id(),tag(draft),new ChangeOfferState("Do not activate missing conditions")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->offers.publicOffer(draft.id(),"fr"));
        assertThat(offers.listPublic(new OfferQuery(draft.code(),null,null,"fr",0,10)).items()).isEmpty();
    }

    @Test void aConfiguredProtectedCourseHasPublishedExactLanguageMetadataWithoutAnyPremiumBody(){
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER");var course=course(editor,true,List.of());var offer=active(merchant,fields(List.of(course.fr()),List.of("fr","en"),2500));
        var fr=offers.publicOffer(offer.id(),"fr");var en=offers.publicOffer(offer.id(),"en");
        assertThat(fr.readiness().summaryReady()).isTrue();assertThat(fr.readiness().checkoutAvailable()).isFalse();assertThat(fr.readiness().checkoutUnavailableReason()).isEqualTo("PAYMENT_NOT_CONFIGURED");
        assertThat(fr.resources()).hasSize(1);assertThat(en.resources()).hasSize(1);assertThat(en.resources().getFirst().locale()).isEqualTo("en");assertThat(en.resources().getFirst().versionId()).isEqualTo(course.fr().versionId());
        assertThat(en.resources().getFirst().access()).isEqualTo("PROTECTED");assertThat(en.title()).isEqualTo("DEMO course offer");
        assertThat(fr.price().amountMinor()).isEqualTo(2500);assertThat(fr.price().currency()).isEqualTo("EUR");
        var missing=offers.publicOffer(offer.id(),"en");assertThat(missing.translationAvailable()).isTrue();
        assertThat(offers.listPublic(new OfferQuery(offer.code(),null,"COURSE","fr",0,1)).total()).isEqualTo(1);
    }

    @Test void changingAnOfferPreservesHistoricalFieldsAndRequiresExplicitReactivation(){
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER");var course=course(editor,false,List.of());var first=active(merchant,fields(List.of(course.fr()),List.of("fr"),2500));
        var changed=offers.save(merchant,merchant,first.id(),tag(first),new SaveOffer(fields(List.of(course.fr()),List.of("fr"),4500),"Explicit price correction"));
        assertThat(changed.state()).isEqualTo("INACTIVE");assertThat(changed.revision()).isEqualTo(first.revision()+1);assertThat(changed.currentRevisionId()).isNotEqualTo(first.currentRevisionId());
        assertThat(jdbc.queryForObject("SELECT (fields_json->'price'->>'amountMinor')::bigint FROM offer_revisions WHERE id=?",Long.class,first.currentRevisionId())).isEqualTo(2500);
        assertThat(catchThrowable(()->jdbc.update("UPDATE offer_revisions SET reason='Rewrite past conditions' WHERE id=?",first.currentRevisionId()))).isInstanceOf(DataIntegrityViolationException.class);
        expect(ApiError.OFFER_CHANGED,()->offers.lockForOrder(first.id(),first.revision(),"fr"));expect(ApiError.OFFER_NOT_READY,()->offers.lockForOrder(changed.id(),changed.revision(),"fr"));
        var reactivated=offers.activate(merchant,merchant,changed.id(),tag(changed),new ChangeOfferState("Confirm reviewed new price"));assertThat(reactivated.state()).isEqualTo("ACTIVE");
    }

    @Test void removedChildrenAndStaleTranslationsBlockNewSalesWithoutUpgradingPinnedVersions(){
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER");var fixture=course(editor,true,List.of());var offer=active(merchant,fields(List.of(fixture.fr()),List.of("fr","en"),2500));
        var child=editorial.get(editor,fixture.activity().id());var next=publish(editor,editorial.newVersion(editor,child.id(),contentTag(child),new NewVersion("New task","New evidence","Another activity version","New summary",document("PROTECTED",List.of()),List.of(),"Distinct pedagogical version")));
        assertThat(next.versionId()).isNotEqualTo(fixture.activity().versionId());assertThat(offers.readiness(merchant,offer.id()).summaryReady()).isTrue();
        var current=editorial.get(editor,fixture.activity().id());editorial.revise(editor,current.id(),contentTag(current),new SaveRevision("Editorial correction","Corrected summary",current.document(),"Check English before selling"));
        assertThat(offers.readiness(merchant,offer.id()).blockingIssues()).anySatisfy(i->{assertThat(i.code()).isEqualTo("RESOURCE_UNAVAILABLE");assertThat(i.locale()).isEqualTo("en");});
        var module=editorial.get(editor,fixture.module().id());editorial.archive(editor,module.id(),contentTag(module),new ArchiveContent("Withdraw included module"));
        expect(ApiError.OFFER_NOT_READY,()->offers.lockForOrder(offer.id(),offer.revision(),"fr"));
        assertThat(offers.publicOffer(offer.id(),"fr").resources().getFirst().versionId()).isEqualTo(fixture.fr().versionId());
    }

    @Test void competingOfferEditorsMustRecheckTheLockedRevision()throws Exception {
        UUID merchant=actor("COMMERCE_MANAGER");var before=offers.create(merchant,merchant,new CreateOffer(code(),"COURSE",empty(),"Concurrent draft"));
        expect(ApiError.PRECONDITION_REQUIRED,()->offers.save(merchant,merchant,before.id(),null,new SaveOffer(empty(),"Missing tag")));
        var start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->{start.await();return attempt(()->offers.save(merchant,merchant,before.id(),tag(before),new SaveOffer(empty(),"First revision")));});
            var b=pool.submit(()->{start.await();return attempt(()->offers.save(merchant,merchant,before.id(),tag(before),new SaveOffer(empty(),"Second revision")));});start.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM offer_revisions WHERE offer_id=?",Integer.class,before.id())).isEqualTo(2);assertThat(offers.get(merchant,before.id()).revision()).isEqualTo(before.revision()+1);
    }

    @Test void editorPermissionsAndClientSuppliedAccountContextNeverAuthorizeCommercialMutations(){
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER"),other=actor("LEARNER");
        assertThat(catchThrowable(()->offers.create(editor,editor,new CreateOffer(code(),"COURSE",empty(),"Editor is not a merchant")))).isInstanceOf(AccessDeniedException.class);
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->offers.create(merchant,null,new CreateOffer(code(),"COURSE",empty(),"Expected account missing")));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->offers.create(merchant,other,new CreateOffer(code(),"COURSE",empty(),"Old account draft")));
        var offer=offers.create(merchant,merchant,new CreateOffer(code(),"COURSE",empty(),"Authorized draft"));
        jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,clock_timestamp()),updated_at=greatest(updated_at,clock_timestamp()),revision=revision+1 WHERE user_id=?",merchant);
        assertThat(catchThrowable(()->offers.save(merchant,merchant,offer.id(),tag(offer),new SaveOffer(empty(),"Permission revoked")))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void requiredMediaAndUnsupportedFiscalOrCurrencyConfigurationFailClosed(){
        UUID editor=actor("EDITOR"),merchant=actor("COMMERCE_MANAGER"),file=UUID.randomUUID();media.available.put(file,true);
        var course=course(editor,false,List.of(new MediaReference(file,"FILE",true,"Test provider resource")));var offer=active(merchant,fields(List.of(course.fr()),List.of("fr"),2500));media.available.put(file,false);
        assertThat(offers.readiness(merchant,offer.id()).blockingIssues()).extracting(CommerceIssue::code).contains("MEDIA_UNAVAILABLE");
        var base=fields(List.of(course.fr()),List.of("fr"),2500);var bad=new OfferFields(base.copies(),base.resources(),base.locales(),new Money(2500,"GBP"),new OfferTax("EXCLUSIVE",texts("Explicit test tax notice")),base.conditions());
        var draft=offers.create(merchant,merchant,new CreateOffer(code(),"COURSE",bad,"Unconfigured currency and tax"));
        assertThat(offers.readiness(merchant,draft.id()).blockingIssues()).extracting(CommerceIssue::code).contains("CURRENCY_NOT_CONFIGURED","TAX_NOT_SUPPORTED");
        expect(ApiError.VALIDATION_FAILED,()->offers.save(merchant,merchant,draft.id(),tag(draft),new SaveOffer(new OfferFields(base.copies(),base.resources(),base.locales(),new Money(2500,"JPY"),base.tax(),base.conditions()),"Unsupported currency")));
    }

    @Test void upgradeV011PreservesExistingIdentityAndSessionAndCreatesNoCommercialData()throws Exception {
        String schema="p11_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("CREATE SCHEMA "+schema);Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("011").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())){connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));UUID owner=UUID.randomUUID();String session=UUID.randomUUID().toString();
            isolated.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'existing-test-hash','ACTIVE')",owner,owner+"@example.test");isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(isolated.queryForObject("SELECT password_hash FROM user_accounts WHERE id=?",String.class,owner)).isEqualTo("existing-test-hash");assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);
            for(String table:List.of("products","offers","offer_revisions","offer_revision_resources","offer_events","orders","order_resources","order_idempotency_keys","access_grants"))assertThat(isolated.queryForObject("SELECT count(*) FROM "+table,Integer.class)).isZero();
        }
    }

    private UUID actor(String role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code=?",id,role);return id;}
    private Course course(UUID editor,boolean translated,List<MediaReference> refs){
        var activity=publish(editor,create(editor,ResourceKind.ACTIVITY,List.of(),refs));if(translated)translate(editor,activity);var module=publish(editor,create(editor,ResourceKind.MODULE,List.of(activity.versionId()),List.of()));if(translated)translate(editor,module);var course=publish(editor,create(editor,ResourceKind.COURSE,List.of(module.versionId()),List.of()));var en=translated?translate(editor,course):null;return new Course(course,en,module,activity);
    }
    private ContentView create(UUID actor,ResourceKind kind,List<UUID> children,List<MediaReference> refs){return editorial.create(actor,new CreateContent(kind,"fr","demo-"+UUID.randomUUID(),"DEMO "+kind,"Explicit test content, not a real commercial programme","Declared task","Declared evidence",document("PROTECTED",refs),children,"Isolated commerce test fixture"));}
    private ContentView translate(UUID actor,ContentView fr){var current=editorial.get(actor,fr.id());return publish(actor,editorial.translate(actor,current.id(),contentTag(current),new CreateTranslation("en","demo-en-"+UUID.randomUUID(),"DEMO English content","Test translation",current.document(),"Explicit test translation")));}
    private ContentView publish(UUID actor,ContentView initial){var c=editorial.get(actor,initial.id());if(c.state()==EditorialState.DRAFT||c.state()==EditorialState.STALE)c=editorial.transition(actor,c.id(),contentTag(c),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));UUID source=c.sourceTranslationId()==null?null:editorial.get(actor,c.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(actor,c.id(),contentTag(c),new TransitionContent(EditorialState.READY,"Review exact revision",source));return editorial.publish(actor,ready.id(),contentTag(ready),new PublishContent(ready.currentRevisionId(),"Publish test fixture"));}
    private static ContentDocument document(String access,List<MediaReference> refs){return new ContentDocument("Use only supplied facts","A declared checked result",List.of(),List.of(new ContentBlock("PARAGRAPH","PRIVATE_TEACHING_BODY",null)),null,new Exercise("Prepare a result","PRIVATE_SOLUTION"),List.of(),List.of(new RubricCriterion("facts","No invented claims",1,true)),access,refs,List.of());}
    private OfferView active(UUID merchant,OfferFields fields){var draft=offers.create(merchant,merchant,new CreateOffer(code(),fields.resources().size()==1?"COURSE":"PACK",fields,"Explicit fictitious offer"));assertThat(offers.readiness(merchant,draft.id()).blockingIssues()).isEmpty();return offers.activate(merchant,merchant,draft.id(),tag(draft),new ChangeOfferState("Activate only isolated test offer"));}
    private static OfferFields fields(List<ContentView> courses,List<String> locales,long amount){return new OfferFields(List.of(new OfferCopy("fr","Offre DEMO","Configuration fictive pour recette uniquement"),new OfferCopy("en","DEMO course offer","Fictitious isolated test offer only")),courses.stream().map(c->new OfferResourceInput(c.resourceId(),c.versionId())).toList(),locales,new Money(amount,"EUR"),new OfferTax("INCLUSIVE",texts("Fictitious test total, no real tax claim")),new OfferConditions(new OfferPeriod("FIXED",30),new OfferPeriod("NONE",null),"PINNED",new OfferSupport("NONE",List.of()),false,"demo-terms-v1",texts("Fictitious test terms, not legal sales conditions")));}
    private static List<LocalizedText> texts(String text){return List.of(new LocalizedText("fr",text),new LocalizedText("en",text));}
    private static OfferFields empty(){return new OfferFields(List.of(),List.of(),List.of(),null,null,null);}
    private static String code(){return "demo-"+UUID.randomUUID();}
    private static String tag(OfferView v){return EntityTags.forRevision("offer",v.id(),v.revision());}
    private static String contentTag(ContentView v){return EntityTags.forRevision("content",v.id(),v.revision());}
    private static void expect(ApiError error,Runnable work){var failure=catchThrowable(work::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private static String attempt(Runnable work){try{work.run();return "OK";}catch(ApiException failure){return failure.error().name();}}
    private record Course(ContentView fr,ContentView en,ContentView module,ContentView activity){ }
}
