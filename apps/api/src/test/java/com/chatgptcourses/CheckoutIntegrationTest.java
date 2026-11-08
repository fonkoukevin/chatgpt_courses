package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.payments.service.PaymentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.commerce.service.OrderService;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.service.CheckoutService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.money.Money;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

/** Real PostgreSQL and pinned Stripe SDK, with an explicit local HTTP provider double. No Stripe account/card is used. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","COMMERCE_ENABLED=true","STRIPE_ENABLED=true","STRIPE_MODE=test","STRIPE_READ_TIMEOUT=3s","PAYMENT_INBOX_ENABLED=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class CheckoutIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    static final Provider PROVIDER=new Provider();
    @DynamicPropertySource static void config(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("COMMERCE_ALLOWED_CURRENCIES",()->"EUR");r.add("STRIPE_SECRET_KEY",()->PROVIDER.key);r.add("STRIPE_WEBHOOK_SECRET",()->"whsec_"+UUID.randomUUID().toString().replace("-",""));r.add("STRIPE_ACCOUNT_ID",()->"acct_local_test");r.add("STRIPE_API_BASE",PROVIDER::base);}
    @Autowired CheckoutService checkout;@Autowired OfferService offers;@Autowired OrderService orders;@Autowired EditorialService editorial;@Autowired PaymentGateway gateway;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;
    @BeforeEach void reset(){PROVIDER.reset(jdbc);}
    @AfterAll static void stop(){PROVIDER.close();}

    @Test void operationIsCommittedBeforeSdkNetworkAndReplaysNeverCreateAnotherSession(){
        var f=fixture(1500);String key=UUID.randomUUID().toString();var access=start(f,key);assertThat(access.state()).isEqualTo("OPEN");assertThat(access.url().startsWith("https://checkout.stripe.com/c/pay/")).isTrue();
        assertThat(PROVIDER.committedAtRequest).isTrue();assertThat(PROVIDER.authorized).isTrue();assertThat(PROVIDER.version).isEqualTo(StripeSettings.API_VERSION);assertThat(PROVIDER.account).isNull();assertThat(PROVIDER.creates.get()).isEqualTo(1);assertThat(PROVIDER.accountReads.get()).isPositive();int identityReads=PROVIDER.accountReads.get();
        var replay=start(f,key);var otherKey=start(f,UUID.randomUUID().toString());assertThat(replay.operationId()).isEqualTo(access.operationId());assertThat(otherKey.operationId()).isEqualTo(access.operationId());assertThat(Objects.equals(replay.url(),access.url())).isTrue();assertThat(PROVIDER.creates.get()).isEqualTo(1);
        assertThat(PROVIDER.accountReads.get()).isEqualTo(identityReads);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkout_operations WHERE order_id=?",Integer.class,f.order().id())).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM checkout_idempotency_keys WHERE order_id=?",Integer.class,f.order().id())).isEqualTo(2);
        var order=orders.get(f.owner(),f.order().id());assertThat(order.paymentStatus()).isEqualTo("REQUIRES_PAYMENT");assertThat(order.fulfillmentStatus()).isEqualTo("NOT_STARTED");assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,f.owner())).isZero();
        var params=mapper.readValue(jdbc.queryForObject("SELECT request_json::text FROM checkout_operations WHERE id=?",String.class,access.operationId()),CheckoutParameters.class);
        assertThat(params.expiresAt().getEpochSecond()-jdbc.queryForObject("SELECT extract(epoch from created_at)::bigint FROM checkout_operations WHERE id=?",Long.class,access.operationId())).isEqualTo(3600);assertThat(params.successUrl()).endsWith("/fr/commandes/"+f.order().id()+"/statut?checkout=success");assertThat(params.cancelUrl()).endsWith("?checkout=cancel");
    }

    @Test void concurrentKeysShareOneCommittedOperationWhileProviderResponseIsHeld()throws Exception{
        var f=fixture(1600);PROVIDER.gate=new CountDownLatch(1);PROVIDER.entered=new CountDownLatch(1);
        try(var pool=Executors.newSingleThreadExecutor()){
            var pending=pool.submit(()->start(f,UUID.randomUUID().toString()));
            try{assertThat(PROVIDER.entered.await(2,TimeUnit.SECONDS)).isTrue();var second=start(f,UUID.randomUUID().toString());assertThat(second.state()).isEqualTo("CALLING");assertThat(second.url()).isNull();
                expect(ApiError.ACTIVE_ORDER_EXISTS,()->orders.create(f.owner(),f.owner(),UUID.randomUUID().toString(),new CreateOrder(f.offer().id(),f.offer().revision(),"fr","demo-terms")));
            }finally{PROVIDER.gate.countDown();}
            assertThat(pending.get(5,TimeUnit.SECONDS).state()).isEqualTo("OPEN");
        }
        assertThat(PROVIDER.creates.get()).isEqualTo(1);assertThat(PROVIDER.sessions.size()).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM checkout_operations WHERE order_id=?",Integer.class,f.order().id())).isEqualTo(1);
    }

    @Test void realSdkReadTimeoutAfterProviderCreationKeepsTheSameParametersAndIdempotencyKey(){
        var f=fixture(1700);PROVIDER.delayFirst=true;String key=UUID.randomUUID().toString();var unknown=start(f,key);assertThat(unknown.state()).isEqualTo("UNKNOWN");assertThat(unknown.url()).isNull();assertThat(checkout.status(f.owner(),f.order().id()).canRetry()).isTrue();
        var recovered=start(f,key);assertThat(recovered.state()).isEqualTo("OPEN");assertThat(recovered.operationId()).isEqualTo(unknown.operationId());assertThat(PROVIDER.creates.get()).isEqualTo(2);assertThat(PROVIDER.sessions.size()).isEqualTo(1);assertThat(PROVIDER.sameParameters).isTrue();assertThat(PROVIDER.sameProviderKey).isTrue();
        assertThat(recovered.url()!=null&&recovered.url().endsWith("#controlled-test-fragment")).isTrue();
        assertThat(jdbc.queryForObject("SELECT attempts FROM checkout_operations WHERE id=?",Integer.class,unknown.operationId())).isEqualTo(2);assertThat(orders.get(f.owner(),f.order().id()).paymentStatus()).isNotEqualTo("PAID");
    }

    @Test void wrongModeAndUntrustedCheckoutUrlsNeverReachTheBrowserOrCreateAccess(){
        var f=fixture(1800);PROVIDER.wrongMode=true;var denied=start(f,UUID.randomUUID().toString());assertThat(denied.state()).isEqualTo("UNKNOWN");assertThat(denied.url()).isNull();assertThat(jdbc.queryForObject("SELECT session_url IS NULL FROM checkout_operations WHERE id=?",Boolean.class,denied.operationId())).isTrue();
        var other=fixture(1900);PROVIDER.wrongMode=false;PROVIDER.badUrl=true;var invalid=start(other,UUID.randomUUID().toString());assertThat(invalid.url()).isNull();assertThat(invalid.state()).isEqualTo("UNKNOWN");assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id IN(?,?)",Integer.class,f.owner(),other.owner())).isZero();
        assertThat(invalid.toString().contains("https://")).isFalse();
    }

    @Test void aDifferentMerchantAccountIsRejectedBeforeCreatingAnyCheckout(){
        var settings=new StripeSettings(true,"TEST",PROVIDER.key,"whsec_local_fixture","acct_other_fixture",java.net.URI.create(PROVIDER.base()),java.time.Duration.ofSeconds(1),java.time.Duration.ofSeconds(3),java.time.Duration.ofMinutes(10));
        var isolated=new com.chatgptcourses.payments.gateway.StripePaymentGateway(settings);
        UUID operation=UUID.randomUUID(),order=UUID.randomUUID();
        var params=new CheckoutParameters(operation,order,UUID.randomUUID(),"fr","Isolated merchant identity test",1500,"EUR","http://localhost:3000/fr/commandes/"+order+"/statut?checkout=success","http://localhost:3000/fr/commandes/"+order+"/statut?checkout=cancel",Instant.now().plusSeconds(3600));
        int reads=PROVIDER.accountReads.get();
        var failure=catchThrowable(()->isolated.createCheckout(params,"cc-checkout-"+operation));
        assertThat(failure).isInstanceOf(com.chatgptcourses.payments.service.PaymentGatewayException.class);
        assertThat(((com.chatgptcourses.payments.service.PaymentGatewayException)failure).reason()).isEqualTo("PROVIDER_ACCOUNT_MISMATCH");
        assertThat(PROVIDER.accountReads.get()).isEqualTo(reads+1);assertThat(PROVIDER.creates.get()).isZero();assertThat(PROVIDER.sessions).isEmpty();
        assertThat(com.chatgptcourses.payments.gateway.StripePaymentGateway.validCheckoutUrl("https://checkout.stripe.com/c/pay/"+"a".repeat(4096))).isFalse();
    }

    @Test void ownershipContextTermsAndExactOrderRevisionAreCheckedBeforeAnyExternalRequest(){
        var f=fixture(2000);UUID b=actor("LEARNER");var body=new CreateCheckout("demo-terms");
        expect(ApiError.RESOURCE_NOT_FOUND,()->checkout.checkout(b,b,f.order().id(),tag(f.order()),UUID.randomUUID().toString(),body));expect(ApiError.PRECONDITION_REQUIRED,()->checkout.checkout(f.owner(),f.owner(),f.order().id(),null,UUID.randomUUID().toString(),body));expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->checkout.checkout(f.owner(),b,f.order().id(),tag(f.order()),UUID.randomUUID().toString(),body));
        expect(ApiError.TERMS_CHANGED,()->checkout.checkout(f.owner(),f.owner(),f.order().id(),tag(f.order()),UUID.randomUUID().toString(),new CreateCheckout("unseen-terms")));
        var changed=offers.save(f.merchant(),f.merchant(),f.offer().id(),offerTag(f.offer()),new SaveOffer(fields(f.course(),2100),"Fictitious revised price"));offers.activate(f.merchant(),f.merchant(),changed.id(),offerTag(changed),new ChangeOfferState("Explicit fictitious reactivation"));expect(ApiError.OFFER_CHANGED,()->start(f,UUID.randomUUID().toString()));
        assertThat(PROVIDER.creates.get()).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM checkout_operations WHERE order_id=?",Integer.class,f.order().id())).isZero();
    }

    @Test void configuredGatewayBlocksZeroBelowMinimumAndNineDigitAmountsWithoutChangingSummaryReadiness(){
        var f=fixture(0);assertThat(offers.readiness(f.merchant(),f.offer().id()).summaryReady()).isTrue();assertThat(offers.readiness(f.merchant(),f.offer().id()).checkoutUnavailableReason()).isEqualTo("AMOUNT_NOT_SUPPORTED");expect(ApiError.PAYMENT_AMOUNT_NOT_SUPPORTED,()->start(f,UUID.randomUUID().toString()));
        for(long amount:List.of(49L,100_000_000L)){var offer=active(f.merchant(),f.course(),amount);var order=orders.create(f.owner(),f.owner(),UUID.randomUUID().toString(),new CreateOrder(offer.id(),offer.revision(),"fr","demo-terms")).value();expect(ApiError.PAYMENT_AMOUNT_NOT_SUPPORTED,()->checkout.checkout(f.owner(),f.owner(),order.id(),tag(order),UUID.randomUUID().toString(),new CreateCheckout("demo-terms")));}
        assertThat(PROVIDER.creates.get()).isZero();
    }

    @Test void sdkRetrievalAndBoundedSearchReturnCurrentFactsWithoutThemselvesMarkingAnOrderPaid(){
        var f=fixture(2200);var access=start(f,UUID.randomUUID().toString());var params=mapper.readValue(jdbc.queryForObject("SELECT request_json::text FROM checkout_operations WHERE id=?",String.class,access.operationId()),CheckoutParameters.class);String session=jdbc.queryForObject("SELECT session_id FROM checkout_operations WHERE id=?",String.class,access.operationId());PROVIDER.paid=true;
        var facts=gateway.retrieveCheckoutFacts(session);assertThat(facts.operationId()).isEqualTo(access.operationId());assertThat(facts.orderId()).isEqualTo(f.order().id());assertThat(facts.paymentIntentStatus()).isEqualTo("succeeded");assertThat(facts.amountReceived()).isEqualTo(2200);assertThat(facts.lines()).hasSize(1);assertThat(facts.lines().getFirst().productReference()).isEqualTo(f.order().snapshot().offerRevisionId().toString());assertThat(facts.refundedAmount()).isZero();assertThat(facts.toString().contains("https://")).isFalse();
        assertThat(gateway.findCheckoutFacts(params)).isPresent();PROVIDER.refunded=true;assertThat(gateway.retrieveCheckoutFacts(session).refundedAmount()).isEqualTo(2200);assertThat(orders.get(f.owner(),f.order().id()).paymentStatus()).isEqualTo("REQUIRES_PAYMENT");assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,f.owner())).isZero();
    }

    @Test void aPersistedOperationPastItsRecoveryWindowOnlyRequestsReconciliationAndCannotRewriteItsParameters(){
        var f=fixture(2300);UUID id=UUID.randomUUID(),op=UUID.randomUUID();Instant created=jdbc.queryForObject("SELECT date_trunc('second',clock_timestamp())-interval '20 minutes'",Timestamp.class).toInstant();var p=new CheckoutParameters(op,id,f.order().snapshot().offerRevisionId(),"fr","Explicit old-operation fixture",2300,"EUR","http://localhost:3000/fr/commandes/"+id+"/statut?checkout=success","http://localhost:3000/fr/commandes/"+id+"/statut?checkout=cancel",created.plusSeconds(3600));String json=mapper.writeValueAsString(p);
        // Explicit historical state fixture, not a claim of a twenty-minute real-time wait.
        jdbc.update("INSERT INTO orders(id,owner_id,offer_id,offer_revision,offer_revision_id,locale,total_amount,currency,order_status,payment_status,fulfillment_status,snapshot_json,accepted_terms_version,accepted_at,created_at,expires_at,active_intention_key) SELECT ?,owner_id,offer_id,offer_revision,offer_revision_id,locale,total_amount,currency,'AWAITING_PAYMENT','UNKNOWN','NOT_STARTED',snapshot_json,accepted_terms_version,?,?,?,? FROM orders WHERE id=?",id,Timestamp.from(created),Timestamp.from(created),Timestamp.from(created.plusSeconds(1800)),"b".repeat(64),f.order().id());
        jdbc.update("INSERT INTO checkout_operations(id,order_id,owner_id,order_revision,account_id,livemode,provider_idempotency_key,request_json,request_hash,amount_minor,currency,state,checkout_expires_at,retry_until,created_at,updated_at) VALUES(?,?,?,0,'acct_local_test',false,?,?::jsonb,?,2300,'EUR','UNKNOWN',?,?,?,?)",op,id,f.owner(),"cc-checkout-"+op,json,hash(json),Timestamp.from(created.plusSeconds(3600)),Timestamp.from(created.plusSeconds(600)),Timestamp.from(created),Timestamp.from(created));jdbc.update("UPDATE orders SET payment_operation_id=?,revision=revision+1 WHERE id=?",op,id);
        var result=checkout.checkout(f.owner(),f.owner(),id,EntityTags.forRevision("order",id,0),UUID.randomUUID().toString(),new CreateCheckout("demo-terms"));assertThat(result.state()).isEqualTo("UNKNOWN");assertThat(result.url()).isNull();assertThat(checkout.status(f.owner(),id).canRetry()).isFalse();assertThat(PROVIDER.creates.get()).isZero();
        assertThat(catchThrowable(()->jdbc.update("UPDATE checkout_operations SET request_json='{}',revision=revision+1 WHERE id=?",op))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private Fixture fixture(long amount){UUID merchant=actor("LEARNER","EDITOR","COMMERCE_MANAGER"),owner=actor("LEARNER");var activity=content(merchant,ResourceKind.ACTIVITY,List.of());var module=content(merchant,ResourceKind.MODULE,List.of(activity.versionId()));var course=content(merchant,ResourceKind.COURSE,List.of(module.versionId()));var offer=active(merchant,course,amount);var order=orders.create(owner,owner,UUID.randomUUID().toString(),new CreateOrder(offer.id(),offer.revision(),"fr","demo-terms")).value();return new Fixture(owner,merchant,course,offer,order);}
    private CheckoutAccess start(Fixture f,String key){return checkout.checkout(f.owner(),f.owner(),f.order().id(),tag(f.order()),key,new CreateCheckout("demo-terms"));}
    private UUID actor(String... roles){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-integration-test-hash','ACTIVE')",id,id+"@example.invalid");for(String role:roles)jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code=?",id,role);return id;}
    private ContentView content(UUID actor,ResourceKind kind,List<UUID> children){var doc=new ContentDocument("Check supplied facts","A checked proposal",List.of(),List.of(new ContentBlock("PARAGRAPH","Explicit fictional P12 fixture",null)),null,new Exercise("Prepare a proposal","Test correction"),List.of(),List.of(new RubricCriterion("facts","Check facts",1,true)),"PROTECTED",List.of(),List.of());var c=editorial.create(actor,new CreateContent(kind,"fr","p12-"+UUID.randomUUID(),"Fictitious P12 "+kind,"Explicit technical fixture only","Check facts","Declared evidence",doc,children,"Isolated payment test"));c=editorial.transition(actor,c.id(),contentTag(c),new TransitionContent(EditorialState.TO_REVIEW,"Review fixture",null));c=editorial.transition(actor,c.id(),contentTag(c),new TransitionContent(EditorialState.READY,"Ready fixture",null));return editorial.publish(actor,c.id(),contentTag(c),new PublishContent(c.currentRevisionId(),"Publish fixture"));}
    private OfferView active(UUID merchant,ContentView course,long amount){var created=offers.create(merchant,merchant,new CreateOffer("p12-"+UUID.randomUUID(),"COURSE",fields(course,amount),"Fictitious test offer"));return offers.activate(merchant,merchant,created.id(),offerTag(created),new ChangeOfferState("Explicit local fixture activation"));}
    private static OfferFields fields(ContentView course,long amount){return new OfferFields(List.of(new OfferCopy("fr","Offre fictive P12","Uniquement une recette technique isolée")),List.of(new OfferResourceInput(course.resourceId(),course.versionId())),List.of("fr"),new Money(amount,"EUR"),new OfferTax("INCLUSIVE",List.of(new LocalizedText("fr","Libellé fiscal fictif de test"))),new OfferConditions(new OfferPeriod("FIXED",30),new OfferPeriod("NONE",null),"PINNED",new OfferSupport("NONE",List.of()),false,"demo-terms",List.of(new LocalizedText("fr","Conditions fictives de recette, aucune vente réelle"))));}
    private static String tag(OrderView o){return EntityTags.forRevision("order",o.id(),o.revision());}private static String offerTag(OfferView o){return EntityTags.forRevision("offer",o.id(),o.revision());}private static String contentTag(ContentView c){return EntityTags.forRevision("content",c.id(),c.revision());}
    private static void expect(ApiError expected,Runnable work){var failure=catchThrowable(work::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(expected);}
    private static byte[] hash(String value){try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}catch(Exception error){throw new IllegalStateException("SHA-256 unavailable");}}
    private record Fixture(UUID owner,UUID merchant,ContentView course,OfferView offer,OrderView order){ }

    static final class Provider implements AutoCloseable {
        final HttpServer server;final ExecutorService executor=Executors.newVirtualThreadPerTaskExecutor();final String key="sk_test_local_"+UUID.randomUUID().toString().replace("-","");final AtomicInteger creates=new AtomicInteger(),accountReads=new AtomicInteger();final Map<String,Stored> sessions=new ConcurrentHashMap<>();
        volatile JdbcTemplate jdbc;volatile boolean committedAtRequest,authorized,sameParameters=true,sameProviderKey=true,delayFirst,wrongMode,badUrl,paid,refunded;volatile String version,account;volatile CountDownLatch gate,entered;
        Provider(){try{server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.setExecutor(executor);server.createContext("/v1/checkout/sessions",this::handle);server.createContext("/v1/account",this::handle);server.start();}catch(Exception error){throw new IllegalStateException("Local SDK fixture could not start");}}
        String base(){return "http://127.0.0.1:"+server.getAddress().getPort();}
        void reset(JdbcTemplate value){jdbc=value;creates.set(0);sessions.clear();committedAtRequest=false;authorized=false;sameParameters=true;sameProviderKey=true;delayFirst=false;wrongMode=false;badUrl=false;paid=false;refunded=false;gate=null;entered=null;}
        void handle(HttpExchange exchange){try{
            Object response;
            if("/v1/account".equals(exchange.getRequestURI().getPath())){accountReads.incrementAndGet();response=Map.of("id","acct_local_test","object","account");}
            else if("POST".equals(exchange.getRequestMethod())){
                String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);var params=new HashMap<String,String>();for(String pair:body.split("&")){String[] part=pair.split("=",2);params.put(URLDecoder.decode(part[0],StandardCharsets.UTF_8),URLDecoder.decode(part.length==2?part[1]:"",StandardCharsets.UTF_8));}
                String idempotency=exchange.getRequestHeaders().getFirst("Idempotency-Key");authorized=("Bearer "+key).equals(exchange.getRequestHeaders().getFirst("Authorization"));version=exchange.getRequestHeaders().getFirst("Stripe-Version");account=exchange.getRequestHeaders().getFirst("Stripe-Account");int call=creates.incrementAndGet();
                var stored=sessions.computeIfAbsent(idempotency,k->new Stored("cs_test_local_"+UUID.randomUUID().toString().replace("-",""),Map.copyOf(params),hash(body),idempotency));
                sameParameters&=MessageDigest.isEqual(stored.hash(),hash(body));sameProviderKey&=stored.key().equals(idempotency);
                committedAtRequest=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM checkout_operations WHERE id=? AND state='CALLING')",Boolean.class,UUID.fromString(params.get("metadata[operation_id]"))));
                response=session(stored);if(entered!=null)entered.countDown();if(gate!=null)gate.await(5,TimeUnit.SECONDS);if(delayFirst&&call==1)Thread.sleep(3400);
            }else{
                String path=exchange.getRequestURI().getPath();if(path.equals("/v1/checkout/sessions"))response=Map.of("object","list","has_more",false,"data",sessions.values().stream().map(this::session).toList());
                else{var stored=sessions.values().stream().filter(s->path.contains(s.id())).findFirst().orElseThrow();response=path.endsWith("/line_items")?Map.of("object","list","has_more",false,"data",List.of(line(stored))):session(stored);}
            }
            byte[] bytes=new ObjectMapper().writeValueAsBytes(response);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
        }catch(Exception unavailable){try{exchange.sendResponseHeaders(500,-1);}catch(Exception ignored){ }}finally{exchange.close();}}
        Map<String,Object> session(Stored s){var p=s.params();var value=new LinkedHashMap<String,Object>();value.put("id",s.id());value.put("object","checkout.session");value.put("client_reference_id",p.get("client_reference_id"));value.put("metadata",Map.of("operation_id",p.get("metadata[operation_id]"),"order_id",p.get("metadata[order_id]")));value.put("mode","payment");value.put("status",paid?"complete":"open");value.put("payment_status",paid?"paid":"unpaid");value.put("livemode",wrongMode);value.put("amount_total",Long.parseLong(p.get("line_items[0][price_data][unit_amount]")));value.put("currency",p.get("line_items[0][price_data][currency]"));value.put("expires_at",Long.parseLong(p.get("expires_at")));value.put("url",badUrl?"https://invalid.example/c/pay/fixture":"https://checkout.stripe.com/c/pay/"+s.id()+(delayFirst?"#controlled-test-fragment":""));if(paid)value.put("payment_intent",Map.of("id","pi_local_fixture","object","payment_intent","status","succeeded","amount_received",Long.parseLong(p.get("line_items[0][price_data][unit_amount]")),"latest_charge",Map.of("id","ch_local_fixture","object","charge","refunded",refunded,"amount_refunded",refunded?Long.parseLong(p.get("line_items[0][price_data][unit_amount]")):0)));return value;}
        Map<String,Object> line(Stored s){var p=s.params();return Map.of("id","li_local_fixture","object","item","amount_total",Long.parseLong(p.get("line_items[0][price_data][unit_amount]")),"currency",p.get("line_items[0][price_data][currency]"),"quantity",1,"price",Map.of("id","price_local_fixture","object","price","product",Map.of("id","prod_local_fixture","object","product","metadata",Map.of("offer_revision_id",p.get("line_items[0][price_data][product_data][metadata][offer_revision_id]")))));}
        public void close(){server.stop(0);executor.close();}
        record Stored(String id,Map<String,String> params,byte[] hash,String key){@Override public String toString(){return "StoredStripeFixture[redacted]";}}
    }
}
