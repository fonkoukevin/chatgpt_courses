package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import static com.chatgptcourses.methods.service.MethodTypes.*;
import com.chatgptcourses.access.EntitlementAccess;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.commerce.service.*;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.methods.service.MethodService;
import com.chatgptcourses.notifications.NotificationWorker;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.inbox.PaymentInboxWorker;
import com.chatgptcourses.payments.refunds.RefundWorker;
import com.chatgptcourses.payments.service.CheckoutService;
import com.chatgptcourses.payments.service.PaymentTypes.CreateCheckout;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.money.Money;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** PostgreSQL and HTTP/security are real; SMTP uses isolated Mailpit. Only Stripe's remote HTTP transport is doubled. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false",
    "COMMERCE_ENABLED=true","STRIPE_ENABLED=true","STRIPE_MODE=test","STRIPE_READ_TIMEOUT=3s",
    "PAYMENT_INBOX_ENABLED=false","REFUND_WORKER_ENABLED=false","NOTIFICATION_OUTBOX_ENABLED=false",
    "courses.notifications.outbox.retry-base=1s","courses.notifications.outbox.retry-max=1s","courses.assets.enabled=false"
})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AdminOperationsHttpIntegrationTest {
    static final RefundStripeProvider PROVIDER=new RefundStripeProvider();
    private static final String WEBHOOK="whsec_"+UUID.randomUUID().toString().replace("-","");
    private static final String PRIVATE="P15_PRIVATE_MESSAGE_DRAFT_NOTE_AND_PERSONAL_TEXT";
    private static final String USER_MESSAGE="P15_OWNER_SELECTED_MESSAGE_PRIVATE";
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @Container static final GenericContainer<?> MAILPIT=new GenericContainer<>(DockerImageName.parse("axllent/mailpit:v1.33.0@sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231")).withExposedPorts(1025,8025).waitingFor(Wait.forHttp("/readyz").forPort(8025));
    @DynamicPropertySource static void config(DynamicPropertyRegistry r){
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
        r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("COMMERCE_ALLOWED_CURRENCIES",()->"EUR,USD,GBP");
        r.add("STRIPE_SECRET_KEY",()->PROVIDER.key);r.add("STRIPE_WEBHOOK_SECRET",()->WEBHOOK);r.add("STRIPE_ACCOUNT_ID",()->RefundStripeProvider.ACCOUNT);r.add("STRIPE_API_BASE",PROVIDER::base);
        r.add("MAIL_HOST",MAILPIT::getHost);r.add("MAIL_PORT",()->MAILPIT.getMappedPort(1025));r.add("MAIL_MODE",()->"local");r.add("MAIL_FROM",()->"noreply@courses.local.invalid");
    }
    @AfterAll static void close(){PROVIDER.close();}
    @Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;@Autowired PasswordEncoder encoder;
    @Autowired EditorialService editorial;@Autowired OfferService offers;@Autowired OrderService orders;@Autowired CheckoutService checkout;
    @Autowired PaymentInboxWorker payments;@Autowired RefundWorker refunds;@Autowired NotificationWorker notifications;@Autowired EntitlementAccess access;
    @Autowired LearningService learning;@Autowired MethodService methods;@Autowired JavaMailSender mail;
    @Autowired PlatformTransactionManager transactions;
    @LocalServerPort int port;
    @BeforeEach void transport(){PROVIDER.resetFaults();((JavaMailSenderImpl)mail).setPort(MAILPIT.getMappedPort(1025));}

    @Test @Order(1) void metricsMatchManualMultiCurrencyFactsAndCsvUsesExactlyTheSamePeriodAndCurrency() throws Exception {
        // This case runs first in its own database: no facts from another scenario enter the manual calculation.
        var staff=staff();var owner=account();var source=bundle(staff.id(),"PROTECTED");String window=period();
        var eurOne=paid(owner,staff,source,1000,"EUR");var eurTwo=paid(account(),staff,source,2500,"EUR");
        var usdOwner=account();var usd=paid(usdOwner,staff,source,3000,"USD");prepared(account(),staff,source,500,"EUR");
        var session=PROVIDER.sessionForOrder(eurTwo.id());var refund=PROVIDER.externalRefund(session,400,"succeeded");
        assertThat(webhook(event("refund.created",PROVIDER.refundJson(refund))).statusCode()).isEqualTo(200);
        until(()->{refunds.runOnce();return jdbc.queryForObject("SELECT count(*) FROM refund_operations WHERE order_id=? AND confirmed_at IS NOT NULL",Integer.class,eurTwo.id())==1;},15);
        var result=get(staff,"/api/v1/admin/metrics?"+window);assertThat(result.statusCode()).isEqualTo(200);
        var value=tree(result);var eur=currency(value,"EUR");var dollars=currency(value,"USD");
        assertThat(eur.path("grossPaidMinor").asText()).isEqualTo("3500");assertThat(eur.path("confirmedRefundedMinor").asText()).isEqualTo("400");assertThat(eur.path("netCollectedBeforeCostsMinor").asText()).isEqualTo("3100");
        assertThat(dollars.path("grossPaidMinor").asText()).isEqualTo("3000");assertThat(dollars.path("confirmedRefundedMinor").asText()).isEqualTo("0");assertThat(dollars.path("netCollectedBeforeCostsMinor").asText()).isEqualTo("3000");
        for(String name:List.of("taxesMinor","feesMinor","variableCostsMinor","supportCostMinor","estimatedContributionMinor"))assertThat(eur.path(name).isNull()).as("Unobserved financial amount %s remains unknown",name).isTrue();
        assertThat(metric(value,"PAYMENT_CONFIRMED").path("value").asText()).isEqualTo("3");assertThat(metric(value,"CHECKOUT_STARTED").path("value").asText()).isEqualTo("3");assertThat(metric(value,"REFUND_CONFIRMED").path("value").asText()).isEqualTo("1");
        assertThat(metric(value,"USEFUL_VISITS").path("availability").asText()).isEqualTo("UNKNOWN");assertThat(metric(value,"USEFUL_VISITS").path("value").isNull()).isTrue();
        assertThat(value.path("recordedSupportMinutes").isNull()).isTrue();assertThat(value.path("supportMinutesAvailability").asText()).isEqualTo("UNKNOWN");
        var filtered=tree(get(staff,"/api/v1/admin/metrics?"+window+"&currency=EUR"));assertThat(filtered.path("currencies").size()).isEqualTo(1);assertThat(currency(filtered,"EUR").path("grossPaidMinor").asText()).isEqualTo("3500");
        var csv=get(staff,"/api/v1/admin/metrics/export?"+window+"&currency=EUR");assertThat(csv.statusCode()).isEqualTo(200);
        byte[] bytes=csv.body().getBytes(StandardCharsets.UTF_8);assertThat(csv.headers().firstValue("Content-Type").orElse("")).contains("text/csv","UTF-8");assertThat(csv.headers().firstValue("Content-Disposition").orElse("")).contains("attachment","operations-metrics-");assertThat(csv.headers().firstValue("Content-Length").orElseThrow()).isEqualTo(Integer.toString(bytes.length));
        String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));assertThat(csv.headers().toString().contains(hash)).as("CSV includes its actual SHA256").isTrue();
        var rows=csvRows(csv.body());assertThat(rows.getFirst()).containsExactly("Metric","Value","Availability","Unit","Currency","FromInclusive","ToExclusive","Source","DateField","Deduplication","Denominator","Coverage","Limitation");
        assertThat(rows.stream().skip(1).noneMatch(row->row.size()>4&&row.get(4).equals("USD"))).isTrue();
        assertThat(rows.stream().anyMatch(row->row.size()>4&&row.get(1).equals("3500")&&row.get(4).equals("EUR"))).isTrue();
        assertThat(rows.stream().skip(1).allMatch(row->Instant.parse(row.get(5)).equals(Instant.parse(value.path("period").path("from").asText()))&&Instant.parse(row.get(6)).equals(Instant.parse(value.path("period").path("to").asText())))).as("CSV and JSON use the identical requested interval").isTrue();
        assertThat(csv.body().contains(owner.email())||csv.body().contains(owner.id().toString())||csv.body().contains(PRIVATE)).isFalse();
        // The sole USD payment isolates endpoint inclusivity from the dates of the two EUR payments.
        Instant paidAt=jdbc.queryForObject("SELECT paid_at FROM orders WHERE id=?",(r,n)->r.getTimestamp(1).toInstant(),usd.id());
        var before=tree(get(staff,"/api/v1/admin/metrics?from="+q(paidAt.minusSeconds(1).toString())+"&to="+q(paidAt.toString())+"&currency=USD"));
        assertThat(currency(before,"USD").path("grossPaidMinor").asText()).isEqualTo("0");
        var including=tree(get(staff,"/api/v1/admin/metrics?from="+q(paidAt.toString())+"&to="+q(paidAt.plusNanos(1000).toString())+"&currency=USD"));assertThat(currency(including,"USD").path("grossPaidMinor").asText()).isEqualTo("3000");
        problem(get(staff,"/api/v1/admin/metrics?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z"),400,"VALIDATION_FAILED");
        problem(get(staff,"/api/v1/admin/metrics?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z"),400,"VALIDATION_FAILED");
        assertThat(orders.get(usdOwner.id(),usd.id()).paymentStatus()).isEqualTo("PAID");
    }

    @Test void editorAndLearnerCannotReadOrMutateFinanceWhileDashboardHonorsSourcePermissions() throws Exception {
        var editor=account("EDITOR");var owner=account();var operator=staff();
        for(var actor:List.of(editor,owner))for(String path:List.of("/admin/orders?"+period(),"/admin/metrics?"+period(),"/admin/audit?"+period(),"/admin/incidents?"+period()))problem(get(actor,"/api/v1"+path),403,"ACCESS_DENIED");
        var anonymous=new Account(HttpClient.newHttpClient(),UUID.randomUUID(),"anonymous@fixture.invalid");problem(get(anonymous,"/api/v1/admin/metrics?"+period()),401,"AUTHENTICATION_REQUIRED");
        var dash=get(operator,"/api/v1/admin/operations/dashboard?"+period());assertThat(dash.statusCode()).isEqualTo(200);assertThat(dash.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(dash.body().contains("grossPaidMinor")||dash.body().contains(owner.email())||dash.body().contains(PRIVATE)).isFalse();
        var sourceLess=account();grant(sourceLess,"operations.read");var partial=tree(get(sourceLess,"/api/v1/admin/operations/dashboard?"+period()));
        for(var counter:partial.path("counters")){assertThat(counter.path("availability").asText()).isEqualTo("FORBIDDEN");assertThat(counter.path("value").isNull()).isTrue();}
        var reader=account("OPERATIONS_READER");assertThat(get(reader,"/api/v1/admin/metrics?"+period()).statusCode()).isEqualTo(200);problem(get(reader,"/api/v1/admin/metrics/export?"+period()),403,"ACCESS_DENIED");
    }

    @Test void operationalOrderFiltersReadOnlyTheSnapshotAndUnpayableReconciliationCannotForgeAnAccess() throws Exception {
        var operator=staff();var owner=account();var source=bundle(operator.id(),"PROTECTED");var order=prepared(owner,operator,source,1200,"EUR");
        var detail=get(operator,"/api/v1/admin/orders/"+order.id());assertThat(detail.statusCode()).isEqualTo(200);var value=tree(detail);assertThat(value.path("order").path("id").asText()).isEqualTo(order.id().toString());assertThat(value.path("ownerId").asText()).isEqualTo(owner.id().toString());assertThat(detail.headers().firstValue("ETag")).isEmpty();assertThat(value.path("payment").isNull()).isTrue();
        assertThat(detail.body().contains(owner.email())||detail.body().contains(PRIVATE)).isFalse();
        var page=tree(get(operator,"/api/v1/admin/orders?"+period()+"&paymentStatus=NOT_STARTED&currency=EUR&offerId="+order.snapshot().offerId()+"&page=0&pageSize=1"));assertThat(page.path("total").asInt()).isEqualTo(1);assertThat(page.path("items").get(0).path("id").asText()).isEqualTo(order.id().toString());
        var body=Map.of("reason","MANUAL_RECONCILIATION","expectedOrderRevision",order.revision());
        problem(mutate(operator,"POST","/api/v1/admin/orders/"+order.id()+"/reconciliation-requests",body,null,key()),409,"RECONCILIATION_UNAVAILABLE");
        assertThat(grants(order.id())).isZero();assertThat(orders.get(owner.id(),order.id()).paymentStatus()).isEqualTo("NOT_STARTED");
        problem(mutate(owner,"POST","/api/v1/admin/orders/"+order.id()+"/reconciliation-requests",body,null,key()),403,"ACCESS_DENIED");
    }

    @Test void durableInboxThenOperationalReconciliationAndRealSmtpRecoveryNeverDuplicateRightsOrConfirmation() throws Exception {
        var operator=staff();var owner=account();var source=bundle(operator.id(),"PROTECTED");var order=prepared(owner,operator,source,1200,"EUR");
        checkout.checkout(owner.id(),owner.id(),order.id(),EntityTags.forRevision("order",order.id(),order.revision()),key(),new CreateCheckout("p15-test-terms"));
        var session=PROVIDER.sessionForOrder(order.id());String event=event("checkout.session.completed",Map.of("id",session.id(),"object","checkout.session"));
        assertThat(webhook(event).statusCode()).isEqualTo(200);assertThat(grants(order.id())).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM stripe_event_inbox WHERE object_id=?",Integer.class,session.id())).isEqualTo(1);
        var current=orders.get(owner.id(),order.id());String reconciliation="/api/v1/admin/orders/"+order.id()+"/reconciliation-requests",actionKey=key();var action=Map.of("reason","MANUAL_RECONCILIATION","expectedOrderRevision",current.revision());
        var reconciliationReceipt=mutate(operator,"POST",reconciliation,action,null,actionKey);assertThat(reconciliationReceipt.statusCode()).isEqualTo(202);assertThat(text(reconciliationReceipt,"kind")).isEqualTo("ORDER");assertThat(text(reconciliationReceipt,"targetId")).isEqualTo(order.id().toString());
        var reconciliationReplay=mutate(operator,"POST",reconciliation,action,null,actionKey);assertThat(reconciliationReplay.statusCode()).isEqualTo(200);assertThat(text(reconciliationReplay,"targetId")).isEqualTo(order.id().toString());
        // No in-memory callback is needed after durable acknowledgement: explicitly resume the real worker.
        until(()->{payments.runOnce();return "READY".equals(orders.get(owner.id(),order.id()).fulfillmentStatus());},15);
        assertThat(grants(order.id())).isEqualTo(1);assertThat(access.covers(owner.id(),source.course().resourceId(),source.course().versionId(),"fr")).isTrue();
        String outbox=activationState(order.id());assertThat(outbox).isEqualTo("PENDING");
        int closed;try(var socket=new java.net.ServerSocket(0)){closed=socket.getLocalPort();}((JavaMailSenderImpl)mail).setPort(closed);
        until(()->{notifications.runOnce();return activationState(order.id()).equals("RETRY");},8);
        var incident=get(operator,"/api/v1/admin/incidents?"+period()+"&kind=NOTIFICATION&state=RETRY&pageSize=100");assertThat(incident.statusCode()).isEqualTo(200);UUID notification=jdbc.queryForObject("SELECT id FROM notification_outbox WHERE business_key=?",UUID.class,"access:activated:"+order.id());assertThat(incident.body().contains(notification.toString())).isTrue();
        String retryPath="/api/v1/admin/incidents/NOTIFICATION/"+notification+"/retry",retryKey=key();var retryBody=Map.of("reason","SMTP_RECOVERED","ackDuplicate",false);
        problem(mutate(account("EDITOR"),"POST",retryPath,retryBody,null,key()),403,"ACCESS_DENIED");
        var retry=mutate(operator,"POST",retryPath,retryBody,null,retryKey);assertThat(retry.statusCode()).isEqualTo(202);var replay=mutate(operator,"POST",retryPath,retryBody,null,retryKey);assertThat(replay.statusCode()).isEqualTo(200);assertThat(text(retry,"actionId")).isEqualTo(text(replay,"actionId"));
        ((JavaMailSenderImpl)mail).setPort(MAILPIT.getMappedPort(1025));until(()->{notifications.runOnce();return activationState(order.id()).equals("SENT");},8);
        var afterRecovery=mutate(operator,"POST",retryPath,retryBody,null,retryKey);assertThat(afterRecovery.statusCode()).isEqualTo(200);assertThat(text(afterRecovery,"actionId")).isEqualTo(text(retry,"actionId"));assertThat(jdbc.queryForObject("SELECT requeue_count FROM notification_outbox WHERE id=?",Integer.class,notification)).isEqualTo(1);
        assertThat(mutate(operator,"POST",reconciliation,action,null,actionKey).statusCode()).isEqualTo(200);
        assertThat(webhook(event).statusCode()).isEqualTo(200);for(int i=0;i<5;i++)payments.runOnce();
        assertThat(grants(order.id())).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE business_key=?",Integer.class,"access:activated:"+order.id())).isEqualTo(1);assertThat(PROVIDER.sessions.values().stream().filter(s->s.params().get("metadata[order_id]").equals(order.id().toString())).count()).isEqualTo(1);until(()->mailCount(owner.email())==1,5);
    }

    @Test void draftsArePerOperatorAndOnlyExplicitIdempotentPublicationCreatesVisibleReplyAndRealMail() throws Exception {
        var owner=account();var operator=staff();var other=staff();var ticket=createTicket(owner,"OTHER",null);UUID id=id(ticket);String path=draft(id);
        var empty=get(operator,path);assertThat(text(empty,"state")).isEqualTo("EMPTY");assertThat(tree(empty).path("updatedAt").isNull()).isTrue();
        problem(send(operator,"PUT",path,Map.of("text",PRIVATE),null,tag(empty),null,operator.id().toString()),403,"CSRF_INVALID");
        problem(send(operator,"PUT",path,Map.of("text",PRIVATE),csrf(operator),tag(empty),null,null),428,"ACCOUNT_CONTEXT_REQUIRED");
        problem(send(operator,"PUT",path,Map.of("text",PRIVATE),csrf(operator),tag(empty),null,owner.id().toString()),409,"ACCOUNT_CONTEXT_CHANGED");
        problem(mutate(operator,"PUT",path,Map.of("text",PRIVATE),null,null),428,"PRECONDITION_REQUIRED");
        problem(mutate(operator,"PUT",path,Map.of("text",PRIVATE,"authorId",owner.id()),tag(empty),null),400,"INVALID_REQUEST");
        var saved=mutate(operator,"PUT",path,Map.of("text",PRIVATE),tag(empty),null);assertThat(saved.statusCode()).isEqualTo(200);assertThat(text(saved,"state")).isEqualTo("DRAFT");
        assertThat(text(get(other,path),"text")).isEmpty();assertThat(messages(id)).isEqualTo(1);assertThat(supportEmails(id)).isZero();
        assertThat(get(owner,"/api/v1/me/support-tickets/"+id+"/messages").body().contains(PRIVATE)).isFalse();assertThat(get(owner,"/api/v1/me/support-tickets/"+id+"/events").body().contains(PRIVATE)).isFalse();
        problem(mutate(operator,"PUT",path,Map.of("text","Must not overwrite newer draft"),tag(empty),null),412,"REVISION_CONFLICT");
        var publishBody=Map.of("expectedTicketRevision",tree(ticket).path("revision").asLong(),"reason","Explicit operator publication");String idem=key();
        var published=mutate(operator,"POST",path+"/publications",publishBody,tag(saved),idem);assertThat(published.statusCode()).isEqualTo(201);assertThat(tree(published).path("draft").path("state").asText()).isEqualTo("PUBLISHED");
        var replay=mutate(operator,"POST",path+"/publications",publishBody,tag(saved),idem);assertThat(replay.statusCode()).isEqualTo(200);assertThat(tree(replay).path("message").path("id").asText()).isEqualTo(tree(published).path("message").path("id").asText());
        assertThat(messages(id)).isEqualTo(2);assertThat(supportEmails(id)).isEqualTo(1);until(()->{notifications.runOnce();return mailCount(owner.email())==1;},8);
        assertThat(get(owner,"/api/v1/me/support-tickets/"+id+"/messages").body().contains(PRIVATE)).isTrue();
        var noNewDraft=Map.of("expectedTicketRevision",tree(get(operator,"/api/v1/admin/support-tickets/"+id)).path("revision").asLong(),"reason","A published draft requires a new edit");
        problem(mutate(operator,"POST",path+"/publications",noNewDraft,tag(get(operator,path)),key()),409,"SUPPORT_DRAFT_NOT_PUBLISHABLE");
    }

    @Test void internalNotesAssignmentsAndMeasuredZeroRemainDistinctFromPublicReplyAndUnknownTime() throws Exception {
        var owner=account();var operator=staff();var assignee=account("SUPPORT_OPERATOR");var editor=account("EDITOR");var ticket=createTicket(owner,"OTHER",null);UUID id=id(ticket);String admin="/api/v1/admin/support-tickets/"+id;
        var note=mutate(operator,"POST",admin+"/internal-notes",Map.of("text",PRIVATE),null,key());assertThat(note.statusCode()).isEqualTo(201);assertThat(text(note,"authorId")).isEqualTo(operator.id().toString());assertThat(Instant.parse(text(note,"createdAt"))).isNotNull();
        String timeKey=key();var zeroBody=Map.of("minutes",0,"reason","Explicit zero-minute measurement");var zero=mutate(operator,"POST",admin+"/time-entries",zeroBody,null,timeKey);assertThat(zero.statusCode()).isEqualTo(201);assertThat(tree(zero).path("minutes").asInt()).isZero();assertThat(text(zero,"authorId")).isEqualTo(operator.id().toString());
        var same=mutate(operator,"POST",admin+"/time-entries",zeroBody,null,timeKey);assertThat(same.statusCode()).isEqualTo(200);assertThat(id(same)).isEqualTo(id(zero));var known=tree(get(operator,"/api/v1/admin/metrics?"+period()));assertThat(known.path("recordedSupportMinutes").asText()).isEqualTo("0");assertThat(known.path("supportMinutesAvailability").asText()).isEqualTo("AVAILABLE");
        assertThat(mutate(operator,"POST",admin+"/time-entries",Map.of("minutes",7,"reason","Seven measured minutes"),null,key()).statusCode()).isEqualTo(201);assertThat(tree(get(operator,"/api/v1/admin/metrics?"+period())).path("recordedSupportMinutes").asText()).isEqualTo("7");
        problem(mutate(operator,"POST",admin+"/time-entries",Map.of("minutes",1441,"reason","Out of range"),null,key()),400,"VALIDATION_FAILED");
        var unassigned=get(operator,admin+"/assignment");assertThat(tree(unassigned).path("assigneeId").isNull()).isTrue();var assigned=mutate(operator,"PUT",admin+"/assignment",Map.of("assigneeId",assignee.id(),"reason","Explicit eligible operator"),tag(unassigned),key());assertThat(assigned.statusCode()).isEqualTo(200);
        problem(mutate(operator,"PUT",admin+"/assignment",Map.of("assigneeId",editor.id(),"reason","Editor is not support staff"),tag(assigned),key()),409,"ASSIGNEE_UNAVAILABLE");
        for(String route:List.of("internal-notes","time-entries","reply-draft","assignment"))problem(get(owner,admin+"/"+route),403,"ACCESS_DENIED");
        assertThat(get(owner,"/api/v1/me/support-tickets/"+id).body().contains(PRIVATE)).isFalse();assertThat(get(owner,"/api/v1/me/support-tickets/"+id+"/messages").body().contains(PRIVATE)).isFalse();assertThat(messages(id)).isEqualTo(1);assertThat(supportEmails(id)).isZero();
    }

    @Test void concurrentDraftsUseRealEtagsAndStaleTicketRevisionDoesNotDiscardTheDraft() throws Exception {
        var owner=account();var operator=staff();var ticket=createTicket(owner,"OTHER",null);UUID id=id(ticket);String path=draft(id);var initial=get(operator,path);String token=csrf(operator);
        try(var pool=Executors.newFixedThreadPool(2)){var barrier=new CyclicBarrier(2);var first=pool.submit(()->{barrier.await();return send(operator,"PUT",path,Map.of("text","Concurrent first"),token,tag(initial),null,operator.id().toString());});var second=pool.submit(()->{barrier.await();return send(operator,"PUT",path,Map.of("text","Concurrent second"),token,tag(initial),null,operator.id().toString());});var a=first.get(15,TimeUnit.SECONDS);var b=second.get(15,TimeUnit.SECONDS);assertThat(List.of(a.statusCode(),b.statusCode())).containsExactlyInAnyOrder(200,412);var winner=a.statusCode()==200?a:b;assertThat(text(get(operator,path),"text")).isEqualTo(text(winner,"text"));}
        String admin="/api/v1/admin/support-tickets/"+id;var changed=mutate(operator,"POST",admin+"/state-changes",Map.of("state","IN_PROGRESS","reason","Change ticket before publication"),tag(ticket),key());assertThat(changed.statusCode()).isEqualTo(200);
        var saved=get(operator,path);problem(mutate(operator,"POST",path+"/publications",Map.of("expectedTicketRevision",0,"reason","Stale ticket publication"),tag(saved),key()),412,"REVISION_CONFLICT");assertThat(text(get(operator,path),"text")).isEqualTo(text(saved,"text"));assertThat(messages(id)).isEqualTo(1);assertThat(supportEmails(id)).isZero();
    }

    @Test void contentReportUsesExactIdentityAndCorrectionDoesNotCopySupportTextOrRewritePersonalMethods() throws Exception {
        var operator=staff();var owner=account();var editor=account("EDITOR");var bundle=bundle(operator.id(),"FREE");var source=bundle.activity();
        var translation=editorial.translate(operator.id(),source.id(),contentTag(source),new CreateTranslation("en","p15-en-"+key(),"English fixture","English summary",source.document(),"Explicit translation"));translation=publish(operator.id(),translation);
        source=editorial.get(operator.id(),source.id());var fields=methodFields(PRIVATE);var personal=methods.create(owner.id(),owner.id(),new CreateMethod(fields));
        Map<String,Object> context=Map.of("locale","fr","resourceId",source.resourceId(),"versionId",source.versionId(),"revisionId",source.publishedRevisionId());String idem=key();
        var ticket=createTicket(owner,"CONTENT",context,idem);var repeat=createTicket(owner,"CONTENT",context,idem);assertThat(id(repeat)).isEqualTo(id(ticket));
        var cases=tree(get(editor,"/api/v1/admin/content-cases?"+period()+"&resourceId="+source.resourceId()));assertThat(cases.path("total").asInt()).isEqualTo(1);var listed=cases.path("items").get(0);UUID caseId=UUID.fromString(listed.path("id").asText());assertThat(listed.path("sourceRevisionId").asText()).isEqualTo(source.publishedRevisionId().toString());
        var current=get(editor,"/api/v1/admin/content-cases/"+caseId);assertThat(current.body().contains(PRIVATE)||current.body().contains(USER_MESSAGE)).isFalse();problem(get(editor,"/api/v1/admin/support-tickets/"+id(ticket)),403,"ACCESS_DENIED");
        var corrected=editorial.revise(operator.id(),source.id(),contentTag(source),new SaveRevision(source.title(),"Reviewed minor correction",source.document(),"Correct the reported source"));
        assertThat(editorial.get(operator.id(),translation.id()).state()).isEqualTo(EditorialState.STALE);
        problem(mutate(editor,"PATCH","/api/v1/admin/content-cases/"+caseId,Map.of("state","RESOLVED","correctedRevisionId",corrected.currentRevisionId(),"reason","A draft cannot count as a published correction"),tag(current),key()),409,"CONTENT_CASE_CONFLICT");
        assertThat(editorial.get(operator.id(),source.id()).publishedRevisionId()).isEqualTo(source.publishedRevisionId());
        corrected=publish(operator.id(),corrected);
        var resolve=mutate(editor,"PATCH","/api/v1/admin/content-cases/"+caseId,Map.of("state","RESOLVED","correctedRevisionId",corrected.currentRevisionId(),"reason","Link actual corrected revision"),tag(current),key());assertThat(resolve.statusCode()).isEqualTo(200);assertThat(text(resolve,"state")).isEqualTo("RESOLVED");assertThat(text(resolve,"correctedRevisionId")).isEqualTo(corrected.currentRevisionId().toString());
        assertThat(methods.get(owner.id(),personal.id()).text()).isEqualTo(PRIVATE);assertThat(editorial.get(operator.id(),source.id()).publishedRevisionId()).isEqualTo(corrected.publishedRevisionId());assertThat(editorial.get(operator.id(),source.id()).revision()).isEqualTo(corrected.revision());
    }

    @Test void auditIsMetadataOnlyAndKeepsActorDateObjectAndFiltersWithoutPrivateTextOrProviderSecrets() throws Exception {
        var owner=account();var operator=staff();var ticket=createTicket(owner,"OTHER",null);UUID id=id(ticket);var note=mutate(operator,"POST","/api/v1/admin/support-tickets/"+id+"/internal-notes",Map.of("text",PRIVATE),null,key());assertThat(note.statusCode()).isEqualTo(201);
        var audit=get(operator,"/api/v1/admin/audit?"+period()+"&actorId="+operator.id()+"&page=0&pageSize=1");assertThat(audit.statusCode()).isEqualTo(200);assertThat(tree(audit).path("total").asInt()).isGreaterThanOrEqualTo(1);assertThat(tree(audit).path("items").size()).isEqualTo(1);
        assertThat(audit.body().contains(PRIVATE)||audit.body().contains(USER_MESSAGE)||audit.body().contains(owner.email())||audit.body().contains(PROVIDER.key)||audit.body().contains(WEBHOOK)||audit.body().contains("checkout.stripe.com")).isFalse();
        var row=tree(audit).path("items").get(0);assertThat(row.path("actorId").asText()).isEqualTo(operator.id().toString());assertThat(row.path("reasonCode").asText()).isNotBlank();assertThat(Instant.parse(row.path("occurredAt").asText())).isNotNull();
        var empty=tree(get(operator,"/api/v1/admin/audit?"+period()+"&objectId="+UUID.randomUUID()));assertThat(empty.path("total").asInt()).isZero();
    }

    @Test void businessFactsAreTransactionalDeduplicatedAndSurviveDeletionWithoutContainingPersonalText() throws Exception {
        var operator=staff();var owner=account();var bundle=bundle(operator.id(),"FREE");var enrollment=learning.enroll(owner.id(),owner.id(),new EnrollCourse(bundle.course().resourceId(),bundle.course().versionId(),"fr")).value();
        var visit=new VisitActivity(bundle.activity().resourceId(),bundle.activity().versionId(),"fr");learning.visit(owner.id(),owner.id(),enrollment.summary().id(),visit);learning.visit(owner.id(),owner.id(),enrollment.summary().id(),visit);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operations_activity_starts WHERE enrollment_id=? AND activity_version_id=?",Integer.class,enrollment.summary().id(),bundle.activity().versionId())).isEqualTo(1);
        var rolledBack=new TransactionTemplate(transactions).execute(status->{var created=methods.create(owner.id(),owner.id(),new CreateMethod(methodFields("Rolled back isolated text")));status.setRollbackOnly();return created;});
        assertThat(rolledBack).isNotNull();assertThat(jdbc.queryForObject("SELECT count(*) FROM personal_methods WHERE id=?",Integer.class,rolledBack.id())).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM operations_personal_revision_events WHERE object_id=?",Integer.class,rolledBack.id())).isZero();
        var saved=methods.create(owner.id(),owner.id(),new CreateMethod(methodFields(PRIVATE)));var unchanged=methods.update(owner.id(),owner.id(),saved.id(),EntityTags.forRevision("personal-method",saved.id(),saved.revision()),new UpdateMethod(methodFields(PRIVATE)));
        assertThat(unchanged.revision()).isEqualTo(saved.revision());
        var revised=methods.update(owner.id(),owner.id(),saved.id(),EntityTags.forRevision("personal-method",saved.id(),saved.revision()),new UpdateMethod(methodFields("Explicit changed personal text")));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operations_personal_revision_events WHERE object_type='METHOD' AND object_id=?",Integer.class,saved.id())).isEqualTo(2);
        methods.delete(owner.id(),owner.id(),saved.id(),EntityTags.forRevision("personal-method",saved.id(),revised.revision()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operations_personal_revision_events WHERE object_type='METHOD' AND object_id=?",Integer.class,saved.id())).isEqualTo(2);
        var note=learning.createNote(owner.id(),owner.id(),new CreateActivityNote(bundle.activity().resourceId(),bundle.activity().versionId(),"fr",PRIVATE));learning.updateNote(owner.id(),owner.id(),note.id(),EntityTags.forRevision("activity-note",note.id(),note.revision()),new UpdateActivityNote(PRIVATE));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operations_personal_revision_events WHERE object_type='NOTE' AND object_id=?",Integer.class,note.id())).isEqualTo(1);
        String stored=jdbc.queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(e))::text,'[]') FROM operations_personal_revision_events e WHERE owner_id=?",String.class,owner.id());assertThat(stored.contains(PRIVATE)).isFalse();
        var metrics=tree(get(operator,"/api/v1/admin/metrics?"+period()));assertThat(metric(metrics,"PERSONAL_REVISIONS_SAVED").path("availability").asText()).isEqualTo("PARTIAL");assertThat(metric(metrics,"PERSONAL_REVISIONS_SAVED").path("definition").path("coverage").asText()).isNotBlank();
    }

    @Test void revokedSupportPermissionWhileWaitingOnTicketCannotSaveAHiddenDraft() throws Exception {
        var owner=account();var operator=account("SUPPORT_OPERATOR");var ticket=createTicket(owner,"OTHER",null);UUID id=id(ticket);var draft=get(operator,draft(id));String token=csrf(operator);
        try(var connection=POSTGRES.createConnection("")){connection.setAutoCommit(false);try(var lock=connection.prepareStatement("SELECT id FROM support_tickets WHERE id=? FOR UPDATE")){lock.setObject(1,id);lock.executeQuery();}
            try(var pool=Executors.newSingleThreadExecutor()){var pending=pool.submit(()->send(operator,"PUT",draft(id),Map.of("text","Must remain absent after revocation"),token,tag(draft),null,operator.id().toString()));until(()->Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%support_tickets%')",Boolean.class)),5);assertThat(jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),updated_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP) WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code='SUPPORT_OPERATOR') AND revoked_at IS NULL",operator.id())).isEqualTo(1);connection.commit();problem(pending.get(20,TimeUnit.SECONDS),403,"ACCESS_DENIED");}
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM support_reply_drafts WHERE ticket_id=? AND author_id=?",Integer.class,id,operator.id())).isZero();assertThat(messages(id)).isEqualTo(1);
    }

    private Account staff() throws Exception{return account("OPERATIONS_MANAGER","SUPPORT_OPERATOR","EDITOR","COMMERCE_MANAGER","PAYMENTS_OPERATOR","REFUND_OPERATOR");}
    private Bundle bundle(UUID actor,String access){var document=document(access);var activity=publish(actor,editorial.create(actor,new CreateContent(ResourceKind.ACTIVITY,"fr","p15-activity-"+key(),"Fictitious P15 activity","Isolated technical fixture",document.objective(),document.expectedResult(),document,List.of(),"P15 fixture")));var module=parent(actor,ResourceKind.MODULE,activity.versionId(),access);return new Bundle(parent(actor,ResourceKind.COURSE,module.versionId(),access),activity);}
    private ContentDocument document(String access){return new ContentDocument("Respect supplied facts","A checked result",List.of(),List.of(new ContentBlock("PARAGRAPH","Isolated P15 task",null)),null,new Exercise("Check supplied facts","Only supplied facts are authoritative"),List.of(new QuizQuestion("facts","Use which facts?",List.of("Known","Invented"),0,"Use known facts",1)),List.of(new RubricCriterion("facts","Supplied facts",1,false)),access,List.of(),List.of());}
    private ContentView parent(UUID actor,ResourceKind kind,UUID child,String access){var d=new ContentDocument("Follow exact versions","A declared result",List.of(),List.of(new ContentBlock("PARAGRAPH","Isolated programme",null)),null,null,List.of(),List.of(),access,List.of(),List.of());return publish(actor,editorial.create(actor,new CreateContent(kind,"fr","p15-parent-"+key(),"Fictitious P15 "+kind,"Technical fixture",d.objective(),d.expectedResult(),d,List.of(child),"P15 programme")));}
    private ContentView publish(UUID actor,ContentView value){value=editorial.transition(actor,value.id(),contentTag(value),new TransitionContent(EditorialState.TO_REVIEW,"Review fixture",null));value=editorial.transition(actor,value.id(),contentTag(value),new TransitionContent(EditorialState.READY,"Ready fixture",value.sourceRevisionId()));return editorial.publish(actor,value.id(),contentTag(value),new PublishContent(value.currentRevisionId(),"Publish exact fixture"));}
    private OrderView prepared(Account owner,Account operator,Bundle source,long amount,String currency){var fields=new OfferFields(List.of(new OfferCopy("fr","Offre fictive P15","Only isolated technical data")),List.of(new OfferResourceInput(source.course().resourceId(),source.course().versionId())),List.of("fr"),new Money(amount,currency),new OfferTax("INCLUSIVE",List.of(new LocalizedText("fr","Fiscalité fictive"))),new OfferConditions(new OfferPeriod("FIXED",30),new OfferPeriod("NONE",null),"PINNED",new OfferSupport("NONE",List.of()),false,"p15-test-terms",List.of(new LocalizedText("fr","Fictitious terms"))));var offer=offers.create(operator.id(),operator.id(),new CreateOffer("p15-"+key(),"COURSE",fields,"Technical fixture"));offer=offers.activate(operator.id(),operator.id(),offer.id(),EntityTags.forRevision("offer",offer.id(),offer.revision()),new ChangeOfferState("Activate isolated fixture"));return orders.create(owner.id(),owner.id(),key(),new CreateOrder(offer.id(),offer.revision(),"fr","p15-test-terms")).value();}
    private OrderView paid(Account owner,Account operator,Bundle source,long amount,String currency){var order=prepared(owner,operator,source,amount,currency);checkout.checkout(owner.id(),owner.id(),order.id(),EntityTags.forRevision("order",order.id(),order.revision()),key(),new CreateCheckout("p15-test-terms"));until(()->{payments.runOnce();return "READY".equals(orders.get(owner.id(),order.id()).fulfillmentStatus());},15);return orders.get(owner.id(),order.id());}
    private HttpResponse<String> createTicket(Account owner,String category,Map<String,Object> context) throws Exception{return createTicket(owner,category,context,key());}
    private HttpResponse<String> createTicket(Account owner,String category,Map<String,Object> context,String idem) throws Exception{var body=new LinkedHashMap<String,Object>();body.put("category",category);body.put("subject","Isolated support task");body.put("message",USER_MESSAGE);body.put("locale","fr");body.put("context",context);body.put("attachmentIds",List.of());var result=mutate(owner,"POST","/api/v1/me/support-tickets",body,null,idem);assertThat(result.statusCode()).isIn(200,201);return result;}
    private MethodFields methodFields(String text){return new MethodFields("Personal P15 method","fr",text,new MethodParameters("Objective","","Available facts","","Text","",""),null,PRIVATE,"fixture");}
    private void grant(Account actor,String permission){jdbc.update("INSERT INTO roles(id,code) VALUES(?,?)",UUID.randomUUID(),"TEST_P15_"+actor.id().toString().replace("-","").toUpperCase(Locale.ROOT));jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?",UUID.randomUUID(),actor.id(),"TEST_P15_"+actor.id().toString().replace("-","").toUpperCase(Locale.ROOT));jdbc.update("INSERT INTO role_permissions(id,role_id,permission_id) SELECT ?,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code=? AND p.code=?",UUID.randomUUID(),"TEST_P15_"+actor.id().toString().replace("-","").toUpperCase(Locale.ROOT),permission);}
    private int messages(UUID ticket){return jdbc.queryForObject("SELECT count(*) FROM support_messages WHERE ticket_id=?",Integer.class,ticket);}
    private int supportEmails(UUID ticket){return jdbc.queryForObject("SELECT count(*) FROM notification_outbox o JOIN support_messages m ON o.business_key='support:reply:'||m.id::text WHERE m.ticket_id=?",Integer.class,ticket);}
    private int grants(UUID order){return jdbc.queryForObject("SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id=?",Integer.class,order);}
    private String activationState(UUID order){return jdbc.queryForObject("SELECT status FROM notification_outbox WHERE business_key=?",String.class,"access:activated:"+order);}
    private JsonNode currency(JsonNode value,String currency){for(var row:value.path("currencies"))if(row.path("currency").asText().equals(currency))return row;throw new AssertionError("Expected currency bucket "+currency);}
    private JsonNode metric(JsonNode value,String code){for(var row:value.path("counts"))if(row.path("code").asText().equals(code))return row;throw new AssertionError("Expected metric "+code);}
    private String draft(UUID ticket){return "/api/v1/admin/support-tickets/"+ticket+"/reply-draft";}
    private String period(){Instant now=Instant.now();return "from="+q(now.minus(Duration.ofDays(1)).toString())+"&to="+q(now.plus(Duration.ofDays(1)).toString());}
    private static String q(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8);}
    private static String key(){return UUID.randomUUID().toString();}
    private static String contentTag(ContentView value){return EntityTags.forRevision("content",value.id(),value.revision());}
    private static void until(BooleanSupplier condition,int seconds){long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);while(System.nanoTime()<end){if(condition.getAsBoolean())return;try{Thread.sleep(25);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Interrupted isolated verification");}}assertThat(condition.getAsBoolean()).as("Expected isolated persisted state").isTrue();}
    private Account account(String...roles) throws Exception{UUID id=UUID.randomUUID();String email="p15-"+id+"@fixture.invalid",password="P15-test-only-"+key();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,?,'ACTIVE')",id,email,encoder.encode(password));jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),id);var all=new HashSet<>(Arrays.asList(roles));all.add("LEARNER");for(String role:all)assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?",UUID.randomUUID(),id,role)).isEqualTo(1);var actor=new Account(HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build(),id,email);var request=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf(actor)).POST(HttpRequest.BodyPublishers.ofString("email="+q(email)+"&password="+q(password))).build();assertThat(actor.http().send(request,HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(200);return actor;}
    private String event(String type,Map<String,Object> object) throws Exception{return mapper.writeValueAsString(Map.of("id","evt_"+key().replace("-",""),"object","event","type",type,"api_version",StripeSettings.API_VERSION,"created",Instant.now().getEpochSecond(),"livemode",false,"data",Map.of("object",object)));}
    private HttpResponse<String> webhook(String body) throws Exception{long stamp=Instant.now().getEpochSecond();var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(WEBHOOK.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));String signature=HexFormat.of().formatHex(mac.doFinal((stamp+"."+body).getBytes(StandardCharsets.UTF_8)));return HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/v1/webhooks/stripe")).header("Content-Type","application/json").header("Stripe-Signature","t="+stamp+",v1="+signature).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());}
    private HttpResponse<String> mutate(Account actor,String method,String path,Object body,String etag,String idem) throws Exception{return send(actor,method,path,body,csrf(actor),etag,idem,actor.id().toString());}
    private HttpResponse<String> send(Account actor,String method,String path,Object body,String token,String etag,String idem,String context) throws Exception{var request=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(25)).header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));if(token!=null)request.header("X-CSRF-TOKEN",token);if(etag!=null)request.header("If-Match",etag);if(idem!=null)request.header("Idempotency-Key",idem);if(context!=null)request.header("X-Account-Context",context);return actor.http().send(request.build(),HttpResponse.BodyHandlers.ofString());}
    private HttpResponse<String> get(Account actor,String path) throws Exception{return actor.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(25)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
    private String csrf(Account actor) throws Exception{return text(get(actor,"/api/v1/auth/csrf"),"token");}
    private JsonNode tree(HttpResponse<String> response) throws Exception{return mapper.readTree(response.body());}
    private String text(HttpResponse<String> response,String field) throws Exception{return tree(response).path(field).asText();}
    private UUID id(HttpResponse<String> response) throws Exception{return UUID.fromString(text(response,"id"));}
    private static String tag(HttpResponse<?> response){return response.headers().firstValue("ETag").orElseThrow();}
    private void problem(HttpResponse<String> response,int status,String code) throws Exception{assertThat(response.statusCode()).isEqualTo(status);assertThat(text(response,"code")).isEqualTo(code);assertThat(response.body().contains(PROVIDER.key)||response.body().contains(WEBHOOK)).isFalse();}
    private int mailCount(String recipient){try{var response=HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://"+MAILPIT.getHost()+":"+MAILPIT.getMappedPort(8025)+"/api/v1/messages")).GET().build(),HttpResponse.BodyHandlers.ofString());int result=0;for(var message:mapper.readTree(response.body()).path("messages"))for(var to:message.path("To"))if(to.path("Address").asText().equalsIgnoreCase(recipient))result++;return result;}catch(Exception e){throw new IllegalStateException("Read isolated Mailpit failed");}}
    private static List<List<String>> csvRows(String text){var rows=new ArrayList<List<String>>();var row=new ArrayList<String>();var cell=new StringBuilder();boolean quote=false;for(int i=0;i<text.length();i++){char c=text.charAt(i);if(c=='"'){if(quote&&i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else quote=!quote;}else if(c==','&&!quote){row.add(cell.toString());cell.setLength(0);}else if(c=='\n'&&!quote){row.add(cell.toString());cell.setLength(0);rows.add(List.copyOf(row));row.clear();}else if(c!='\r'||quote)cell.append(c);}if(!cell.isEmpty()||!row.isEmpty()){row.add(cell.toString());rows.add(List.copyOf(row));}return rows;}
    private record Account(HttpClient http,UUID id,String email){}
    private record Bundle(ContentView course,ContentView activity){}
}
