package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import com.chatgptcourses.commerce.service.CoverageReader;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","COMMERCE_ENABLED=true","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class CommerceHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void config(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("COMMERCE_ALLOWED_CURRENCIES",()->"EUR,USD");}
    @Value("${local.server.port}")int port;
    @Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;@Autowired OfferService offers;
    @Autowired com.chatgptcourses.catalog.service.PublicCatalogueService catalogue;

    @Test void incompleteOfferIsPrivateAndCannotBeActivatedOrInventReadiness()throws Exception{
        var staff=staff();var field=fields(List.of(),null);var created=createOffer(staff,field,"COURSE");String id=text(created,"id");
        problem(get(browser(),"/api/v1/offers/"+id+"?locale=fr"),404,"RESOURCE_NOT_FOUND");
        var readiness=get(staff,"/api/v1/admin/offers/"+id+"/readiness");assertThat(tree(readiness).path("summaryReady").asBoolean()).isFalse();assertThat(tree(readiness).path("checkoutAvailable").asBoolean()).isFalse();
        problem(mutate(staff,"POST","/api/v1/admin/offers/"+id+"/activate",Map.of("reason","Isolated test action"),etag(created),null),409,"OFFER_NOT_READY");
        var editor=account("EDITOR");problem(get(editor,"/api/v1/admin/offers/"+id),403,"ACCESS_DENIED");
        var forged=new LinkedHashMap<>(field);forged.put("ownerId",staff.id());problem(mutate(staff,"PATCH","/api/v1/admin/offers/"+id,Map.of("fields",forged,"reason","Reject unknown owner"),etag(created),null),400,"INVALID_REQUEST");
    }
    @Test void orderIsAnAuthoritativeSnapshotAndNeverFinancialConfirmation()throws Exception{
        var staff=staff();var source=course(staff,"PROTECTED");var offer=activeOffer(staff,List.of(source),12345);var owner=account();var command=command(offer);
        var forged=new LinkedHashMap<>(command);forged.put("total",Map.of("amountMinor",1,"currency","USD"));problem(mutate(owner,"POST","/api/v1/me/orders",forged,null,UUID.randomUUID().toString()),400,"INVALID_REQUEST");
        forged=new LinkedHashMap<>(command);forged.put("userId",staff.id());problem(mutate(owner,"POST","/api/v1/me/orders",forged,null,UUID.randomUUID().toString()),400,"INVALID_REQUEST");
        problem(mutate(owner,"POST","/api/v1/me/orders",command,null,null),428,"IDEMPOTENCY_KEY_REQUIRED");
        problem(send(owner,"POST","/api/v1/me/orders",command,null,null,UUID.randomUUID().toString(),owner.id().toString()),403,"CSRF_INVALID");
        problem(send(owner,"POST","/api/v1/me/orders",command,csrf(owner),null,UUID.randomUUID().toString(),staff.id().toString()),409,"ACCOUNT_CONTEXT_CHANGED");
        var changedTerms=new LinkedHashMap<>(command);changedTerms.put("acceptedTermsVersion","unseen-terms");problem(mutate(owner,"POST","/api/v1/me/orders",changedTerms,null,UUID.randomUUID().toString()),409,"TERMS_CHANGED");
        var prepared=order(owner,command,UUID.randomUUID().toString());assertThat(prepared.statusCode()).isEqualTo(201);var value=tree(prepared);assertThat(value.path("snapshot").path("total").path("amountMinor").asLong()).isEqualTo(12345);assertThat(value.path("snapshot").path("total").path("currency").asText()).isEqualTo("EUR");
        assertThat(value.path("orderStatus").asText()).isEqualTo("PREPARED");assertThat(value.path("paymentStatus").asText()).isEqualTo("NOT_STARTED");assertThat(value.path("fulfillmentStatus").asText()).isEqualTo("NOT_STARTED");assertThat(value.path("acceptedTermsVersion").asText()).isEqualTo("isolated-terms-v1");assertThat(value.path("acceptedAt").asText()).isEqualTo(value.path("createdAt").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,owner.id())).isZero();assertThat(prepared.body().contains("ownerId")).isFalse();assertThat(prepared.headers().firstValue("Cache-Control")).hasValueSatisfying(v->assertThat(v).contains("no-store"));
        problem(mutate(owner,"POST","/api/v1/me/orders/"+text(prepared,"id")+"/paid",Map.of("paymentStatus","PAID"),null,null),403,"ACCESS_DENIED");
    }
    @Test void sameKeyReplaysEvenAfterOfferChangesAndDifferentBodyConflicts()throws Exception{
        var staff=staff();var source=course(staff,"PROTECTED");var offer=activeOffer(staff,List.of(source),23456);var owner=account();String key=UUID.randomUUID().toString();var body=command(offer);var first=order(owner,body,key);var replay=order(owner,body,key);assertThat(replay.statusCode()).isEqualTo(200);assertThat(text(replay,"id")).isEqualTo(text(first,"id"));
        var frozenResources=jdbc.queryForList("SELECT id,resource_id,version_id,locales::text AS locales FROM order_resources WHERE order_id=? ORDER BY id",UUID.fromString(text(first,"id")));
        String contentPath="/api/v1/admin/contents/"+source.get("translationId");var previous=get(staff,contentPath);var corrected=mutate(staff,"POST",contentPath+"/revisions",Map.of("title","Actually changed published catalogue title","summary","Minor textual correction for snapshot test","document",tree(previous).path("document"),"reason","Real catalogue correction after order"),etag(previous),null);assertThat(corrected.statusCode()).isEqualTo(200);var review=mutate(staff,"POST",contentPath+"/transition",Map.of("state","TO_REVIEW","reason","Review actual catalogue correction"),etag(corrected),null);var ready=mutate(staff,"POST",contentPath+"/transition",Map.of("state","READY","reason","Approve actual catalogue correction"),etag(review),null);var published=mutate(staff,"POST",contentPath+"/publish",Map.of("revisionId",text(ready,"currentRevisionId"),"reason","Publish actual catalogue correction"),etag(ready),null);assertThat(published.statusCode()).isEqualTo(200);assertThat(catalogue.version(UUID.fromString(source.get("resourceId").toString()),UUID.fromString(source.get("versionId").toString()),"fr").title()).isEqualTo("Actually changed published catalogue title");
        var changed=new LinkedHashMap<>(body);changed.put("locale","en");problem(order(owner,changed,key),409,"CONFLICT");
        var replacement=fields(resources(offer),34567L);var saved=mutate(staff,"PATCH","/api/v1/admin/offers/"+text(offer,"id"),Map.of("fields",replacement,"reason","Synthetic price changed"),etag(offer),null);assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(tree(get(owner,"/api/v1/me/orders/"+text(first,"id"))).path("snapshot")).isEqualTo(tree(first).path("snapshot"));assertThat(jdbc.queryForList("SELECT id,resource_id,version_id,locales::text AS locales FROM order_resources WHERE order_id=? ORDER BY id",UUID.fromString(text(first,"id")))).isEqualTo(frozenResources);assertThat(text(order(owner,body,key),"id")).isEqualTo(text(first,"id"));
        problem(order(owner,body,UUID.randomUUID().toString()),409,"OFFER_CHANGED");
    }
    @Test void concurrentDifferentKeysForOneIntentionCreateExactlyOnePreparation()throws Exception{
        var staff=staff();var offer=activeOffer(staff,List.of(course(staff,"PROTECTED")),45678);var owner=account();var body=command(offer);String token=csrf(owner);var ready=new CountDownLatch(2);var go=new CountDownLatch(1);List<HttpResponse<String>> responses;
        try(var executor=Executors.newFixedThreadPool(2)){var futures=List.of(UUID.randomUUID().toString(),UUID.randomUUID().toString()).stream().map(key->executor.submit(()->{ready.countDown();go.await();return send(owner,"POST","/api/v1/me/orders",body,token,null,key,owner.id().toString());})).toList();assertThat(ready.await(3,TimeUnit.SECONDS)).isTrue();go.countDown();responses=List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));}
        assertThat(responses.stream().map(HttpResponse::statusCode).toList()).containsExactlyInAnyOrder(201,200);assertThat(text(responses.get(0),"id")).isEqualTo(text(responses.get(1),"id"));assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE owner_id=?",Integer.class,owner.id())).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_idempotency_keys WHERE owner_id=?",Integer.class,owner.id())).isEqualTo(2);
    }
    @Test void permissionRevokedWhileAwaitingOfferLockPreventsEvenRememberingANewReplayKey()throws Exception{
        var staff=staff();var offer=activeOffer(staff,List.of(course(staff,"PROTECTED")),45679);var buyer=account();var body=command(offer);
        var initial=order(buyer,body,UUID.randomUUID().toString());assertThat(initial.statusCode()).isEqualTo(201);String token=csrf(buyer);
        try(var lock=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());var executor=Executors.newSingleThreadExecutor()){
            lock.setAutoCommit(false);
            try(var statement=lock.prepareStatement("SELECT id FROM offers WHERE id=? FOR UPDATE")){statement.setObject(1,UUID.fromString(text(offer,"id")));statement.executeQuery().close();}
            var pending=executor.submit(()->send(buyer,"POST","/api/v1/me/orders",body,token,null,UUID.randomUUID().toString(),buyer.id().toString()));
            try{
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean awaiting=false;
                while(System.nanoTime()<deadline){
                    awaiting=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM offers%FOR SHARE%')",Boolean.class));
                    if(awaiting)break;Thread.sleep(10);
                }
                assertThat(awaiting).as("the authenticated request reached and awaits the offer lock").isTrue();
                assertThat(jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,clock_timestamp()),updated_at=greatest(updated_at,clock_timestamp()),revision=revision+1 WHERE user_id=? AND revoked_at IS NULL",buyer.id())).isEqualTo(1);
            }finally{lock.rollback();}
            problem(pending.get(20,TimeUnit.SECONDS),403,"ACCESS_DENIED");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE owner_id=?",Integer.class,buyer.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM order_idempotency_keys WHERE owner_id=?",Integer.class,buyer.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,buyer.id())).isZero();
    }
    @Test void ordersAreOwnerOnlyAndEditorCannotAdministerCommerce()throws Exception{
        var staff=staff();var offer=activeOffer(staff,List.of(course(staff,"PROTECTED")),56789);var first=account();var second=account();var editor=account("EDITOR");var prepared=order(first,command(offer),UUID.randomUUID().toString());String path="/api/v1/me/orders/"+text(prepared,"id");
        problem(get(second,path),404,"RESOURCE_NOT_FOUND");problem(get(editor,path),404,"RESOURCE_NOT_FOUND");problem(get(browser(),path),401,"AUTHENTICATION_REQUIRED");assertThat(get(second,"/api/v1/me/orders").body().contains(text(prepared,"id"))).isFalse();problem(get(editor,"/api/v1/admin/offers?locale=fr"),403,"ACCESS_DENIED");problem(mutate(editor,"POST","/api/v1/admin/offers/"+text(offer,"id")+"/deactivate",Map.of("reason","No commerce permission"),etag(offer),null),403,"ACCESS_DENIED");assertThat(get(first,path).statusCode()).isEqualTo(200);
    }
    @Test void realGrantOriginsAndFreeCurriculumDriveAlreadyOwnedAndPartialPackWithoutDiscount()throws Exception{
        var staff=staff();var first=course(staff,"PROTECTED");var second=course(staff,"PROTECTED");var owner=account();grant(owner,first);var single=activeOffer(staff,List.of(first),67890);var context=get(owner,"/api/v1/me/offers/"+text(single,"id")+"/purchase-context?locale=fr");assertThat(tree(context).path("coverage").path("status").asText()).isEqualTo("ALL");problem(order(owner,command(single),UUID.randomUUID().toString()),409,"ALREADY_ACCESSIBLE");
        var pack=activeOffer(staff,List.of(first,second),78901);var partial=get(owner,"/api/v1/me/offers/"+text(pack,"id")+"/purchase-context?locale=fr");assertThat(tree(partial).path("coverage").path("status").asText()).isEqualTo("PARTIAL");assertThat(tree(partial).path("coverage").path("alreadyAccessibleCount").asInt()).isEqualTo(1);var prepared=order(owner,command(pack),UUID.randomUUID().toString());assertThat(prepared.statusCode()).isEqualTo(201);assertThat(tree(prepared).path("snapshot").path("total").path("amountMinor").asLong()).isEqualTo(78901);
        var free=activeOffer(staff,List.of(course(staff,"FREE")),89012);problem(order(owner,command(free),UUID.randomUUID().toString()),409,"ALREADY_ACCESSIBLE");
        var production=new CoverageReader(jdbc,catalogue,new RuntimeProperties("production",URI.create("https://courses.invalid"),true));assertThat(production.coverage(owner.id(),offers.publicOffer(UUID.fromString(text(single,"id")),"fr")).status()).isEqualTo("NONE");
    }
    @Test void differentAcceptedRevisionCancelsOnlyThePriorPreparationAndPreservesItsSnapshot()throws Exception{
        var staff=staff();var source=course(staff,"PROTECTED");var offer=activeOffer(staff,List.of(source),90123);var owner=account();String oldKey=UUID.randomUUID().toString();var oldBody=command(offer);var first=order(owner,oldBody,oldKey);
        var saved=mutate(staff,"PATCH","/api/v1/admin/offers/"+text(offer,"id"),Map.of("fields",fields(List.of(source),91234L),"reason","Explicit replacement synthetic price"),etag(offer),null);var active=mutate(staff,"POST","/api/v1/admin/offers/"+text(offer,"id")+"/activate",Map.of("reason","Explicit isolated activation"),etag(saved),null);var replacement=order(owner,command(active),UUID.randomUUID().toString());assertThat(replacement.statusCode()).isEqualTo(201);assertThat(text(replacement,"id")).isNotEqualTo(text(first,"id"));var prior=get(owner,"/api/v1/me/orders/"+text(first,"id"));assertThat(text(prior,"orderStatus")).isEqualTo("CANCELLED");assertThat(tree(prior).path("snapshot")).isEqualTo(tree(first).path("snapshot"));assertThat(text(order(owner,oldBody,oldKey),"orderStatus")).isEqualTo("CANCELLED");assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE owner_id=? AND active_intention_key IS NOT NULL",Integer.class,owner.id())).isEqualTo(1);
    }
    @Test void expiredPersistedPreparationTransitionsWithoutErasingHistoryOrReusingItsKey()throws Exception{
        var staff=staff();var offer=activeOffer(staff,List.of(course(staff,"PROTECTED")),92345);var owner=account();var initial=order(owner,command(offer),UUID.randomUUID().toString());UUID expired=UUID.randomUUID();
        // Explicit PostgreSQL fixture of an already expired preparation; no clock mock or production trigger disabled.
        jdbc.update("""
            WITH timing AS MATERIALIZED(SELECT clock_timestamp()-interval '2 hours' AS created)
            INSERT INTO orders(id,owner_id,offer_id,offer_revision,offer_revision_id,locale,total_amount,currency,order_status,payment_status,fulfillment_status,snapshot_json,accepted_terms_version,accepted_at,created_at,expires_at,active_intention_key)
            SELECT ?,owner_id,offer_id,offer_revision,offer_revision_id,locale,total_amount,currency,'PREPARED','NOT_STARTED','NOT_STARTED',snapshot_json,accepted_terms_version,timing.created,timing.created,timing.created+interval '1 hour',? FROM orders CROSS JOIN timing WHERE id=?
            """,expired,UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-",""),UUID.fromString(text(initial,"id")));
        var result=get(owner,"/api/v1/me/orders/"+expired);assertThat(text(result,"orderStatus")).isEqualTo("EXPIRED");assertThat(jdbc.queryForObject("SELECT active_intention_key IS NULL FROM orders WHERE id=?",Boolean.class,expired)).isTrue();assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE id=?",Integer.class,expired)).isEqualTo(1);
    }
    @Test void activationUsesFreshRevisionAndWithdrawnPublicationBlocksNewOrders()throws Exception{
        var staff=staff();var source=course(staff,"PROTECTED");var created=createOffer(staff,fields(List.of(source),93456L),"COURSE");String id=text(created,"id");problem(mutate(staff,"POST","/api/v1/admin/offers/"+id+"/activate",Map.of("reason","Missing revision"),null,null),428,"PRECONDITION_REQUIRED");var active=mutate(staff,"POST","/api/v1/admin/offers/"+id+"/activate",Map.of("reason","Explicit test activation"),etag(created),null);assertThat(active.statusCode()).isEqualTo(200);problem(mutate(staff,"POST","/api/v1/admin/offers/"+id+"/deactivate",Map.of("reason","Stale revision"),etag(created),null),412,"REVISION_CONFLICT");
        var publicView=get(browser(),"/api/v1/offers/"+id+"?locale=fr");assertThat(publicView.statusCode()).isEqualTo(200);assertThat(publicView.body().contains("PRIVATE_TEST_CORRECTION")).isFalse();assertThat(tree(publicView).path("readiness").path("checkoutAvailable").asBoolean()).isFalse();
        var content=get(staff,"/api/v1/admin/contents/"+source.get("translationId"));var archived=mutate(staff,"POST","/api/v1/admin/contents/"+source.get("translationId")+"/archive",Map.of("reason","Withdraw fixture source"),etag(content),null);assertThat(archived.statusCode()).isEqualTo(200);problem(order(account(),command(active),UUID.randomUUID().toString()),409,"OFFER_NOT_READY");
    }
    private Map<String,Object> course(Browser staff,String access)throws Exception{var activity=content(staff,"ACTIVITY",access,List.of());var module=content(staff,"MODULE",access,List.of(text(activity,"versionId")));var course=content(staff,"COURSE",access,List.of(text(module,"versionId")));return Map.of("resourceId",text(course,"resourceId"),"versionId",text(course,"versionId"),"translationId",text(course,"id"));}
    private HttpResponse<String> content(Browser staff,String kind,String access,List<String> children)throws Exception{var doc=new LinkedHashMap<String,Object>();doc.put("objective","Identify confirmed facts");doc.put("expectedResult","A checked written brief");doc.put("prerequisites",List.of());doc.put("blocks",List.of(Map.of("type","PARAGRAPH","text","Fictional P11 integration fixture")));doc.put("estimatedMinutes",null);doc.put("exercise",Map.of("instructions","Check the supplied facts","correction","PRIVATE_TEST_CORRECTION"));doc.put("quiz",List.of());doc.put("rubric",List.of(Map.of("key","faithful","label","No invented facts","points",1,"blocking",true)));doc.put("access",access);doc.put("media",List.of());doc.put("relatedResourceIds",List.of());var body=new LinkedHashMap<String,Object>();body.put("kind",kind);body.put("locale","fr");body.put("slug",unique());body.put("title","Synthetic P11 "+kind);body.put("summary","Isolated integration fixture, not a commercial course");body.put("objectives","Check the brief");body.put("evaluationDefinition","Declarative checking only");body.put("document",doc);body.put("childVersionIds",children);body.put("reason","Create isolated commerce fixture");var created=mutate(staff,"POST","/api/v1/admin/contents",body,null,null);assertThat(created.statusCode()).isEqualTo(201);String path="/api/v1/admin/contents/"+text(created,"id");var review=mutate(staff,"POST",path+"/transition",Map.of("state","TO_REVIEW","reason","Explicit fixture review"),etag(created),null);assertThat(review.statusCode()).isEqualTo(200);var ready=mutate(staff,"POST",path+"/transition",Map.of("state","READY","reason","Explicit fixture readiness"),etag(review),null);assertThat(ready.statusCode()).isEqualTo(200);var published=mutate(staff,"POST",path+"/publish",Map.of("revisionId",text(ready,"currentRevisionId"),"reason","Explicit fixture publication"),etag(ready),null);assertThat(published.statusCode()).isEqualTo(200);return published;}
    private Map<String,Object> fields(List<Map<String,Object>> resources,Long amount){var f=new LinkedHashMap<String,Object>();f.put("copies",List.of(Map.of("locale","fr","title","Synthetic offer for tests only","summary","Fictional price and conditions; never a live commercial offer")));f.put("resources",resources.stream().map(x->Map.of("resourceId",x.get("resourceId"),"versionId",x.get("versionId"))).toList());f.put("locales",List.of("fr"));f.put("price",amount==null?null:Map.of("amountMinor",amount,"currency","EUR"));f.put("tax",Map.of("mode","INCLUSIVE","notices",List.of(Map.of("locale","fr","text","Synthetic tax presentation for isolated tests only"))));f.put("conditions",Map.of("access",Map.of("mode","FIXED","days",30),"updates",Map.of("mode","NONE"),"versionPolicy","PINNED","support",Map.of("mode","NONE","descriptions",List.of()),"humanReviewIncluded",false,"termsVersion","isolated-terms-v1","terms",List.of(Map.of("locale","fr","text","Synthetic isolated test conditions, not legal terms"))));return f;}
    private HttpResponse<String> createOffer(Browser staff,Map<String,Object> fields,String kind)throws Exception{var created=mutate(staff,"POST","/api/v1/admin/offers",Map.of("code",unique(),"kind",kind,"fields",fields,"reason","Create synthetic isolated offer"),null,null);assertThat(created.statusCode()).isEqualTo(201);return created;}
    private HttpResponse<String> activeOffer(Browser staff,List<Map<String,Object>> resources,long amount)throws Exception{var created=createOffer(staff,fields(resources,amount),resources.size()>1?"PACK":"COURSE");var result=mutate(staff,"POST","/api/v1/admin/offers/"+text(created,"id")+"/activate",Map.of("reason","Explicit synthetic activation"),etag(created),null);assertThat(result.statusCode()).isEqualTo(200);return result;}
    private List<Map<String,Object>> resources(HttpResponse<String> offer)throws Exception{var list=new ArrayList<Map<String,Object>>();for(var item:tree(offer).path("fields").path("resources"))list.add(Map.of("resourceId",item.path("resourceId").asText(),"versionId",item.path("versionId").asText()));return list;}
    private Map<String,Object> command(HttpResponse<String> offer)throws Exception{return Map.of("offerId",text(offer,"id"),"offerRevision",tree(offer).path("revision").asLong(),"locale","fr","acceptedTermsVersion","isolated-terms-v1");}
    private void grant(Browser owner,Map<String,Object> source){jdbc.update("INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at) VALUES(?,?,?,?,'MANUAL_TEST',?,'[\"fr\"]'::jsonb,'PINNED',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day')",UUID.randomUUID(),owner.id(),UUID.fromString(source.get("resourceId").toString()),UUID.fromString(source.get("versionId").toString()),UUID.randomUUID());}
    private Browser staff()throws Exception{return account("EDITOR","COMMERCE_MANAGER");}
    private Browser account(String... roles)throws Exception{var browser=browser();String email=unique()+"@courses.invalid",password=unique()+"-credential";var created=send(browser,"POST","/api/v1/auth/register",Map.of("email",email,"password",password,"locale","fr"),csrf(browser),null,null,null);assertThat(created.statusCode()).isEqualTo(201);UUID id=UUID.fromString(text(created,"id"));for(String role:roles)assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?",UUID.randomUUID(),id,role)).isEqualTo(1);var request=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf(browser)).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(email,StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build();assertThat(browser.http().send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);return new Browser(browser.http(),id);}
    private HttpResponse<String> order(Browser owner,Object body,String key)throws Exception{return mutate(owner,"POST","/api/v1/me/orders",body,null,key);}
    private HttpResponse<String> mutate(Browser who,String method,String path,Object body,String tag,String key)throws Exception{return send(who,method,path,body,csrf(who),tag,key,who.id()==null?null:who.id().toString());}
    private HttpResponse<String> send(Browser who,String method,String path,Object body,String token,String tag,String key,String context)throws Exception{var request=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));if(token!=null)request.header("X-CSRF-TOKEN",token);if(tag!=null)request.header("If-Match",tag);if(key!=null)request.header("Idempotency-Key",key);if(context!=null)request.header("X-Account-Context",context);return who.http().send(request.build(),HttpResponse.BodyHandlers.ofString());}
    private String csrf(Browser who)throws Exception{return text(get(who,"/api/v1/auth/csrf"),"token");}
    private HttpResponse<String> get(Browser who,String path)throws Exception{return who.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private void problem(HttpResponse<String> value,int status,String code)throws Exception{assertThat(value.statusCode()).isEqualTo(status);assertThat(text(value,"code")).isEqualTo(code);assertThat(text(value,"type")).isEqualTo("about:blank");assertThat(value.body().contains("password")).isFalse();}
    private JsonNode tree(HttpResponse<String> value)throws Exception{return mapper.readTree(value.body());}private String text(HttpResponse<String> value,String key)throws Exception{return tree(value).path(key).asText();}
    private static String etag(HttpResponse<String> value){return value.headers().firstValue("ETag").orElseThrow();}private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}private static String unique(){return "p11-"+UUID.randomUUID();}
    private static Browser browser(){return new Browser(HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build(),null);}private record Browser(HttpClient http,UUID id) { }
}
