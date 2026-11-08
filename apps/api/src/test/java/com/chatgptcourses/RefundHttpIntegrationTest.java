package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import com.chatgptcourses.access.EntitlementAccess;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.service.AssetTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.commerce.service.*;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.methods.service.MethodService;
import com.chatgptcourses.methods.service.MethodTypes.*;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.inbox.PaymentInboxWorker;
import com.chatgptcourses.payments.refunds.RefundWorker;
import com.chatgptcourses.payments.service.CheckoutService;
import com.chatgptcourses.payments.service.PaymentTypes.CreateCheckout;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.projects.service.ProjectTypes;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.money.Money;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** PostgreSQL, real HTTP filters, pinned Stripe SDK/signature verification and private S3 are exercised.
 * Only the remote Stripe HTTP transport is a loopback double; no real key, account or payment is used. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false",
    "MAIL_MODE=disabled", "NOTIFICATION_OUTBOX_ENABLED=false", "COMMERCE_ENABLED=true", "STRIPE_ENABLED=true", "STRIPE_MODE=test",
    "STRIPE_READ_TIMEOUT=3s", "PAYMENT_INBOX_ENABLED=false", "courses.payments.refunds.worker-enabled=false", "debug=false"
})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RefundHttpIntegrationTest {
    static final RefundStripeProvider PROVIDER = new RefundStripeProvider();
    private static final String WEBHOOK = "whsec_" + UUID.randomUUID().toString().replace("-", "");
    private static final String ACCESS = UUID.randomUUID().toString().replace("-", "");
    private static final String SECRET = UUID.randomUUID().toString() + UUID.randomUUID();
    private static final String AUTH = "{\"identities\":[{\"name\":\"p13-test\",\"credentials\":[{\"accessKey\":\"" + ACCESS + "\",\"secretKey\":\"" + SECRET + "\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Tagging\",\"Write\"]}]}";
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @Container static final GenericContainer<?> S3 = new GenericContainer<>(DockerImageName.parse("chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59"))
        .withExposedPorts(8333).withTmpFs(Map.of("/data", "rw"))
        .withCopyToContainer(Transferable.of(AUTH.getBytes(StandardCharsets.UTF_8), 0444), "/run/secrets/s3.local.json")
        .withCommand("server", "-dir=/data", "-ip=127.0.0.1", "-ip.bind=0.0.0.0", "-master.volumeSizeLimitMB=64", "-master.telemetry=false", "-volume.max=24", "-filer", "-s3", "-s3.port=8333", "-s3.port.iceberg=0", "-s3.port.lance=0", "-s3.config=/run/secrets/s3.local.json")
        .waitingFor(Wait.forHttp("/healthz").forPort(8333).forStatusCode(200).withStartupTimeout(Duration.ofSeconds(90)));

    @DynamicPropertySource static void config(DynamicPropertyRegistry r) {
        r.add("POSTGRES_HOST", POSTGRES::getHost); r.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        r.add("POSTGRES_DB", POSTGRES::getDatabaseName); r.add("POSTGRES_USER", POSTGRES::getUsername); r.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey); r.add("COMMERCE_ALLOWED_CURRENCIES", () -> "EUR");
        r.add("STRIPE_SECRET_KEY", () -> PROVIDER.key); r.add("STRIPE_WEBHOOK_SECRET", () -> WEBHOOK);
        r.add("STRIPE_ACCOUNT_ID", () -> RefundStripeProvider.ACCOUNT); r.add("STRIPE_API_BASE", PROVIDER::base);
        r.add("courses.assets.enabled", () -> true); r.add("courses.assets.internal-endpoint", RefundHttpIntegrationTest::s3Endpoint); r.add("courses.assets.external-endpoint", RefundHttpIntegrationTest::s3Endpoint);
        r.add("courses.assets.access-key", () -> ACCESS); r.add("courses.assets.secret-key", () -> SECRET);
        r.add("courses.assets.editorial-bucket", () -> "p13-editorial"); r.add("courses.assets.private-bucket", () -> "p13-private");
        r.add("courses.assets.region", () -> "us-east-1"); r.add("courses.assets.path-style", () -> true);
        r.add("courses.assets.download-ttl-seconds", () -> 2); r.add("courses.assets.staging-cleanup-worker-enabled", () -> false);
    }
    @BeforeAll static void buckets() {
        try (var client = S3Client.builder().region(Region.US_EAST_1).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS, SECRET))).endpointOverride(URI.create(s3Endpoint())).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).httpClientBuilder(UrlConnectionHttpClient.builder()).build()) {
            for (String name : List.of("p13-editorial", "p13-private")) client.createBucket(b -> b.bucket(name));
        }
    }
    @BeforeEach void reset() { PROVIDER.resetFaults(); }
    @AfterAll static void closeProvider() { PROVIDER.close(); }
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper mapper; @Autowired PasswordEncoder encoder;
    @Autowired EditorialService editorial; @Autowired OfferService offers; @Autowired OrderService orders; @Autowired CheckoutService checkout;
    @Autowired PaymentInboxWorker payments; @Autowired RefundWorker refunds; @Autowired EntitlementAccess rights;
    @Autowired AssetService assets; @Autowired LearningService learning; @Autowired ProjectService projects; @Autowired MethodService methods;
    @LocalServerPort int port;

    @Test void requestOwnershipCsrfContextStrictDtosAndDurableIdempotencyAreRealHttpGuards() throws Exception {
        var f = fixture(false); var other = account(); var editor = account("EDITOR");
        problem(get(other, context(f.order())), 404, "RESOURCE_NOT_FOUND");
        problem(mutate(other, "POST", requests(f.order()), Map.of("reason", "Owner request"), null, key()), 404, "RESOURCE_NOT_FOUND");
        problem(get(editor, "/api/v1/admin/orders/" + f.order().id() + "/refund-context"), 403, "ACCESS_DENIED");
        var body = Map.of("reason", "Please review this isolated purchase");
        problem(send(f.owner(), "POST", requests(f.order()), body, null, null, key(), f.owner().id().toString()), 403, "CSRF_INVALID");
        problem(send(f.owner(), "POST", requests(f.order()), body, csrf(f.owner()), null, key(), null), 428, "ACCOUNT_CONTEXT_REQUIRED");
        problem(send(f.owner(), "POST", requests(f.order()), body, csrf(f.owner()), null, key(), other.id().toString()), 409, "ACCOUNT_CONTEXT_CHANGED");
        problem(mutate(f.owner(), "POST", requests(f.order()), Map.of("reason", "Review", "paymentIntentId", "pi_injected", "ownerId", other.id()), null, key()), 400, "INVALID_REQUEST");
        String idem = key(); var created = mutate(f.owner(), "POST", requests(f.order()), body, null, idem); assertThat(created.statusCode()).isEqualTo(201);
        var replay = mutate(f.owner(), "POST", requests(f.order()), body, null, idem); assertThat(replay.statusCode()).isEqualTo(200); assertThat(id(replay)).isEqualTo(id(created));
        problem(mutate(f.owner(), "POST", requests(f.order()), Map.of("reason", "Different body"), null, idem), 409, "CONFLICT");
        assertThat(get(f.owner(), "/api/v1/me/refund-requests/" + id(created)).headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(created.body().contains(PROVIDER.sessionForOrder(f.order().id()).intentId())).isFalse();
        assertThat(created.body().contains("ownerId")).isFalse();
        problem(get(other, "/api/v1/me/refund-requests/" + id(created)), 404, "RESOURCE_NOT_FOUND");
    }

    @Test void unpaidOrderHasNoRefundableMoneyAndCannotCreateARequest() throws Exception {
        var staff = account("EDITOR", "COMMERCE_MANAGER", "REFUND_OPERATOR"); var owner = account();
        var source = bundle(staff.id(), false); int before = PROVIDER.refundPosts.get(), sessions = PROVIDER.sessionPosts.get();
        var order = prepared(owner, staff, List.of(source.course()), 1200);
        for (var response : List.of(get(owner, context(order)), get(staff, "/api/v1/admin/orders/" + order.id() + "/refund-context"))) {
            assertThat(response.statusCode()).isEqualTo(200); var value = tree(response);
            assertThat(value.path("paymentStatus").asText()).isEqualTo("NOT_STARTED");
            assertThat(value.path("paidAmountMinor").asLong()).isZero(); assertThat(value.path("confirmedRefundedMinor").asLong()).isZero();
            assertThat(value.path("reservedMinor").asLong()).isZero(); assertThat(value.path("availableMinor").asLong()).isZero();
            assertThat(value.path("canRequest").asBoolean()).isFalse(); assertThat(value.path("requestUnavailableReason").asText()).isEqualTo("NOT_PAID");
        }
        problem(mutate(owner, "POST", requests(order), Map.of("reason", "Review this unpaid isolated order"), null, key()), 409, "REFUND_NOT_AVAILABLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refund_requests WHERE order_id=?", Integer.class, order.id())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refund_reservations WHERE order_id=?", Integer.class, order.id())).isZero();
        assertThat(PROVIDER.refundPosts.get()).isEqualTo(before); assertThat(PROVIDER.sessionPosts.get()).isEqualTo(sessions);
    }

    @Test void contradictoryFactsAfterConfirmationKeepConsumedMoneyAndOriginsRevoked() throws Exception {
        for (long amount : List.of(300L, 1200L)) {
            var f = fixture(false); var confirmed = approve(f, amount, List.of(allocation(f.order(), 0, amount, "REVOKE")));
            // An already approved second command must also remain blocked when the first enters review.
            var pending = amount < 1200 ? approve(f, 100, List.of(allocation(f.order(), 0, 100, "KEEP"))) : null;
            var succeeded = execute(f, confirmed, key()); assertThat(text(succeeded, "state")).isEqualTo("SUCCEEDED");
            assertThat(tree(succeeded).path("confirmedAt").isString()).isTrue();
            String confirmedAt = text(succeeded, "confirmedAt"); assertThat(confirmedAt).isNotBlank();
            var provider = PROVIDER.refunds.values().stream().filter(r -> r.intent.equals(PROVIDER.sessionForOrder(f.order().id()).intentId())).findFirst().orElseThrow();
            PROVIDER.status(provider.id, "failed"); int posts = PROVIDER.refundPosts.get();
            assertThat(webhook(event("refund.updated", PROVIDER.refundJson(provider))).statusCode()).isEqualTo(200);
            until(() -> state(f, id(confirmed)).equals("NEEDS_REVIEW"));
            var reviewed = operation(f, id(confirmed)); assertThat(text(reviewed, "confirmedAt")).isEqualTo(confirmedAt);
            assertThat(tree(reviewed).path("canExecute").asBoolean()).isFalse();
            var balance = tree(get(f.owner(), context(f.order())));
            long reserved = pending == null ? 0 : 100;
            assertThat(balance.path("paidAmountMinor").asLong()).isEqualTo(1200);
            assertThat(balance.path("confirmedRefundedMinor").asLong()).isEqualTo(amount);
            assertThat(balance.path("reservedMinor").asLong()).isEqualTo(reserved);
            assertThat(balance.path("availableMinor").asLong()).isEqualTo(1200 - amount - reserved);
            assertThat(balance.path("reconciliationState").asText()).isEqualTo("NEEDS_REVIEW"); assertThat(balance.path("canRequest").asBoolean()).isFalse();
            problem(mutate(f.owner(), "POST", requests(f.order()), Map.of("reason", "Another isolated request"), null, key()), 409, "REFUND_NOT_AVAILABLE");
            if (pending != null) problem(execute(f, operation(f, id(pending)), key()), 409, "REFUND_AMOUNT_UNAVAILABLE");
            else problem(execute(f, reviewed, key()), 409, "REFUND_OPERATION_NOT_EXECUTABLE");
            String old = event("checkout.session.completed", Map.of("id", PROVIDER.sessionForOrder(f.order().id()).id(), "object", "checkout.session", "payment_status", "paid"));
            assertThat(webhook(old).statusCode()).isEqualTo(200);
            for (int i = 0; i < 4; i++) { payments.runOnce(); refunds.runOnce(); }
            assertThat(PROVIDER.refundPosts.get()).isEqualTo(posts); assertThat(revoked(f.order().id())).isEqualTo(1);
            assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isFalse();
            assertThat(tree(get(f.owner(), context(f.order()))).path("confirmedRefundedMinor").asLong()).isEqualTo(amount);
            assertThat(orders.get(f.owner().id(), f.order().id()).paymentStatus()).isEqualTo("PAID");
        }
    }

    @Test void pendingThenFailedPartialKeepRetainsAccessAndReleasesOnlyItsReservation() throws Exception {
        var f = fixture(false); var op = approve(f, 400, List.of(allocation(f.order(), 0, 400, "KEEP")));
        PROVIDER.nextRefundStatus = "pending"; var pending = execute(f, op, key()); assertThat(text(pending, "state")).isEqualTo("PENDING");
        var before = tree(get(f.owner(), context(f.order()))); assertThat(before.path("reservedMinor").asLong()).isEqualTo(400); assertThat(before.path("confirmedRefundedMinor").asLong()).isZero();
        assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isTrue();
        String providerId = PROVIDER.refunds.values().stream().filter(r -> r.intent.equals(PROVIDER.sessionForOrder(f.order().id()).intentId())).findFirst().orElseThrow().id;
        PROVIDER.status(providerId, "failed"); reconcile(f, id(op)); until(() -> state(f, id(op)).equals("FAILED"));
        var after = tree(get(f.owner(), context(f.order()))); assertThat(after.path("reservedMinor").asLong()).isZero(); assertThat(after.path("availableMinor").asLong()).isEqualTo(1200); assertThat(after.path("confirmedRefundedMinor").asLong()).isZero();
        assertThat(orders.get(f.owner().id(), f.order().id()).paymentStatus()).isEqualTo("PAID");
        assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isTrue();
    }

    @Test void partialConfirmationAndDuplicateSignedRefundEventsApplyOnlyTheSelectedOriginOnce() throws Exception {
        var f = fixture(true); var op = approve(f, 300, List.of(allocation(f.order(), 1, 300, "REVOKE"))); int posts = PROVIDER.refundPosts.get();
        var success = execute(f, op, key()); assertThat(text(success, "state")).isEqualTo("SUCCEEDED");
        var provider = PROVIDER.refunds.values().stream().filter(r -> r.intent.equals(PROVIDER.sessionForOrder(f.order().id()).intentId())).findFirst().orElseThrow();
        String event = event("refund.updated", PROVIDER.refundJson(provider));
        assertThat(webhook(event).statusCode()).isEqualTo(200); assertThat(webhook(event).statusCode()).isEqualTo(200);
        for (int i = 0; i < 8; i++) refunds.runOnce();
        assertThat(PROVIDER.refundPosts.get() - posts).isEqualTo(1);
        assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isTrue();
        assertThat(rights.covers(f.owner().id(), f.b().course().resourceId(), f.b().course().versionId(), "fr")).isFalse();
        assertThat(revoked(f.order().id())).isEqualTo(1); assertThat(grants(f.order().id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE business_key=? AND event_type='REFUND_UPDATED'", Integer.class, "refund:confirmed:" + id(op))).isEqualTo(1);
        assertThat(tree(get(f.owner(), context(f.order()))).path("confirmedRefundedMinor").asLong()).isEqualTo(300);
        assertThat(orders.get(f.owner().id(), f.order().id()).paymentStatus()).isEqualTo("PAID");
    }

    @Test void fullPackRefundKeepsEarlierIndividualOriginAndPersonalWorkButRefusesNewPrivateS3Links() throws Exception {
        var staff = account("EDITOR", "COMMERCE_MANAGER", "PAYMENTS_OPERATOR", "REFUND_OPERATOR"); var owner = account();
        var a = bundle(staff.id(), false); var b = bundle(staff.id(), true);
        var old = paid(owner, staff, List.of(a.course()), 600); var pack = paid(owner, staff, List.of(a.course(), b.course()), 1200);
        var f = new Fixture(owner, staff, a, b, pack);
        var enrollment = learning.enroll(owner.id(), owner.id(), new EnrollCourse(b.course().resourceId(), b.course().versionId(), "fr")).value();
        var note = learning.createNote(owner.id(), owner.id(), new CreateActivityNote(b.activity().resourceId(), b.activity().versionId(), "fr", "Private note retained after refund"));
        var progress = learning.progress(owner.id(), b.activity().resourceId(), enrollment.summary().id(), b.activity().versionId());
        learning.setProgress(owner.id(), owner.id(), b.activity().resourceId(), EntityTags.forRevision("activity-progress", progress.id(), progress.revision()), new SetActivityProgress(enrollment.summary().id(), b.activity().versionId(), true, true, "fr"));
        var attempt = learning.submitQuiz(owner.id(), owner.id(), b.activity().resourceId(), new SubmitQuiz(enrollment.summary().id(), b.activity().versionId(), b.activity().publishedRevisionId(), "fr", UUID.randomUUID(), List.of(new QuizAnswer("facts", 0))));
        var project = projects.create(owner.id(), owner.id(), new ProjectTypes.CreateProject(UUID.randomUUID(), b.activity().resourceId(), b.activity().versionId(), b.activity().publishedRevisionId(), "fr", enrollment.summary().id(), new ProjectTypes.ProjectFields("Retained production", "fr", "", "", "", "", "", "", "", "Personal original text"), "DRAFT")).value();
        var method = methods.create(owner.id(), owner.id(), new CreateMethod(new MethodFields("Retained method", "fr", "My personal prompt", new MethodParameters("", "", "", "", "", "", ""), null, "Private notes", null)));
        var access = new AssetAccessContext("fr", b.activity().resourceId(), b.activity().versionId(), enrollment.summary().id());
        String linkPath = "/api/v1/assets/" + b.assetId() + "/download-access";
        var issued = mutate(owner, "POST", linkPath, access, null, null); assertThat(issued.statusCode()).isEqualTo(200);
        var oldLink = mapper.readValue(issued.body(), DownloadAccess.class); assertThat(download(oldLink).statusCode()).isEqualTo(200);
        var op = approve(f, 1200, List.of(allocation(pack, 0, 1200, "REVOKE"), allocation(pack, 1, 0, "REVOKE"))); execute(f, op, key());
        assertThat(revoked(pack.id())).isEqualTo(2); assertThat(revoked(old.id())).isZero();
        assertThat(rights.covers(owner.id(), a.activity().resourceId(), a.activity().versionId(), "fr")).isTrue();
        assertThat(rights.covers(owner.id(), b.activity().resourceId(), b.activity().versionId(), "fr")).isFalse();
        problem(mutate(owner, "POST", linkPath, access, null, null), 403, "ACCESS_DENIED");
        untilDatabaseExpiry(oldLink.expiresAt()); assertThat(download(oldLink).statusCode()).isBetween(400, 499);
        assertThat(learning.note(owner.id(), note.id()).text()).isEqualTo(note.text());
        assertThat(learning.progress(owner.id(), b.activity().resourceId(), enrollment.summary().id(), b.activity().versionId()).completedAt()).isNotNull();
        assertThat(learning.attempt(owner.id(), attempt.id()).scorePoints()).isEqualTo(attempt.scorePoints());
        assertThat(projects.get(owner.id(), project.id()).fields().externalText()).isEqualTo("Personal original text");
        assertThat(methods.get(owner.id(), method.id()).text()).isEqualTo("My personal prompt");
        var entitlements = get(owner, "/api/v1/me/entitlements?locale=fr&page=0&pageSize=100"); assertThat(entitlements.statusCode()).isEqualTo(200);
        assertThat(java.util.stream.StreamSupport.stream(tree(entitlements).path("items").spliterator(), false).map(item -> item.path("state").asText()).toList()).contains("ACTIVE", "REVOKED");
    }

    @Test void invalidAllocationsStalePreviewAndConcurrentDecisionsCannotOverReserveTheOrder() throws Exception {
        var f = fixture(true); var request = request(f); String path = "/api/v1/admin/refund-requests/" + id(request);
        problem(mutate(f.staff(), "POST", path + "/preview", Map.of("amountMinor", 100, "allocations", List.of(allocation(f.order(), 0, 99, "KEEP"))), tag(request), null), 400, "INVALID_REFUND_ALLOCATION");
        problem(mutate(f.staff(), "POST", path + "/preview", Map.of("amountMinor", -1, "allocations", List.of(allocation(f.order(), 0, -1, "KEEP"))), tag(request), null), 400, "VALIDATION_FAILED");
        problem(mutate(f.staff(), "POST", path + "/preview", Map.of("amountMinor", 1300, "allocations", List.of(allocation(f.order(), 0, 1300, "KEEP"))), tag(request), null), 409, "REFUND_AMOUNT_UNAVAILABLE");
        problem(mutate(f.staff(), "POST", path + "/preview", Map.of("amountMinor", 100, "allocations", List.of(Map.of("orderResourceId", UUID.randomUUID(), "amountMinor", 100, "accessAction", "KEEP"))), tag(request), null), 400, "INVALID_REFUND_ALLOCATION");
        var allocations = List.of(allocation(f.order(), 0, 800, "KEEP")); var preview = preview(f, request, 800, allocations);
        var wrong = decision(preview, "0".repeat(64)); problem(mutate(f.staff(), "POST", path + "/decision", wrong, tag(request), key()), 409, "REFUND_PREVIEW_CHANGED");
        problem(mutate(f.staff(), "POST", path + "/decision", decision(preview, null), null, key()), 428, "PRECONDITION_REQUIRED");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CyclicBarrier(2); Callable<HttpResponse<String>> command = () -> { barrier.await(5, TimeUnit.SECONDS); return mutate(f.staff(), "POST", path + "/decision", decision(preview, null), tag(request), key()); };
            var first = pool.submit(command); var second = pool.submit(command); var statuses = List.of(first.get(20, TimeUnit.SECONDS).statusCode(), second.get(20, TimeUnit.SECONDS).statusCode());
            assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1); assertThat(statuses).allMatch(s -> s == 200 || s == 409 || s == 412);
        }
        assertThat(tree(get(f.owner(), context(f.order()))).path("reservedMinor").asLong()).isEqualTo(800);
        var next = request(f); var tooMuch = Map.of("amountMinor", 500, "allocations", List.of(allocation(f.order(), 0, 500, "KEEP")));
        problem(mutate(f.staff(), "POST", "/api/v1/admin/refund-requests/" + id(next) + "/preview", tooMuch, tag(next), null), 409, "REFUND_AMOUNT_UNAVAILABLE");
    }

    @Test void ambiguousProviderTimeoutKeepsReservationAndRecoversByGetWithoutAnotherFinancialPost() throws Exception {
        var f = fixture(false); var op = approve(f, 1200, List.of(allocation(f.order(), 0, 1200, "REVOKE"))); int before = PROVIDER.refundPosts.get();
        var committedAtNetwork = new java.util.concurrent.atomic.AtomicBoolean();
        PROVIDER.beforeRefund = params -> committedAtNetwork.set(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM refund_operations WHERE id=? AND state='CALLING')", Boolean.class, UUID.fromString(params.get("metadata[refund_operation_id]")))));
        PROVIDER.delayNextRefund = true; String idem = key(); var ambiguous = execute(f, op, idem);
        assertThat(ambiguous.statusCode()).isEqualTo(202); assertThat(text(ambiguous, "state")).isEqualTo("UNKNOWN");
        assertThat(committedAtNetwork.get()).isTrue();
        assertThat(tree(get(f.owner(), context(f.order()))).path("reservedMinor").asLong()).isEqualTo(1200);
        reconcile(f, id(op)); until(() -> state(f, id(op)).equals("SUCCEEDED"));
        var now = operation(f, id(op)); var replay = execute(f, now, idem); assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(PROVIDER.refundPosts.get() - before).isEqualTo(1); assertThat(revoked(f.order().id())).isEqualTo(1);
        assertThat(PROVIDER.allAuthorized).isTrue(); assertThat(PROVIDER.allNoConnect).isTrue(); assertThat(PROVIDER.allRefundParametersStable).isTrue(); assertThat(PROVIDER.signatureVersionChecks.get()).isPositive();
    }

    @Test void concurrentExecuteKeysCannotSubmitTheSameCommittedRefundTwice() throws Exception {
        var f = fixture(false); var op = approve(f, 300, List.of(allocation(f.order(), 0, 300, "KEEP"))); int before = PROVIDER.refundPosts.get();
        PROVIDER.entered = new CountDownLatch(1); PROVIDER.release = new CountDownLatch(1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var first = pool.submit(() -> execute(f, op, key()));
            assertThat(PROVIDER.entered.await(8, TimeUnit.SECONDS)).isTrue();
            HttpResponse<String> second;
            try { second = execute(f, op, key()); }
            finally { PROVIDER.release.countDown(); }
            assertThat(second.statusCode()).isIn(200, 202, 409, 412);
            assertThat(first.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        } finally { PROVIDER.release.countDown(); }
        assertThat(PROVIDER.refundPosts.get() - before).isEqualTo(1);
        assertThat(PROVIDER.refundKeys.values().stream().filter(refund -> PROVIDER.refunds.get(refund).intent.equals(PROVIDER.sessionForOrder(f.order().id()).intentId())).count()).isEqualTo(1);
        assertThat(tree(get(f.owner(), context(f.order()))).path("confirmedRefundedMinor").asLong()).isEqualTo(300);
        assertThat(revoked(f.order().id())).isZero();
    }

    @Test void dashboardPartialWaitsForExplicitAccessDecisionAndCumulativeFullRevokesOnlyThatOrder() throws Exception {
        var f = fixture(true); var foreign = fixture(false);
        var foreignOperation = approve(foreign, 100, List.of(allocation(foreign.order(), 0, 100, "KEEP")));
        int before = PROVIDER.refundPosts.get(); var session = PROVIDER.sessionForOrder(f.order().id());
        // Dashboard metadata is editable text, never authority for choosing a local order or operation.
        var metadataCases = List.of(
            Map.of("refund_operation_id", "copied-from-dashboard", "order_id", "not-an-order-uuid"),
            Map.of("refund_operation_id", key(), "order_id", key()),
            Map.of("refund_operation_id", id(foreignOperation).toString(), "order_id", foreign.order().id().toString()));
        for (var metadata : metadataCases) {
            var external = PROVIDER.externalRefund(session, 100, "succeeded", metadata);
            assertThat(webhook(event("refund.created", PROVIDER.refundJson(external))).statusCode()).isEqualTo(200);
        }
        until(() -> operations(f).path("items").size() == 3);
        for (var op : operations(f).path("items")) {
            assertThat(op.path("origin").asText()).isEqualTo("STRIPE_DASHBOARD"); assertThat(op.path("orderId").asText()).isEqualTo(f.order().id().toString());
            assertThat(op.path("state").asText()).isEqualTo("SUCCEEDED"); assertThat(op.path("accessState").asText()).isEqualTo("NEEDS_REVIEW");
        }
        assertThat(revoked(f.order().id())).isZero();
        assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isTrue();
        assertThat(rights.covers(f.owner().id(), f.b().course().resourceId(), f.b().course().versionId(), "fr")).isTrue();
        assertThat(tree(get(f.owner(), context(f.order()))).path("reconciliationState").asText()).isEqualTo("NEEDS_REVIEW");
        for (var op : operations(f).path("items")) {
            var current = operation(f, UUID.fromString(op.path("id").asText()));
            var resolved = mutate(f.staff(), "POST", "/api/v1/admin/refunds/" + id(current) + "/access-decision", Map.of("reason", "Explicit isolated goodwill decision", "allocations", List.of(allocation(f.order(), 1, 100, "KEEP"))), tag(current), key());
            assertThat(resolved.statusCode()).isEqualTo(200); assertThat(text(resolved, "accessState")).isEqualTo("KEPT");
        }
        var remainder = PROVIDER.externalRefund(session, 900, "succeeded"); assertThat(webhook(event("charge.refunded", Map.of("id", session.chargeId(), "object", "charge", "payment_intent", session.intentId()))).statusCode()).isEqualTo(200);
        until(() -> revoked(f.order().id()) == 2); assertThat(PROVIDER.refundPosts.get()).isEqualTo(before);
        assertThat(tree(get(f.owner(), context(f.order()))).path("confirmedRefundedMinor").asLong()).isEqualTo(1200);
        assertThat(state(foreign, id(foreignOperation))).isEqualTo("PREPARED");
        assertThat(tree(get(foreign.owner(), context(foreign.order()))).path("reservedMinor").asLong()).isEqualTo(100);
        assertThat(revoked(foreign.order().id())).isZero();
        assertThat(rights.covers(foreign.owner().id(), foreign.a().course().resourceId(), foreign.a().course().versionId(), "fr")).isTrue();
    }

    @Test void rejectionAndCancelBeforeSubmissionAreAuditedWithoutCallingStripe() throws Exception {
        var f = fixture(false); int before = PROVIDER.refundPosts.get(); var request = request(f);
        var rejected = mutate(f.staff(), "POST", "/api/v1/admin/refund-requests/" + id(request) + "/decision", Map.of("outcome", "REJECT", "reason", "Explicit technical rejection", "allocations", List.of()), tag(request), key());
        assertThat(rejected.statusCode()).isEqualTo(200); assertThat(tree(rejected).path("request").path("state").asText()).isEqualTo("REJECTED"); assertThat(tree(rejected).path("operation").isNull()).isTrue();
        var op = approve(f, 300, List.of(allocation(f.order(), 0, 300, "KEEP")));
        var canceled = mutate(f.staff(), "POST", "/api/v1/admin/refunds/" + id(op) + "/cancel", Map.of("reason", "Cancel before provider submission"), tag(op), key());
        assertThat(canceled.statusCode()).isEqualTo(200); assertThat(text(canceled, "state")).isEqualTo("CANCELED");
        assertThat(tree(get(f.owner(), context(f.order()))).path("availableMinor").asLong()).isEqualTo(1200); assertThat(PROVIDER.refundPosts.get()).isEqualTo(before); assertThat(revoked(f.order().id())).isZero();
    }

    @Test void revokedOperatorPermissionWhileWaitingForOrderPreventsAnyProviderCall() throws Exception {
        var f = fixture(false); var op = approve(f, 300, List.of(allocation(f.order(), 0, 300, "KEEP"))); int before = PROVIDER.refundPosts.get();
        try (var connection = POSTGRES.createConnection("")) {
            connection.setAutoCommit(false); try (var lock = connection.prepareStatement("SELECT id FROM orders WHERE id=? FOR UPDATE")) { lock.setObject(1, f.order().id()); lock.executeQuery(); }
            try (var pool = Executors.newSingleThreadExecutor()) {
                var pending = pool.submit(() -> execute(f, op, key()));
                waitUntil(() -> Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%orders%')", Boolean.class)), 5);
                assertThat(jdbc.update("UPDATE user_roles SET revoked_at=clock_timestamp(),updated_at=greatest(created_at,clock_timestamp()) WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code='REFUND_OPERATOR') AND revoked_at IS NULL", f.staff().id())).isEqualTo(1);
                connection.commit(); problem(pending.get(20, TimeUnit.SECONDS), 403, "ACCESS_DENIED");
            }
        }
        assertThat(PROVIDER.refundPosts.get()).isEqualTo(before);
        var owned = get(f.owner(), "/api/v1/me/refunds/" + id(op)); assertThat(owned.statusCode()).isEqualTo(200); assertThat(text(owned, "state")).isEqualTo("PREPARED");
    }

    @Test void expiredSubmissionMaintenanceLocksOwnerThenOrderBeforeTouchingTheOperation() throws Exception {
        var f = fixture(false); var op = approve(f, 300, List.of(allocation(f.order(), 0, 300, "KEEP"))); UUID operation = id(op);
        String intent = PROVIDER.sessionForOrder(f.order().id()).intentId();
        var parameters = new com.chatgptcourses.payments.refunds.RefundTypes.RefundParameters(operation, f.order().id(), intent, 300, "EUR");
        String json = mapper.writeValueAsString(parameters); int before = PROVIDER.refundPosts.get();
        // A durable pre-network CALLING record whose process died. The PostgreSQL deadline is explicitly historical.
        assertThat(jdbc.update("UPDATE refund_operations SET state='CALLING',payment_intent_id=?,request_json=?::jsonb,request_hash=?,lease_id=?,lease_until=clock_timestamp()-interval '1 second',updated_at=greatest(created_at,clock_timestamp()),revision=revision+1 WHERE id=?", intent, json, java.security.MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)), UUID.randomUUID(), operation)).isEqualTo(1);
        try (var ownerLock = POSTGRES.createConnection(""); var orderLock = POSTGRES.createConnection("")) {
            ownerLock.setAutoCommit(false); orderLock.setAutoCommit(false);
            try (var q = ownerLock.prepareStatement("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE")) { q.setObject(1, f.owner().id()); q.executeQuery(); }
            try (var q = orderLock.prepareStatement("SELECT id FROM orders WHERE id=? FOR UPDATE")) { q.setObject(1, f.order().id()); q.executeQuery(); }
            try (var pool = Executors.newSingleThreadExecutor()) {
                var maintenance = pool.submit(() -> refunds.runOnce());
                try {
                    waitUntil(() -> waitingOn("user_accounts"), 5); assertOperationUnlocked(operation);
                    assertThat(jdbc.queryForObject("SELECT state FROM refund_operations WHERE id=?", String.class, operation)).isEqualTo("CALLING");
                    ownerLock.commit();
                    waitUntil(() -> waitingOn("orders"), 5); assertOperationUnlocked(operation);
                    assertThat(jdbc.queryForObject("SELECT state FROM refund_operations WHERE id=?", String.class, operation)).isEqualTo("CALLING");
                } finally { ownerLock.commit(); orderLock.commit(); }
                maintenance.get(15, TimeUnit.SECONDS);
            }
        }
        assertThat(state(f, operation)).isEqualTo("UNKNOWN");
        assertThat(tree(get(f.owner(), context(f.order()))).path("reservedMinor").asLong()).isEqualTo(300);
        assertThat(PROVIDER.refundPosts.get()).isEqualTo(before);
    }

    @Test void oldSignedCheckoutConfirmationAfterRefundCannotRestoreItsRevokedOrigin() throws Exception {
        var f = fixture(false); var op = approve(f, 1200, List.of(allocation(f.order(), 0, 1200, "REVOKE"))); execute(f, op, key());
        var session = PROVIDER.sessionForOrder(f.order().id()); String old = event("checkout.session.completed", Map.of("id", session.id(), "object", "checkout.session", "payment_status", "paid"));
        assertThat(webhook(old).statusCode()).isEqualTo(200); assertThat(webhook(old).statusCode()).isEqualTo(200);
        for (int i = 0; i < 10; i++) { payments.runOnce(); refunds.runOnce(); }
        assertThat(revoked(f.order().id())).isEqualTo(1); assertThat(grants(f.order().id())).isEqualTo(1);
        assertThat(rights.covers(f.owner().id(), f.a().course().resourceId(), f.a().course().versionId(), "fr")).isFalse();
        assertThat(orders.get(f.owner().id(), f.order().id()).paymentStatus()).isEqualTo("PAID");
        assertThat(tree(get(f.owner(), context(f.order()))).path("confirmedRefundedMinor").asLong()).isEqualTo(1200);
    }

    private Fixture fixture(boolean pack) throws Exception {
        var staff = account("EDITOR", "COMMERCE_MANAGER", "PAYMENTS_OPERATOR", "REFUND_OPERATOR"); var owner = account();
        var a = bundle(staff.id(), false); var b = pack ? bundle(staff.id(), false) : null;
        var order = paid(owner, staff, pack ? List.of(a.course(), b.course()) : List.of(a.course()), 1200);
        return new Fixture(owner, staff, a, b, order);
    }
    private OrderView paid(Account owner, Account staff, List<ContentView> sources, long amount) {
        var order = prepared(owner, staff, sources, amount);
        checkout.checkout(owner.id(), owner.id(), order.id(), EntityTags.forRevision("order", order.id(), order.revision()), key(), new CreateCheckout("p13-test-terms"));
        waitUntil(() -> { payments.runOnce(); return "READY".equals(orders.get(owner.id(), order.id()).fulfillmentStatus()); }, 15);
        return orders.get(owner.id(), order.id());
    }
    private OrderView prepared(Account owner, Account staff, List<ContentView> sources, long amount) {
        var fields = new OfferFields(List.of(new OfferCopy("fr", "Offre fictive P13", "Uniquement une recette technique isolée")), sources.stream().map(c -> new OfferResourceInput(c.resourceId(), c.versionId())).toList(), List.of("fr"), new Money(amount, "EUR"), new OfferTax("INCLUSIVE", List.of(new LocalizedText("fr", "Fiscalité fictive"))), new OfferConditions(new OfferPeriod("FIXED", 30), new OfferPeriod("NONE", null), "PINNED", new OfferSupport("NONE", List.of()), false, "p13-test-terms", List.of(new LocalizedText("fr", "Conditions fictives de test"))));
        var offer = offers.create(staff.id(), staff.id(), new CreateOffer("p13-" + key(), sources.size() == 1 ? "COURSE" : "PACK", fields, "Isolated refund fixture"));
        offer = offers.activate(staff.id(), staff.id(), offer.id(), EntityTags.forRevision("offer", offer.id(), offer.revision()), new ChangeOfferState("Activate isolated test offer"));
        return orders.create(owner.id(), owner.id(), key(), new CreateOrder(offer.id(), offer.revision(), "fr", "p13-test-terms")).value();
    }
    private Bundle bundle(UUID editor, boolean withAsset) throws Exception {
        ContentDocument document = document(); var activity = editorial.create(editor, new CreateContent(ResourceKind.ACTIVITY, "fr", "p13-" + key(), "Fictitious P13 exercise", "Isolated test source", document.objective(), document.expectedResult(), document, List.of(), "Create test fixture"));
        UUID assetId = null;
        if (withAsset) {
            byte[] bytes = "Private editorial P13 fixture".getBytes(StandardCharsets.UTF_8);
            var intent = assets.createEditorialIntent(editor, editor, new EditorialUploadRequest(activity.resourceId(), activity.versionId(), "fr", "p13-private.txt", "text/plain", bytes.length));
            var upload = HttpRequest.newBuilder(URI.create(intent.uploadUrl())).PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)); intent.headers().forEach(upload::header);
            assertThat(HttpClient.newHttpClient().send(upload.build(), HttpResponse.BodyHandlers.discarding()).statusCode()).isBetween(200, 299);
            assetId = assets.confirmEditorial(editor, editor, intent.asset().id()).id();
            var d = new ContentDocument(document.objective(), document.expectedResult(), document.prerequisites(), document.blocks(), document.estimatedMinutes(), document.exercise(), document.quiz(), document.rubric(), document.access(), List.of(new MediaReference(assetId, "FILE", true, "Private text resource")), document.relatedResourceIds(), document.methodDefinition(), document.quizPolicy(), document.projectPolicy());
            activity = editorial.revise(editor, activity.id(), contentTag(activity), new SaveRevision(activity.title(), activity.summary(), d, "Attach verified private file"));
        }
        activity = publish(editor, activity); var module = parent(editor, ResourceKind.MODULE, activity.versionId()); var course = parent(editor, ResourceKind.COURSE, module.versionId());
        return new Bundle(course, activity, assetId);
    }
    private ContentDocument document() throws Exception {
        try (var input = new ClassPathResource("editorial/project-presets.json").getInputStream()) {
            for (var preset : mapper.readTree(input)) if (preset.path("caseCode").asText().equals("BR01") && preset.path("locale").asText().equals("fr")) {
                var policy = mapper.treeToValue(preset.path("policy"), ProjectTypes.ProjectPolicy.class); var rubric = Arrays.asList(mapper.treeToValue(preset.path("rubric"), RubricCriterion[].class));
                return new ContentDocument("Respect supplied facts", "A checked proposal", List.of(), List.of(new ContentBlock("PARAGRAPH", "Explicit fictional P13 brief", null)), null, new Exercise("Prepare a proposal", "Read the supplied facts"), List.of(new QuizQuestion("facts", "Which answer uses supplied facts?", List.of("Known", "Invented"), 0, "Use known facts", 1)), rubric, "PROTECTED", List.of(), List.of(), null, null, policy);
            }
        }
        throw new IllegalStateException("Explicit project fixture missing");
    }
    private ContentView parent(UUID actor, ResourceKind kind, UUID child) {
        var d = new ContentDocument("Follow exact test versions", "A declared result", List.of(), List.of(new ContentBlock("PARAGRAPH", "Isolated test programme", null)), null, null, List.of(), List.of(), "PROTECTED", List.of(), List.of());
        return publish(actor, editorial.create(actor, new CreateContent(kind, "fr", "p13-" + key(), "Fictitious P13 " + kind, "Test only", d.objective(), d.expectedResult(), d, List.of(child), "Test programme")));
    }
    private ContentView publish(UUID actor, ContentView value) {
        value = editorial.transition(actor, value.id(), contentTag(value), new TransitionContent(EditorialState.TO_REVIEW, "Review fixture", null));
        value = editorial.transition(actor, value.id(), contentTag(value), new TransitionContent(EditorialState.READY, "Ready fixture", null));
        return editorial.publish(actor, value.id(), contentTag(value), new PublishContent(value.currentRevisionId(), "Publish exact test revision"));
    }
    private HttpResponse<String> request(Fixture f) throws Exception {
        var response = mutate(f.owner(), "POST", requests(f.order()), Map.of("reason", "Review isolated test purchase"), null, key()); assertThat(response.statusCode()).isEqualTo(201); return response;
    }
    private HttpResponse<String> approve(Fixture f, long amount, List<Map<String, Object>> allocations) throws Exception {
        var request = request(f); var preview = preview(f, request, amount, allocations);
        var result = mutate(f.staff(), "POST", "/api/v1/admin/refund-requests/" + id(request) + "/decision", decision(preview, null), tag(request), key());
        assertThat(result.statusCode()).isEqualTo(200); UUID id = UUID.fromString(tree(result).path("operation").path("id").asText()); return operation(f, id);
    }
    private HttpResponse<String> preview(Fixture f, HttpResponse<String> request, long amount, List<Map<String, Object>> allocations) throws Exception {
        var result = mutate(f.staff(), "POST", "/api/v1/admin/refund-requests/" + id(request) + "/preview", Map.of("amountMinor", amount, "allocations", allocations), tag(request), null); assertThat(result.statusCode()).isEqualTo(200); return result;
    }
    private Map<String, Object> decision(HttpResponse<String> preview, String fingerprint) throws Exception {
        var json = tree(preview); return Map.of("outcome", "APPROVE", "reason", "Explicit isolated refund decision", "previewFingerprint", fingerprint == null ? json.path("fingerprint").asText() : fingerprint, "amountMinor", json.path("amountMinor").asLong(), "allocations", mapper.convertValue(json.path("allocations"), List.class));
    }
    private static Map<String, Object> allocation(OrderView order, int line, long amount, String action) { return Map.of("orderResourceId", order.snapshot().resources().get(line).id(), "amountMinor", amount, "accessAction", action); }
    private HttpResponse<String> execute(Fixture f, HttpResponse<String> operation, String idem) throws Exception { return mutate(f.staff(), "POST", "/api/v1/admin/refunds/" + id(operation) + "/execute", Map.of("reason", "Execute isolated TEST refund"), tag(operation), idem); }
    private void reconcile(Fixture f, UUID id) throws Exception { var value = operation(f, id); var r = mutate(f.staff(), "POST", "/api/v1/admin/refunds/" + id + "/reconciliation-requests", Map.of("reason", "Retrieve current provider facts"), tag(value), key()); assertThat(r.statusCode()).isEqualTo(202); }
    private HttpResponse<String> operation(Fixture f, UUID id) throws Exception { var r = get(f.staff(), "/api/v1/admin/refunds/" + id); assertThat(r.statusCode()).isEqualTo(200); return r; }
    private JsonNode operations(Fixture f) { try { return tree(get(f.staff(), "/api/v1/admin/refunds?orderId=" + f.order().id() + "&page=0&pageSize=100")); } catch (Exception e) { throw new IllegalStateException("Read isolated refund state failed"); } }
    private String state(Fixture f, UUID id) { try { return text(operation(f, id), "state"); } catch (Exception e) { throw new IllegalStateException("Read isolated refund state failed"); } }
    private void until(BooleanSupplier condition) { waitUntil(() -> { refunds.runOnce(); return condition.getAsBoolean(); }, 20); }
    private static void waitUntil(BooleanSupplier condition, int seconds) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) { if (condition.getAsBoolean()) return; try { Thread.sleep(25); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Interrupted isolated test"); } }
        assertThat(condition.getAsBoolean()).as("Expected durable test state within bounded wait").isTrue();
    }
    private boolean waitingOn(String relation) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE ?)", Boolean.class, "%" + relation + "%")); }
    private void assertOperationUnlocked(UUID operation) throws Exception {
        try (var probe = POSTGRES.createConnection("")) {
            probe.setAutoCommit(false);
            try (var statement = probe.prepareStatement("SELECT id FROM refund_operations WHERE id=? FOR UPDATE NOWAIT")) { statement.setObject(1, operation); try (var rows = statement.executeQuery()) { assertThat(rows.next()).isTrue(); } }
            probe.rollback();
        }
    }
    private void untilDatabaseExpiry(Instant expiry) { waitUntil(() -> Boolean.TRUE.equals(jdbc.queryForObject("SELECT clock_timestamp()>?::timestamptz+interval '1 second'", Boolean.class, java.sql.Timestamp.from(expiry))), 8); }
    private int revoked(UUID order) { return jdbc.queryForObject("SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id=? AND g.revoked_at IS NOT NULL", Integer.class, order); }
    private int grants(UUID order) { return jdbc.queryForObject("SELECT count(*) FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id=?", Integer.class, order); }
    private Account account(String... roles) throws Exception {
        UUID id = UUID.randomUUID(); String email = "p13-" + id + "@fixture.invalid", password = "P13-test-only-" + key();
        jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,?,'ACTIVE')", id, email, encoder.encode(password));
        jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')", UUID.randomUUID(), id);
        var granted = new HashSet<>(Arrays.asList(roles)); granted.add("LEARNER");
        for (String role : granted) assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?", UUID.randomUUID(), id, role)).isEqualTo(1);
        var browser = new Account(HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build(), id);
        var login = HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type", "application/x-www-form-urlencoded").header("X-CSRF-TOKEN", csrf(browser)).POST(HttpRequest.BodyPublishers.ofString("email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8))).build();
        assertThat(browser.http().send(login, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(200); return browser;
    }
    private String event(String type, Map<String, Object> object) throws Exception { return mapper.writeValueAsString(Map.of("id", "evt_" + key().replace("-", ""), "object", "event", "type", type, "api_version", StripeSettings.API_VERSION, "created", Instant.now().minusSeconds(60).getEpochSecond(), "livemode", false, "data", Map.of("object", object))); }
    private HttpResponse<String> webhook(String body) throws Exception {
        long timestamp = Instant.now().getEpochSecond(); var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(WEBHOOK.getBytes(StandardCharsets.UTF_8), "HmacSHA256")); String signature = HexFormat.of().formatHex(mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/v1/webhooks/stripe")).header("Content-Type", "application/json").header("Stripe-Signature", "t=" + timestamp + ",v1=" + signature).POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> mutate(Account who, String method, String path, Object body, String etag, String idem) throws Exception { return send(who, method, path, body, csrf(who), etag, idem, who.id().toString()); }
    private HttpResponse<String> send(Account who, String method, String path, Object body, String token, String etag, String idem, String context) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (token != null) request.header("X-CSRF-TOKEN", token); if (etag != null) request.header("If-Match", etag); if (idem != null) request.header("Idempotency-Key", idem); if (context != null) request.header("X-Account-Context", context);
        return who.http().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> get(Account who, String path) throws Exception { return who.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
    private HttpResponse<byte[]> download(DownloadAccess value) throws Exception { return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(value.url())).GET().build(), HttpResponse.BodyHandlers.ofByteArray()); }
    private String csrf(Account who) throws Exception { return text(get(who, "/api/v1/auth/csrf"), "token"); }
    private void problem(HttpResponse<String> response, int status, String code) throws Exception { assertThat(response.statusCode()).isEqualTo(status); assertThat(text(response, "code")).isEqualTo(code); assertThat(response.body().contains(PROVIDER.key)).isFalse(); assertThat(response.body().contains(WEBHOOK)).isFalse(); }
    private JsonNode tree(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    private String text(HttpResponse<String> response, String field) throws Exception { return tree(response).path(field).asText(); }
    private UUID id(HttpResponse<String> response) { try { return UUID.fromString(text(response, "id")); } catch (Exception failure) { throw new IllegalStateException("Expected isolated response identifier"); } }
    private static String tag(HttpResponse<String> response) { return response.headers().firstValue("ETag").orElseThrow(); }
    private static String contentTag(ContentView value) { return EntityTags.forRevision("content", value.id(), value.revision()); }
    private static String context(OrderView order) { return "/api/v1/me/orders/" + order.id() + "/refund-context"; }
    private static String requests(OrderView order) { return "/api/v1/me/orders/" + order.id() + "/refund-requests"; }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String key() { return UUID.randomUUID().toString(); }
    private static String s3Endpoint() { return "http://127.0.0.1:" + S3.getMappedPort(8333); }
    private record Account(HttpClient http, UUID id) { }
    private record Bundle(ContentView course, ContentView activity, UUID assetId) { }
    private record Fixture(Account owner, Account staff, Bundle a, Bundle b, OrderView order) { }
}
