package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.service.AssetTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.commerce.service.*;
import com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.notifications.NotificationWorker;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.projects.service.ProjectTypes.*;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.money.Money;
import java.net.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
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

/** Real HTTP/security/PostgreSQL, private S3 bytes and Mailpit SMTP. No Stripe key or external recipient is used. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "debug=false",
    "STRIPE_ENABLED=false", "PAYMENT_INBOX_ENABLED=false", "REFUND_WORKER_ENABLED=false", "COMMERCE_ENABLED=true",
    "NOTIFICATION_OUTBOX_ENABLED=false", "courses.notifications.outbox.retry-base=1s", "courses.notifications.outbox.retry-max=1s"
})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AccountEvidenceHttpIntegrationTest {
    private static final String ACCESS = UUID.randomUUID().toString().replace("-", "");
    private static final String SECRET = UUID.randomUUID().toString() + UUID.randomUUID();
    private static final String AUTH = "{\"identities\":[{\"name\":\"p14-test\",\"credentials\":[{\"accessKey\":\"" + ACCESS + "\",\"secretKey\":\"" + SECRET + "\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Tagging\",\"Write\"]}]}";
    private static final String PRIVATE_NOTE = "P14_PRIVATE_NOTE_NOT_AUTOMATICALLY_SHARED";
    private static final String PRIVATE_PRODUCTION = "P14_PRIVATE_PRODUCTION_NOT_AUTOMATICALLY_SHARED";
    private static final String PRIVATE_CORRECTION = "P14_PRIVATE_CORRECTION_NOT_A_PARTICIPATION_PROOF";
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @Container static final GenericContainer<?> S3 = new GenericContainer<>(DockerImageName.parse("chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59"))
        .withExposedPorts(8333).withTmpFs(Map.of("/data", "rw"))
        .withCopyToContainer(Transferable.of(AUTH.getBytes(StandardCharsets.UTF_8), 0444), "/run/secrets/s3.local.json")
        .withCommand("server", "-dir=/data", "-ip=127.0.0.1", "-ip.bind=0.0.0.0", "-master.volumeSizeLimitMB=64", "-master.telemetry=false", "-volume.max=24", "-filer", "-s3", "-s3.port=8333", "-s3.port.iceberg=0", "-s3.port.lance=0", "-s3.config=/run/secrets/s3.local.json")
        .waitingFor(Wait.forHttp("/healthz").forPort(8333).forStatusCode(200).withStartupTimeout(Duration.ofSeconds(90)));
    @Container static final GenericContainer<?> MAILPIT = new GenericContainer<>(DockerImageName.parse("axllent/mailpit:v1.33.0@sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231"))
        .withExposedPorts(1025, 8025).waitingFor(Wait.forHttp("/readyz").forPort(8025));

    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("POSTGRES_HOST", POSTGRES::getHost); r.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        r.add("POSTGRES_DB", POSTGRES::getDatabaseName); r.add("POSTGRES_USER", POSTGRES::getUsername); r.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey); r.add("COMMERCE_ALLOWED_CURRENCIES", () -> "EUR");
        r.add("MAIL_HOST", MAILPIT::getHost); r.add("MAIL_PORT", () -> MAILPIT.getMappedPort(1025)); r.add("MAIL_MODE", () -> "local"); r.add("MAIL_FROM", () -> "noreply@courses.local.invalid");
        r.add("courses.assets.enabled", () -> true); r.add("courses.assets.internal-endpoint", AccountEvidenceHttpIntegrationTest::s3Endpoint); r.add("courses.assets.external-endpoint", AccountEvidenceHttpIntegrationTest::s3Endpoint);
        r.add("courses.assets.access-key", () -> ACCESS); r.add("courses.assets.secret-key", () -> SECRET); r.add("courses.assets.region", () -> "us-east-1"); r.add("courses.assets.path-style", () -> true);
        r.add("courses.assets.editorial-bucket", () -> "p14-editorial"); r.add("courses.assets.private-bucket", () -> "p14-private");
        r.add("courses.assets.max-file-bytes", () -> 4096); r.add("courses.assets.max-files-per-project", () -> 8); r.add("courses.assets.max-bytes-per-project", () -> 32768); r.add("courses.assets.staging-cleanup-worker-enabled", () -> false);
    }
    @BeforeAll static void buckets() {
        try (var client = S3Client.builder().region(Region.US_EAST_1).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS, SECRET))).endpointOverride(URI.create(s3Endpoint())).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).httpClientBuilder(UrlConnectionHttpClient.builder()).build()) {
            for (String name : List.of("p14-editorial", "p14-private")) client.createBucket(b -> b.bucket(name));
        }
    }
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper mapper; @Autowired PasswordEncoder encoder;
    @Autowired EditorialService editorial; @Autowired LearningService learning; @Autowired ProjectService projects; @Autowired AssetService assets;
    @Autowired OfferService offers; @Autowired OrderService orders; @Autowired NotificationWorker notifications; @Autowired JavaMailSender mail;
    @LocalServerPort int port;
    @BeforeEach void drainMail() { ((JavaMailSenderImpl) mail).setPort(MAILPIT.getMappedPort(1025)); for (int i = 0; i < 100 && notifications.runOnce(); i++) { } }

    @Test void profileIsRevisionedAndCannotChangeEmailOrAnotherAccountsIdentity() throws Exception {
        var owner = account("Nom initial"); var other = account("Autre compte"); var initial = get(owner, "/api/v1/me/profile");
        assertThat(initial.statusCode()).isEqualTo(200); assertThat(text(initial, "email")).isEqualTo(owner.email());
        String path = "/api/v1/me/profile"; Object body = Map.of("displayName", "  Élodie nouvelle 😀  ");
        problem(send(owner, "PATCH", path, body, null, tag(initial), null, owner.id().toString()), 403, "CSRF_INVALID");
        problem(send(owner, "PATCH", path, body, csrf(owner), tag(initial), null, null), 428, "ACCOUNT_CONTEXT_REQUIRED");
        problem(send(owner, "PATCH", path, body, csrf(owner), tag(initial), null, other.id().toString()), 409, "ACCOUNT_CONTEXT_CHANGED");
        problem(mutate(owner, "PATCH", path, body, null, null), 428, "PRECONDITION_REQUIRED");
        problem(mutate(owner, "PATCH", path, Map.of("displayName", "Nom", "email", "changed@fixture.invalid"), tag(initial), null), 400, "INVALID_REQUEST");
        var saved = mutate(owner, "PATCH", path, body, tag(initial), null); assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(text(saved, "displayName")).isEqualTo("Élodie nouvelle 😀"); assertThat(text(saved, "email")).isEqualTo(owner.email());
        assertThat(tree(saved).path("revision").asLong()).isEqualTo(tree(initial).path("revision").asLong() + 1);
        problem(mutate(owner, "PATCH", path, Map.of("displayName", "Stale"), tag(initial), null), 412, "REVISION_CONFLICT");
        assertThat(text(get(other, path), "displayName")).isEqualTo("Autre compte");
        assertThat(text(get(owner, "/api/v1/auth/me"), "displayName")).isEqualTo("Élodie nouvelle 😀");
    }

    @Test void participationRejectsOnlyReadsNotesVisitsAndVideoPositionsAndMissingName() throws Exception {
        // Legacy P04 registrations can contain a blank display name; eligibility must normalize it to absent.
        var f = fixture("   "); long legacyRevision = jdbc.queryForObject("SELECT revision FROM user_accounts WHERE id=?", Long.class, f.owner().id());
        var e = eligibility(f, "fr"); assertThat(tree(e).path("eligible").asBoolean()).isFalse();
        var profile = get(f.owner(), "/api/v1/me/profile"); assertThat(profile.statusCode()).isEqualTo(200); assertThat(tree(profile).path("displayName").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT display_name FROM user_accounts WHERE id=?", String.class, f.owner().id())).isEqualTo("   ");
        assertThat(jdbc.queryForObject("SELECT revision FROM user_accounts WHERE id=?", Long.class, f.owner().id())).isEqualTo(legacyRevision);
        assertThat(tree(profile).path("revision").asLong()).isEqualTo(legacyRevision);
        assertThat(tree(e).path("evidence").path("participantName").isNull()).isTrue();
        assertCriterion(e, "PROFILE_NAME_PRESENT", false); assertCriterion(e, "PERSISTED_PARTICIPATION_PRESENT", false);
        saveName(f.owner(), "Identité déclarée");
        learning.visit(f.owner().id(), f.owner().id(), f.enrollment().summary().id(), new VisitActivity(f.activity().resourceId(), f.activity().versionId(), "fr"));
        progress(f, true, false); learning.createNote(f.owner().id(), f.owner().id(), new CreateActivityNote(f.activity().resourceId(), f.activity().versionId(), "fr", PRIVATE_NOTE));
        // Only a persisted viewing-position fixture; this does not claim that any course video was produced or played.
        UUID media = UUID.randomUUID(); jdbc.update("INSERT INTO video_media(id,origin_resource_id,origin_version_id,locale,duration_seconds,size_bytes,sha256,registered_by) VALUES(?,?,?,'fr',60,1,?,?)", media, f.activity().resourceId(), f.activity().versionId(), "0".repeat(64), f.editor().id());
        jdbc.update("INSERT INTO media_progress(owner_id,media_id,position_seconds,revision,updated_at) VALUES(?,?,60,1,clock_timestamp())", f.owner().id(), media);
        var still = eligibility(f, "fr"); assertCriterion(still, "PROFILE_NAME_PRESENT", true); assertCriterion(still, "PERSISTED_PARTICIPATION_PRESENT", false);
        problem(issue(f, still, "fr", key()), 409, "ATTESTATION_NOT_ELIGIBLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM participation_attestations WHERE owner_id=?", Integer.class, f.owner().id())).isZero();
    }

    @Test void eachPersistedParticipationBranchQualifiesWithoutPretendingSuccessOrHumanReview() throws Exception {
        for (String kind : List.of("COMPLETED", "QUIZ", "SELF_ASSESSMENT")) {
            var f = fixture("Participant " + kind);
            if (kind.equals("COMPLETED")) progress(f, true, true);
            else if (kind.equals("QUIZ")) quiz(f, 1); // Deliberately failed: this is participation, not successful completion.
            else assess(f, project(f)); // All declarations false: no successful project or human reviewer is invented.
            var eligible = eligibility(f, "fr"); assertThat(tree(eligible).path("eligible").asBoolean()).isTrue(); assertCriterion(eligible, "PERSISTED_PARTICIPATION_PRESENT", true);
            var issued = issue(f, eligible, "fr", key()); assertThat(issued.statusCode()).isEqualTo(201); var value = tree(issued);
            assertThat(value.path("summary").path("type").asText()).isEqualTo("PARTICIPATION");
            assertThat(value.path("evidence").path("identityVerified").asBoolean()).isFalse(); assertThat(value.path("evidence").path("humanReview").asBoolean()).isFalse();
            if (kind.equals("QUIZ")) assertThat(value.path("evidence").path("quizzes").get(0).path("passed").asBoolean()).isFalse();
            if (kind.equals("SELF_ASSESSMENT")) { var proof = value.path("evidence").path("selfAssessments").get(0); assertThat(proof.path("declaredByUser").asBoolean()).isTrue(); assertThat(proof.path("needsRevision").asBoolean()).isTrue(); }
            assertThat(issued.body().contains(PRIVATE_NOTE) || issued.body().contains(PRIVATE_PRODUCTION) || issued.body().contains(PRIVATE_CORRECTION)).isFalse();
        }
    }

    @Test void oldProjectRevisionAndAnotherEnrollmentOrOwnerCannotSupplyTheParticipationProof() throws Exception {
        var f = fixture("Propriétaire"); var p = project(f); assess(f, p);
        assertThat(tree(eligibility(f, "fr")).path("eligible").asBoolean()).isTrue();
        projects.save(f.owner().id(), f.owner().id(), p.id(), EntityTags.forRevision("project", p.id(), p.revision()), new SaveProject(p.fields(), "DRAFT"));
        var stale = eligibility(f, "fr"); assertThat(tree(stale).path("eligible").asBoolean()).isFalse();
        problem(issue(f, stale, "fr", key()), 409, "ATTESTATION_NOT_ELIGIBLE");
        var other = account("Autre participant"); var otherEnrollment = learning.enroll(other.id(), other.id(), new EnrollCourse(f.course().resourceId(), f.course().versionId(), "fr")).value();
        learning.submitQuiz(other.id(), other.id(), f.activity().resourceId(), new SubmitQuiz(otherEnrollment.summary().id(), f.activity().versionId(), f.activity().publishedRevisionId(), "fr", UUID.randomUUID(), List.of(new QuizAnswer("facts", 0))));
        assertThat(tree(eligibility(f, "fr")).path("eligible").asBoolean()).isFalse();
        problem(get(other, eligibilityPath(f, "fr")), 404, "RESOURCE_NOT_FOUND");
        var body = Map.of("locale", "fr", "expectedEvidenceFingerprint", text(stale, "evidenceFingerprint"), "ownerId", other.id(), "scorePoints", 20, "humanReview", true);
        problem(mutate(f.owner(), "POST", issuePath(f), body, null, key()), 400, "INVALID_REQUEST");
    }

    @Test void issuanceIsConcurrentIdempotentAndReplaysSurviveLaterIneligibility() throws Exception {
        var f = fixture("Participant concurrence"); progress(f, true, true); var eligible = eligibility(f, "fr");
        // Acquire the session token once before concurrent mutations, as the browser client does.
        // Concurrent first-token GETs could otherwise race while initializing the JDBC session.
        String token = csrf(f.owner());
        var commandBody = Map.of("locale", "fr", "expectedEvidenceFingerprint", text(eligible, "evidenceFingerprint"));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CyclicBarrier(2); Callable<HttpResponse<String>> command = () -> { barrier.await(5, TimeUnit.SECONDS); return send(f.owner(), "POST", issuePath(f), commandBody, token, null, key(), f.owner().id().toString()); };
            var one = pool.submit(command); var two = pool.submit(command); var first = one.get(20, TimeUnit.SECONDS); var second = two.get(20, TimeUnit.SECONDS);
            assertThat(List.of(first.statusCode(), second.statusCode())).containsExactlyInAnyOrder(201, 200); assertThat(attestationId(first)).isEqualTo(attestationId(second));
        }
        String requestKey = key(); var same = issue(f, eligible, "fr", requestKey); assertThat(same.statusCode()).isEqualTo(200);
        progress(f, false, false); saveName(f.owner(), null);
        var replay = issue(f, eligible, "fr", requestKey); assertThat(replay.statusCode()).isEqualTo(200); assertThat(attestationId(replay)).isEqualTo(attestationId(same));
        problem(issue(f, eligible, "en", requestKey), 409, "CONFLICT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM participation_attestations WHERE owner_id=?", Integer.class, f.owner().id())).isEqualTo(1);
    }

    @Test void staleEvidenceFingerprintCannotIssueForAChangedProfile() throws Exception {
        var f = fixture("Ancienne identité"); progress(f, true, true); var checked = eligibility(f, "fr"); saveName(f.owner(), "Nouvelle identité");
        problem(issue(f, checked, "fr", key()), 412, "REVISION_CONFLICT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM participation_attestations WHERE owner_id=?", Integer.class, f.owner().id())).isZero();
        assertThat(issue(f, eligibility(f, "fr"), "fr", key()).statusCode()).isEqualTo(201);
    }

    @Test void realUtf8HtmlIsEscapedHashedPrivateAndImmutableAfterProfileProgressAndSourceChanges() throws Exception {
        String name = "Élodie <script>alert('p14')</script> & 😀"; var f = fixture(name); progress(f, true, true);
        learning.createNote(f.owner().id(), f.owner().id(), new CreateActivityNote(f.activity().resourceId(), f.activity().versionId(), "fr", PRIVATE_NOTE));
        var issued = issue(f, eligibility(f, "fr"), "fr", key()); assertThat(issued.statusCode()).isEqualTo(201); UUID id = attestationId(issued);
        var document = downloadAttestation(f.owner(), id); assertThat(document.statusCode()).isEqualTo(200);
        assertThat(document.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT)).contains("text/html", "utf-8");
        assertThat(document.headers().firstValue("Content-Disposition").orElse("")).contains("attachment", ".html");
        assertThat(document.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(document.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(document.headers().firstValue("Content-Security-Policy")).isPresent();
        byte[] original = document.body(); String html = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(original)).toString();
        assertThat(html).contains("Élodie", "😀", "&lt;script&gt;"); assertThat(html.toLowerCase(Locale.ROOT)).doesNotContain("<script", "<iframe", "https://", "http://", PRIVATE_NOTE.toLowerCase(Locale.ROOT), PRIVATE_CORRECTION.toLowerCase(Locale.ROOT));
        assertThat(html.toLowerCase(Locale.ROOT)).contains("content-security-policy");
        var metadata = tree(issued).path("summary").path("document"); assertThat(metadata.path("format").asText()).isEqualTo("HTML");
        assertThat(metadata.path("sizeBytes").asLong()).isEqualTo(original.length); assertThat(metadata.path("sha256").asText()).isEqualTo(sha(original));
        assertThat(MessageDigest.isEqual(jdbc.queryForObject("SELECT document_bytes FROM participation_attestations WHERE id=?", byte[].class, id), original)).isTrue();
        assertThat(MessageDigest.isEqual(jdbc.queryForObject("SELECT document_sha256 FROM participation_attestations WHERE id=?", byte[].class, id), MessageDigest.getInstance("SHA-256").digest(original))).isTrue();
        assertThat(Long.parseLong(document.headers().firstValue("Content-Length").orElseThrow())).isEqualTo(original.length);
        var other = account("Autre"); assertThat(downloadAttestation(other, id).statusCode()).isEqualTo(404);
        assertThat(HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/v1/me/attestations/" + id + "/document")).GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(401);
        saveName(f.owner(), "Autre nom ultérieur"); progress(f, false, false);
        var course = editorial.get(f.editor().id(), f.course().id()); editorial.revise(f.editor().id(), course.id(), contentTag(course), new SaveRevision("Titre corrigé ultérieur", course.summary(), course.document(), "Correction mineure de test"));
        assertThat(MessageDigest.isEqual(downloadAttestation(f.owner(), id).body(), original)).isTrue();
        var stored = get(f.owner(), "/api/v1/me/attestations/" + id); assertThat(tree(stored).path("summary").path("participantName").asText()).isEqualTo(name);
        assertThat(stored.body().contains(PRIVATE_NOTE) || stored.body().contains(PRIVATE_CORRECTION)).isFalse();
    }

    @Test void languageAndNewCourseVersionKeepOriginalEvidenceAndOldAttestation() throws Exception {
        var f = fixture("Participant bilingue"); var attempt = quiz(f, 0); var fr = issue(f, eligibility(f, "fr"), "fr", key()); var en = issue(f, eligibility(f, "en"), "en", key());
        assertThat(fr.statusCode()).isEqualTo(201); assertThat(en.statusCode()).isEqualTo(201);
        assertThat(tree(en).path("summary").path("locale").asText()).isEqualTo("en"); assertThat(tree(en).path("evidence").path("quizzes").get(0).path("locale").asText()).isEqualTo("fr");
        assertThat(tree(en).path("evidence").path("quizzes").get(0).path("attemptId").asText()).isEqualTo(attempt.id().toString());
        byte[] original = downloadAttestation(f.owner(), attestationId(fr)).body();
        byte[] englishOriginal = downloadAttestation(f.owner(), attestationId(en)).body();
        String englishHtml = new String(englishOriginal, StandardCharsets.UTF_8);
        assertThat(englishHtml).contains("<html lang=\"en\">", "<span lang=\"fr\">" + f.course().title() + "</span>", "<span lang=\"fr\">" + f.activity().title() + "</span>");
        assertThat(tree(en).path("evidence").path("enrolledLocale").asText()).isEqualTo("fr");
        assertThat(MessageDigest.isEqual(jdbc.queryForObject("SELECT document_bytes FROM participation_attestations WHERE id=?", byte[].class, attestationId(en)), englishOriginal)).isTrue();
        String englishHash = sha(englishOriginal);
        assertThat(tree(en).path("summary").path("document").path("sha256").asText()).isEqualTo(englishHash);
        var c = editorial.get(f.editor().id(), f.course().id()); var next = editorial.newVersion(f.editor().id(), c.id(), contentTag(c), new NewVersion("New pedagogical objective", "New declared assessment", "Parcours fictif P14 version 2", "Explicit new teaching version", c.document(), List.of(f.module().versionId()), "New version fixture")); next = publish(f.editor().id(), next);
        var enrollment = learning.enroll(f.owner().id(), f.owner().id(), new EnrollCourse(next.resourceId(), next.versionId(), "fr")).value();
        var newer = get(f.owner(), "/api/v1/me/enrollments/" + enrollment.summary().id() + "/attestation-eligibility?locale=fr"); assertThat(tree(newer).path("eligible").asBoolean()).isFalse();
        saveName(f.owner(), "Another declared participant name");
        var newEnglish = issue(f, eligibility(f, "en"), "en", key()); assertThat(newEnglish.statusCode()).isEqualTo(201);
        assertThat(attestationId(newEnglish)).isNotEqualTo(attestationId(en));
        assertThat(new String(downloadAttestation(f.owner(), attestationId(newEnglish)).body(), StandardCharsets.UTF_8)).contains("<html lang=\"en\">", "<span lang=\"fr\">" + f.course().title() + "</span>");
        assertThat(MessageDigest.isEqual(downloadAttestation(f.owner(), attestationId(fr)).body(), original)).isTrue();
        assertThat(MessageDigest.isEqual(downloadAttestation(f.owner(), attestationId(en)).body(), englishOriginal)).isTrue();
        assertThat(sha(downloadAttestation(f.owner(), attestationId(en)).body())).isEqualTo(englishHash);
        assertThat(get(f.owner(), "/api/v1/me/attestations/" + attestationId(en)).body()).contains("Participant bilingue");
    }

    @Test void withdrawnEnrollmentRemainsListedAndIssuedCertificateDoesNotDependOnCurrentAccess() throws Exception {
        var f = fixture("Historique conservé"); progress(f, true, true); var issued = issue(f, eligibility(f, "fr"), "fr", key()); byte[] original = downloadAttestation(f.owner(), attestationId(issued)).body();
        var course = editorial.get(f.editor().id(), f.course().id()); editorial.archive(f.editor().id(), course.id(), contentTag(course), new ArchiveContent("Withdraw teaching source without rewriting personal history"));
        var page = get(f.owner(), "/api/v1/me/attestation-enrollments?page=0&pageSize=100"); assertThat(page.statusCode()).isEqualTo(200);
        assertThat(java.util.stream.StreamSupport.stream(tree(page).path("items").spliterator(), false).map(item -> item.path("enrollmentId").asText()).toList()).contains(f.enrollment().summary().id().toString());
        assertThat(page.body().contains(PRIVATE_CORRECTION) || page.body().contains(PRIVATE_PRODUCTION)).isFalse();
        assertThat(MessageDigest.isEqual(downloadAttestation(f.owner(), attestationId(issued)).body(), original)).isTrue();
    }

    @Test void supportOnlySharesChosenReadyOwnerFilesAndNeverImpersonatesTheRequester() throws Exception {
        var f = fixture("Demandeur"); var staff = account("Support", "SUPPORT_OPERATOR"); var editor = account("Éditeur limité", "EDITOR"); var other = fixture("Autre demandeur");
        var project = project(f); var one = upload(f, project, "selected.txt", "Selected owner bytes"); var two = upload(f, project, "not-selected.txt", "Unshared owner bytes");
        learning.createNote(f.owner().id(), f.owner().id(), new CreateActivityNote(f.activity().resourceId(), f.activity().versionId(), "fr", PRIVATE_NOTE));
        var pending = assets.createProjectIntent(f.owner().id(), f.owner().id(), project.id(), new UploadRequest("pending.txt", "text/plain", 1));
        problem(createTicket(f, List.of(pending.asset().id()), key()), 409, "SUPPORT_ATTACHMENT_INVALID");
        var noLocale = new LinkedHashMap<String, Object>(ticketBody(f, List.of()));
        noLocale.put("context", Map.of("orderId", preparedOrder(f).id()));
        problem(mutate(f.owner(), "POST", "/api/v1/me/support-tickets", noLocale, null, key()), 400, "VALIDATION_FAILED");
        var body = ticketBody(f, List.of(one.id())); String requestKey = key(); var ticket = mutate(f.owner(), "POST", "/api/v1/me/support-tickets", body, null, requestKey); assertThat(ticket.statusCode()).isEqualTo(201);
        var replay = mutate(f.owner(), "POST", "/api/v1/me/support-tickets", body, null, requestKey); assertThat(replay.statusCode()).isEqualTo(200); assertThat(id(replay)).isEqualTo(id(ticket));
        UUID ticketId = id(ticket); var messages = get(f.owner(), "/api/v1/me/support-tickets/" + ticketId + "/messages"); assertThat(messages.body().contains(PRIVATE_NOTE) || messages.body().contains(PRIVATE_PRODUCTION)).isFalse();
        assertThat(messages.body().contains(one.id().toString())).isTrue(); assertThat(messages.body().contains(two.id().toString())).isFalse();
        problem(get(other.owner(), "/api/v1/me/support-tickets/" + ticketId), 404, "RESOURCE_NOT_FOUND");
        problem(get(editor, "/api/v1/admin/support-tickets/" + ticketId), 403, "ACCESS_DENIED");
        var staffView = get(staff, "/api/v1/admin/support-tickets/" + ticketId);
        problem(mutate(staff, "POST", "/api/v1/admin/support-tickets/" + ticketId + "/messages", Map.of("message", "An operator cannot attach requester files", "attachmentIds", List.of(one.id())), tag(staffView), key()), 400, "VALIDATION_FAILED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM support_messages WHERE ticket_id=? AND author_kind='SUPPORT'", Integer.class, ticketId)).isZero();
        var link = mutate(staff, "POST", "/api/v1/admin/support-tickets/" + ticketId + "/attachments/" + one.id() + "/download-access", null, null, null); assertThat(link.statusCode()).isEqualTo(200);
        var access = mapper.readValue(link.body(), DownloadAccess.class); var bytes = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(access.url())).GET().build(), HttpResponse.BodyHandlers.ofByteArray()); assertThat(bytes.statusCode()).isEqualTo(200); assertThat(new String(bytes.body(), StandardCharsets.UTF_8)).isEqualTo("Selected owner bytes");
        problem(mutate(staff, "POST", "/api/v1/admin/support-tickets/" + ticketId + "/attachments/" + two.id() + "/download-access", null, null, null), 404, "RESOURCE_NOT_FOUND");
        problem(mutate(staff, "POST", "/api/v1/assets/" + one.id() + "/download-access", null, null, null), 404, "RESOURCE_NOT_FOUND");
        var foreignProject = project(other); var foreignFile = upload(other, foreignProject, "foreign.txt", "Foreign bytes"); problem(createTicket(f, List.of(foreignFile.id()), key()), 409, "SUPPORT_ATTACHMENT_INVALID");
    }

    @Test void supportConversationHasRealRevisionHistoryAndClosedTicketsRejectUserMessages() throws Exception {
        var f = fixture("Conversation"); var staff = account("Support", "SUPPORT_OPERATOR"); var ticket = createTicket(f, List.of(), key()); UUID id = id(ticket); String admin = "/api/v1/admin/support-tickets/" + id;
        problem(mutate(staff, "POST", admin + "/messages", Map.of("message", "A reply", "attachmentIds", List.of()), null, key()), 428, "PRECONDITION_REQUIRED");
        var reply = mutate(staff, "POST", admin + "/messages", Map.of("message", "Actual published reply", "attachmentIds", List.of()), tag(ticket), key()); assertThat(reply.statusCode()).isEqualTo(201);
        assertThat(tree(reply).path("ticket").path("state").asText()).isEqualTo("WAITING_FOR_USER"); assertThat(tree(reply).path("message").path("authorKind").asText()).isEqualTo("SUPPORT");
        problem(mutate(f.owner(), "POST", "/api/v1/me/support-tickets/" + id + "/messages", Map.of("message", "Stale message", "attachmentIds", List.of()), tag(ticket), key()), 412, "REVISION_CONFLICT");
        var fresh = get(f.owner(), "/api/v1/me/support-tickets/" + id); String idem = key(); var body = Map.of("message", "A user follow-up", "attachmentIds", List.of());
        var added = mutate(f.owner(), "POST", "/api/v1/me/support-tickets/" + id + "/messages", body, tag(fresh), idem); assertThat(added.statusCode()).isEqualTo(201); assertThat(tree(added).path("ticket").path("state").asText()).isEqualTo("OPEN");
        var replay = mutate(f.owner(), "POST", "/api/v1/me/support-tickets/" + id + "/messages", body, tag(fresh), idem); assertThat(replay.statusCode()).isEqualTo(200); assertThat(tree(replay).path("message").path("id").asText()).isEqualTo(tree(added).path("message").path("id").asText());
        // The same authenticated account may have both roles; an action key must not cross USER/SUPPORT semantics.
        assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='SUPPORT_OPERATOR'", UUID.randomUUID(), f.owner().id())).isEqualTo(1);
        var dualRole = get(f.owner(), admin); long beforeCrossReplay = tree(get(f.owner(), "/api/v1/me/support-tickets/" + id + "/messages")).path("total").asLong();
        problem(mutate(f.owner(), "POST", admin + "/messages", body, tag(dualRole), idem), 409, "CONFLICT");
        assertThat(tree(get(f.owner(), "/api/v1/me/support-tickets/" + id + "/messages")).path("total").asLong()).isEqualTo(beforeCrossReplay);
        var current = get(staff, admin); var closed = mutate(staff, "POST", admin + "/state-changes", Map.of("state", "CLOSED", "reason", "Closed explicitly in isolated test"), tag(current), key()); assertThat(closed.statusCode()).isEqualTo(200);
        problem(mutate(f.owner(), "POST", "/api/v1/me/support-tickets/" + id + "/messages", body, tag(closed), key()), 409, "SUPPORT_TICKET_CLOSED");
        var history = get(f.owner(), "/api/v1/me/support-tickets/" + id + "/events"); assertThat(history.statusCode()).isEqualTo(200); assertThat(history.body()).contains("CREATED", "SUPPORT_REPLY", "USER_MESSAGE", "STATE_CHANGED");
    }

    @Test void supportReplySurvivesActualSmtpFailureAndRecoveryWithoutDuplicatingMessageOrChangingTicketEtag() throws Exception {
        var f = fixture("Mailpit local"); var staff = account("Support", "SUPPORT_OPERATOR"); var ticket = createTicket(f, List.of(), key()); UUID ticketId = id(ticket);
        var reply = mutate(staff, "POST", "/api/v1/admin/support-tickets/" + ticketId + "/messages", Map.of("message", PRIVATE_PRODUCTION, "attachmentIds", List.of()), tag(ticket), key()); assertThat(reply.statusCode()).isEqualTo(201);
        UUID messageId = UUID.fromString(tree(reply).path("message").path("id").asText()); var stored = get(f.owner(), "/api/v1/me/support-tickets/" + ticketId); String ticketTag = tag(stored);
        int closedPort; try (var socket = new ServerSocket(0)) { closedPort = socket.getLocalPort(); }
        ((JavaMailSenderImpl) mail).setPort(closedPort);
        try { until(() -> { notifications.runOnce(); return notificationState(messageId).equals("RETRY"); }, 8); }
        finally { ((JavaMailSenderImpl) mail).setPort(MAILPIT.getMappedPort(1025)); }
        assertThat(text(get(f.owner(), "/api/v1/me/support-tickets/" + ticketId), "state")).isEqualTo("WAITING_FOR_USER");
        var messages = get(f.owner(), "/api/v1/me/support-tickets/" + ticketId + "/messages"); assertThat(messages.body().contains(PRIVATE_PRODUCTION)).isTrue();
        JsonNode failedMessage = null;
        for (var message : tree(messages).path("items")) if (message.path("id").asText().equals(messageId.toString())) failedMessage = message;
        assertThat(failedMessage).isNotNull(); assertThat(failedMessage.path("notificationStatus").asText()).isIn("PENDING", "ISSUE");
        until(() -> { notifications.runOnce(); return notificationState(messageId).equals("SENT"); }, 8);
        var delivered = tree(get(f.owner(), "/api/v1/me/support-tickets/" + ticketId + "/messages"));
        for (var message : delivered.path("items")) if (message.path("id").asText().equals(messageId.toString())) assertThat(message.path("notificationStatus").asText()).isEqualTo("SENT");
        assertThat(tag(get(f.owner(), "/api/v1/me/support-tickets/" + ticketId))).isEqualTo(ticketTag);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM support_messages WHERE id=?", Integer.class, messageId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE business_key=?", Integer.class, "support:reply:" + messageId)).isEqualTo(1);
        until(() -> mailCount(f.owner().email()) == 1, 5);
        assertThat(mailCount(f.owner().email())).isEqualTo(1);
        var deliveredMail = mailDetail(f.owner().email());
        assertThat(deliveredMail.path("Text").asText()).contains("http://localhost:3000/fr/compte/aide/" + ticketId);
        assertThat(deliveredMail.toString().contains(PRIVATE_PRODUCTION) || deliveredMail.toString().contains(PRIVATE_NOTE)).isFalse();
    }

    @Test void dataRequestsWaitForPolicyAndCancellationNeverExportsErasesOrClosesTheAccount() throws Exception {
        var f = fixture("Données conservées"); var project = project(f); var other = account("Autre compte"); var order = preparedOrder(f);
        String boughtSnapshot = jdbc.queryForObject("SELECT snapshot_json::text FROM orders WHERE id=?", String.class, order.id());
        for (String kind : List.of("EXPORT", "ERASURE", "ACCOUNT_CLOSURE")) {
            var body = Map.of("type", kind, "reason", "A real recorded request, no automatic processing"); String idem = key(); var created = mutate(f.owner(), "POST", "/api/v1/me/data-requests", body, null, idem); assertThat(created.statusCode()).isEqualTo(201);
            assertThat(text(created, "state")).isEqualTo("WAITING_POLICY"); assertThat(text(created, "processingUnavailableReason")).isEqualTo("RETENTION_POLICY_UNCONFIGURED");
            assertThat(created.body().contains("downloadUrl") || created.body().contains("exportUrl")).isFalse();
            var replay = mutate(f.owner(), "POST", "/api/v1/me/data-requests", body, null, idem); assertThat(replay.statusCode()).isEqualTo(200); assertThat(id(replay)).isEqualTo(id(created));
            problem(mutate(f.owner(), "POST", "/api/v1/me/data-requests", body, null, key()), 409, "DATA_REQUEST_EXISTS");
            String path = "/api/v1/me/data-requests/" + id(created); problem(get(other, path), 404, "RESOURCE_NOT_FOUND");
            problem(mutate(f.owner(), "POST", path + "/cancellations", Map.of("reason", "Explicit cancellation"), null, key()), 428, "PRECONDITION_REQUIRED");
            var cancelled = mutate(f.owner(), "POST", path + "/cancellations", Map.of("reason", "Explicit cancellation"), tag(created), key()); assertThat(cancelled.statusCode()).isEqualTo(200); assertThat(text(cancelled, "state")).isEqualTo("CANCELLED");
            assertThat(get(f.owner(), path + "/events").body()).contains("REQUESTED", "CANCELLED");
        }
        assertThat(jdbc.queryForObject("SELECT status FROM user_accounts WHERE id=?", String.class, f.owner().id())).isEqualTo("ACTIVE");
        assertThat(projects.get(f.owner().id(), project.id()).fields().externalText()).isEqualTo(PRIVATE_PRODUCTION);
        assertThat(jdbc.queryForObject("SELECT snapshot_json::text FROM orders WHERE id=?", String.class, order.id())).isEqualTo(boughtSnapshot);
        assertThat(get(f.owner(), "/api/v1/auth/me").statusCode()).isEqualTo(200);
    }

    @Test void dataRequestLifecycleKeepsCausalHistoryAndClampsNewCancellationAfterFuturePredecessor() throws Exception {
        var owner = account("Chronologie des demandes");
        Instant base = Instant.parse("2020-01-01T12:00:00Z");
        for (boolean inverted : List.of(false, true)) {
            UUID requestId = UUID.randomUUID();
            // Explicit historical INSERTs exercise old rows without disabling immutable-history guards.
            UUID requestedId = new UUID(-1L, UUID.randomUUID().getLeastSignificantBits());
            UUID cancelledId = new UUID(0L, UUID.randomUUID().getLeastSignificantBits());
            Instant requestedAt = base.plusSeconds(inverted ? 2 : 1), cancelledAt = base.plusSeconds(1);
            jdbc.update("INSERT INTO account_data_requests(id,owner_id,request_type,reason,state,created_at,updated_at,cancelled_at) VALUES(?,?,'EXPORT','Historical chronology fixture','CANCELLED',?,?,?)", requestId, owner.id(), java.sql.Timestamp.from(base), java.sql.Timestamp.from(base.plusSeconds(3)), java.sql.Timestamp.from(base.plusSeconds(3)));
            jdbc.update("INSERT INTO account_data_request_events(id,request_id,owner_id,event_type,reason,created_at) VALUES(?,?,?,'REQUESTED','Historical request',?)", requestedId, requestId, owner.id(), java.sql.Timestamp.from(requestedAt));
            jdbc.update("INSERT INTO account_data_request_events(id,request_id,owner_id,event_type,reason,created_at) VALUES(?,?,?,'CANCELLED','Historical cancellation',?)", cancelledId, requestId, owner.id(), java.sql.Timestamp.from(cancelledAt));
            String before = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(e) ORDER BY id)::text FROM account_data_request_events e WHERE request_id=?", String.class, requestId);
            var history = tree(get(owner, "/api/v1/me/data-requests/" + requestId + "/events")).path("items");
            assertThat(history.size()).isEqualTo(2);
            assertThat(history.get(0).path("type").asText()).isEqualTo("REQUESTED");
            assertThat(history.get(1).path("type").asText()).isEqualTo("CANCELLED");
            assertThat(Instant.parse(history.get(0).path("createdAt").asText())).isEqualTo(requestedAt);
            assertThat(Instant.parse(history.get(1).path("createdAt").asText())).isEqualTo(cancelledAt);
            assertThat(before.equals(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(e) ORDER BY id)::text FROM account_data_request_events e WHERE request_id=?", String.class, requestId))).as("Reading historical lifecycle must not rewrite timestamps or rows").isTrue();
        }
        var created = mutate(owner, "POST", "/api/v1/me/data-requests", Map.of("type", "EXPORT", "reason", "Real creation timestamp fixture"), null, key());
        assertThat(created.statusCode()).isEqualTo(201);
        var createdEvent = tree(get(owner, "/api/v1/me/data-requests/" + id(created) + "/events")).path("items").get(0);
        assertThat(Instant.parse(text(created, "createdAt"))).isEqualTo(Instant.parse(text(created, "updatedAt"))).isEqualTo(Instant.parse(createdEvent.path("createdAt").asText()));

        UUID requestId = UUID.randomUUID();
        Instant future = jdbc.queryForObject("SELECT clock_timestamp()+interval '1 hour'", (r, n) -> r.getTimestamp(1).toInstant());
        jdbc.update("INSERT INTO account_data_requests(id,owner_id,request_type,reason,state,created_at,updated_at) VALUES(?,?,'ERASURE','Future predecessor fixture','WAITING_POLICY',?,?)", requestId, owner.id(), java.sql.Timestamp.from(base), java.sql.Timestamp.from(base));
        jdbc.update("INSERT INTO account_data_request_events(id,request_id,owner_id,event_type,reason,created_at) VALUES(?,?,?,'REQUESTED','Explicit future predecessor',?)", UUID.randomUUID(), requestId, owner.id(), java.sql.Timestamp.from(future));
        String path = "/api/v1/me/data-requests/" + requestId;
        var initial = get(owner, path);
        var cancelled = mutate(owner, "POST", path + "/cancellations", Map.of("reason", "Real cancellation after future predecessor"), tag(initial), key());
        assertThat(cancelled.statusCode()).isEqualTo(200);
        Instant actionAt = Instant.parse(text(cancelled, "cancelledAt"));
        assertThat(actionAt).isAfter(future).isEqualTo(Instant.parse(text(cancelled, "updatedAt")));
        assertThat(Instant.parse(text(cancelled, "createdAt"))).isEqualTo(base);
        var events = tree(get(owner, path + "/events")).path("items");
        assertThat(events.size()).isEqualTo(2);
        assertThat(events.get(0).path("type").asText()).isEqualTo("REQUESTED");
        assertThat(events.get(1).path("type").asText()).isEqualTo("CANCELLED");
        assertThat(Instant.parse(events.get(0).path("createdAt").asText())).isEqualTo(future);
        assertThat(Instant.parse(events.get(1).path("createdAt").asText())).isEqualTo(actionAt);
    }

    @Test void supportActionsUseOneStrictTimestampAfterFutureMessagesAndEventsWithoutRewritingHistory() throws Exception {
        var owner = account("Chronologie support"); var staff = account("Opérateur chronologie", "SUPPORT_OPERATOR");
        var created = mutate(owner, "POST", "/api/v1/me/support-tickets", Map.of("category", "OTHER", "subject", "Chronology fixture", "message", "Real first message", "locale", "fr", "attachmentIds", List.of()), null, key());
        assertThat(created.statusCode()).isEqualTo(201);
        UUID ticket = id(created); String path = "/api/v1/me/support-tickets/" + ticket;
        var initialMessages = tree(get(owner, path + "/messages")).path("items");
        var initialEvents = tree(get(owner, path + "/events")).path("items");
        Instant createdAt = Instant.parse(text(created, "createdAt"));
        assertThat(createdAt).isEqualTo(Instant.parse(text(created, "updatedAt"))).isEqualTo(Instant.parse(initialMessages.get(0).path("createdAt").asText())).isEqualTo(Instant.parse(initialEvents.get(0).path("createdAt").asText()));
        Instant future = jdbc.queryForObject("SELECT clock_timestamp()+interval '1 hour'", (r, n) -> r.getTimestamp(1).toInstant());
        UUID oldMessage = UUID.randomUUID(), oldEvent = UUID.randomUUID();
        jdbc.update("INSERT INTO support_messages(id,ticket_id,owner_id,actor_id,author_kind,body,created_at) VALUES(?,?,?,?,'USER','Historical future message',?)", oldMessage, ticket, owner.id(), owner.id(), java.sql.Timestamp.from(future));
        jdbc.update("INSERT INTO support_ticket_events(id,ticket_id,actor_id,author_kind,event_type,from_state,to_state,created_at) VALUES(?,?,?,'USER','USER_MESSAGE','OPEN','OPEN',?)", oldEvent, ticket, owner.id(), java.sql.Timestamp.from(future.plusNanos(1000)));
        String beforeMessage = jdbc.queryForObject("SELECT row_to_json(m)::text FROM support_messages m WHERE id=?", String.class, oldMessage);
        String beforeEvent = jdbc.queryForObject("SELECT row_to_json(e)::text FROM support_ticket_events e WHERE id=?", String.class, oldEvent);
        var added = mutate(owner, "POST", path + "/messages", Map.of("message", "Real message after future predecessor", "attachmentIds", List.of()), tag(created), key());
        assertThat(added.statusCode()).isEqualTo(201);
        var update = tree(added); Instant actionAt = Instant.parse(update.path("message").path("createdAt").asText());
        assertThat(actionAt).isAfter(future.plusNanos(1000)).isEqualTo(Instant.parse(update.path("ticket").path("updatedAt").asText()));
        var messages = tree(get(owner, path + "/messages")).path("items");
        assertThat(messages.size()).isEqualTo(3);
        assertThat(messages.get(1).path("id").asText()).isEqualTo(oldMessage.toString());
        assertThat(messages.get(2).path("id").asText()).isEqualTo(update.path("message").path("id").asText());
        var events = tree(get(owner, path + "/events")).path("items");
        assertThat(events.size()).isEqualTo(3);
        assertThat(events.get(1).path("id").asText()).isEqualTo(oldEvent.toString());
        assertThat(events.get(2).path("type").asText()).isEqualTo("USER_MESSAGE");
        assertThat(Instant.parse(events.get(2).path("createdAt").asText())).isEqualTo(actionAt);
        String admin = "/api/v1/admin/support-tickets/" + ticket;
        var changed = mutate(staff, "POST", admin + "/state-changes", Map.of("state", "IN_PROGRESS", "reason", "Real state transition after bounded message"), tag(get(staff, admin)), key());
        assertThat(changed.statusCode()).isEqualTo(200); Instant stateAt = Instant.parse(text(changed, "updatedAt"));
        assertThat(stateAt).isAfter(actionAt);
        var afterState = tree(get(owner, path + "/events")).path("items");
        assertThat(afterState.size()).isEqualTo(4); assertThat(afterState.get(3).path("type").asText()).isEqualTo("STATE_CHANGED");
        assertThat(Instant.parse(afterState.get(3).path("createdAt").asText())).isEqualTo(stateAt);
        assertThat(beforeMessage.equals(jdbc.queryForObject("SELECT row_to_json(m)::text FROM support_messages m WHERE id=?", String.class, oldMessage))).as("Existing support messages remain immutable").isTrue();
        assertThat(beforeEvent.equals(jdbc.queryForObject("SELECT row_to_json(e)::text FROM support_ticket_events e WHERE id=?", String.class, oldEvent))).as("Existing support events remain immutable").isTrue();
    }

    @Test void commercialDocumentsAreExplicitlyUnavailableAndRemainOwnerScoped() throws Exception {
        var f = fixture("Acheteur"); var other = account("Autre acheteur"); var order = preparedOrder(f);
        var response = get(f.owner(), "/api/v1/me/orders/" + order.id() + "/documents"); assertThat(response.statusCode()).isEqualTo(200);
        assertThat(text(response, "state")).isEqualTo("NONE_AVAILABLE"); assertThat(tree(response).path("documents").isEmpty()).isTrue(); assertThat(text(response, "unavailableReason")).isEqualTo("NO_VERIFIED_COMMERCIAL_DOCUMENT");
        problem(get(other, "/api/v1/me/orders/" + order.id() + "/documents"), 404, "RESOURCE_NOT_FOUND");
        assertThat(jdbc.queryForObject("SELECT payment_status FROM orders WHERE id=?", String.class, order.id())).isEqualTo("NOT_STARTED");
    }

    private Fixture fixture(String name) throws Exception {
        var editor = account("Éditeur de fixture", "EDITOR", "COMMERCE_MANAGER"); var owner = account(name);
        ContentDocument document;
        try (var input = new ClassPathResource("editorial/project-presets.json").getInputStream()) {
            document = null;
            for (var p : mapper.readTree(input)) if (p.path("caseCode").asText().equals("BR01") && p.path("locale").asText().equals("fr")) document = new ContentDocument("Practice supplied facts", "A declared production", List.of(), List.of(new ContentBlock("PARAGRAPH", "Fictitious P14 practice", null)), null, new Exercise("Write a proposal", PRIVATE_CORRECTION), List.of(new QuizQuestion("facts", "Use known facts?", List.of("Yes", "Invent"), 0, PRIVATE_CORRECTION, 1)), Arrays.asList(mapper.treeToValue(p.path("rubric"), RubricCriterion[].class)), "FREE", List.of(), List.of(), null, null, mapper.treeToValue(p.path("policy"), ProjectPolicy.class));
        }
        if (document == null) throw new IllegalStateException("Explicit project fixture missing");
        var activity = publish(editor.id(), editorial.create(editor.id(), new CreateContent(ResourceKind.ACTIVITY, "fr", "p14-" + key(), "Activité fictive P14", "Technical fixture only", document.objective(), document.expectedResult(), document, List.of(), "P14 fixture")));
        var module = parent(editor.id(), ResourceKind.MODULE, activity.versionId()); var course = parent(editor.id(), ResourceKind.COURSE, module.versionId());
        var enrollment = learning.enroll(owner.id(), owner.id(), new EnrollCourse(course.resourceId(), course.versionId(), "fr")).value();
        return new Fixture(owner, editor, activity, module, course, enrollment);
    }
    private ContentView parent(UUID actor, ResourceKind kind, UUID child) { var d = new ContentDocument("Practice exact programme", "Declared participation", List.of(), List.of(new ContentBlock("PARAGRAPH", "Fictitious P14 programme", null)), null, null, List.of(), List.of(), "FREE", List.of(), List.of()); return publish(actor, editorial.create(actor, new CreateContent(kind, "fr", "p14-" + key(), "Parcours fictif P14 " + kind, "Technical fixture only", d.objective(), d.expectedResult(), d, List.of(child), "P14 pinned programme"))); }
    private ContentView publish(UUID actor, ContentView view) { view = editorial.transition(actor, view.id(), contentTag(view), new TransitionContent(EditorialState.TO_REVIEW, "Review exact fixture", null)); view = editorial.transition(actor, view.id(), contentTag(view), new TransitionContent(EditorialState.READY, "Ready fixture", null)); return editorial.publish(actor, view.id(), contentTag(view), new PublishContent(view.currentRevisionId(), "Publish fictitious practice")); }
    private ProjectView project(Fixture f) { return projects.create(f.owner().id(), f.owner().id(), new CreateProject(UUID.randomUUID(), f.activity().resourceId(), f.activity().versionId(), f.activity().publishedRevisionId(), "fr", f.enrollment().summary().id(), new ProjectFields("Production privée", "fr", "", "", "", "", "", "", "", PRIVATE_PRODUCTION), "READY_FOR_SELF_ASSESSMENT")).value(); }
    private void assess(Fixture f, ProjectView p) { projects.selfAssess(f.owner().id(), f.owner().id(), p.id(), EntityTags.forRevision("project", p.id(), p.revision()), new SubmitSelfAssessment(UUID.randomUUID(), p.currentRevisionId(), p.rubric().id(), p.rubric().criteria().stream().map(c -> new CriterionDeclaration(c.key(), false, "Declared only")).toList(), p.rubric().blockingIssues().stream().map(b -> new BlockingDeclaration(b.key(), false, "No claim")).toList(), "Participation only")); }
    private QuizAttemptView quiz(Fixture f, int option) { return learning.submitQuiz(f.owner().id(), f.owner().id(), f.activity().resourceId(), new SubmitQuiz(f.enrollment().summary().id(), f.activity().versionId(), f.activity().publishedRevisionId(), "fr", UUID.randomUUID(), List.of(new QuizAnswer("facts", option)))); }
    private void progress(Fixture f, boolean read, boolean completed) { var p = learning.progress(f.owner().id(), f.activity().resourceId(), f.enrollment().summary().id(), f.activity().versionId()); learning.setProgress(f.owner().id(), f.owner().id(), f.activity().resourceId(), EntityTags.forRevision("activity-progress", p.id(), p.revision()), new SetActivityProgress(f.enrollment().summary().id(), f.activity().versionId(), read, completed, "fr")); }
    private AssetView upload(Fixture f, ProjectView p, String filename, String value) throws Exception { byte[] bytes = value.getBytes(StandardCharsets.UTF_8); var intent = assets.createProjectIntent(f.owner().id(), f.owner().id(), p.id(), new UploadRequest(filename, "text/plain", bytes.length)); var q = HttpRequest.newBuilder(URI.create(intent.uploadUrl())).PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)); intent.headers().forEach(q::header); assertThat(HttpClient.newHttpClient().send(q.build(), HttpResponse.BodyHandlers.discarding()).statusCode()).isBetween(200, 299); return assets.confirmProject(f.owner().id(), f.owner().id(), p.id(), intent.asset().id()); }
    private OrderView preparedOrder(Fixture f) {
        var d = new ContentDocument("Explicit private order fixture", "No payment or receipt claimed", List.of(), List.of(new ContentBlock("PARAGRAPH", "Fictitious commercial metadata", null)), null, null, List.of(), List.of(), "PROTECTED", List.of(), List.of());
        var course = publish(f.editor().id(), editorial.create(f.editor().id(), new CreateContent(ResourceKind.COURSE, "fr", "p14-order-" + key(), "Parcours commercial fictif", "Isolated document state only", d.objective(), d.expectedResult(), d, List.of(f.module().versionId()), "Private order fixture")));
        var fields = new OfferFields(List.of(new OfferCopy("fr", "Offre fictive P14", "Only isolated technical data")), List.of(new OfferResourceInput(course.resourceId(), course.versionId())), List.of("fr"), new Money(1200, "EUR"), new OfferTax("INCLUSIVE", List.of(new LocalizedText("fr", "Tax fixture"))), new OfferConditions(new OfferPeriod("FIXED", 30), new OfferPeriod("NONE", null), "PINNED", new OfferSupport("NONE", List.of()), false, "p14-test-terms", List.of(new LocalizedText("fr", "Fictitious terms"))));
        var offer = offers.create(f.editor().id(), f.editor().id(), new CreateOffer("p14-" + key(), "COURSE", fields, "Fictitious document state")); offer = offers.activate(f.editor().id(), f.editor().id(), offer.id(), EntityTags.forRevision("offer", offer.id(), offer.revision()), new ChangeOfferState("Isolated fixture"));
        return orders.create(f.owner().id(), f.owner().id(), key(), new CreateOrder(offer.id(), offer.revision(), "fr", "p14-test-terms")).value();
    }
    private Map<String, Object> ticketBody(Fixture f, List<UUID> files) { return Map.of("category", "CONTENT", "subject", "Question de pratique", "message", "Explicit user-selected context", "locale", "fr", "context", Map.of("locale", "fr", "resourceId", f.activity().resourceId(), "versionId", f.activity().versionId(), "revisionId", f.activity().publishedRevisionId(), "projectId", projectIdForContext(f), "enrollmentId", f.enrollment().summary().id()), "attachmentIds", files); }
    private UUID projectIdForContext(Fixture f) { var ids = jdbc.query("SELECT id FROM projects WHERE owner_id=? ORDER BY created_at,id LIMIT 1", (rs,n) -> rs.getObject(1, UUID.class), f.owner().id()); return ids.isEmpty() ? project(f).id() : ids.getFirst(); }
    private HttpResponse<String> createTicket(Fixture f, List<UUID> files, String idem) throws Exception { return mutate(f.owner(), "POST", "/api/v1/me/support-tickets", ticketBody(f, files), null, idem); }
    private HttpResponse<String> eligibility(Fixture f, String locale) throws Exception { var r = get(f.owner(), eligibilityPath(f, locale)); assertThat(r.statusCode()).isEqualTo(200); return r; }
    private String eligibilityPath(Fixture f, String locale) { return "/api/v1/me/enrollments/" + f.enrollment().summary().id() + "/attestation-eligibility?locale=" + locale; }
    private String issuePath(Fixture f) { return "/api/v1/me/enrollments/" + f.enrollment().summary().id() + "/attestations"; }
    private HttpResponse<String> issue(Fixture f, HttpResponse<String> checked, String locale, String idem) throws Exception { return mutate(f.owner(), "POST", issuePath(f), Map.of("locale", locale, "expectedEvidenceFingerprint", text(checked, "evidenceFingerprint")), null, idem); }
    private HttpResponse<byte[]> downloadAttestation(Account owner, UUID id) throws Exception { return owner.http().send(HttpRequest.newBuilder(uri("/api/v1/me/attestations/" + id + "/document")).GET().build(), HttpResponse.BodyHandlers.ofByteArray()); }
    private void assertCriterion(HttpResponse<String> response, String code, boolean expected) throws Exception { JsonNode found = null; for (var row : tree(response).path("criteria")) if (row.path("code").asText().equals(code)) found = row; assertThat(found).isNotNull(); assertThat(found.path("met").asBoolean()).isEqualTo(expected); }
    private void saveName(Account who, String name) throws Exception { var current = get(who, "/api/v1/me/profile"); assertThat(mutate(who, "PATCH", "/api/v1/me/profile", Collections.singletonMap("displayName", name), tag(current), null).statusCode()).isEqualTo(200); }
    private String notificationState(UUID message) { var values = jdbc.query("SELECT status FROM notification_outbox WHERE business_key=?", (rs,n) -> rs.getString(1), "support:reply:" + message); return values.isEmpty() ? "NONE" : values.getFirst(); }
    private int mailCount(String recipient) { try { var r = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + "/api/v1/messages")).GET().build(), HttpResponse.BodyHandlers.ofString()); int count = 0; for (var message : mapper.readTree(r.body()).path("messages")) for (var address : message.path("To")) if (recipient.equalsIgnoreCase(address.path("Address").asText())) count++; return count; } catch (Exception failure) { throw new IllegalStateException("Read isolated Mailpit failed"); } }
    private JsonNode mailDetail(String recipient) throws Exception { var http = HttpClient.newHttpClient(); String base = "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025); var index = http.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/messages")).GET().build(), HttpResponse.BodyHandlers.ofString()); for (var message : mapper.readTree(index.body()).path("messages")) for (var address : message.path("To")) if (recipient.equalsIgnoreCase(address.path("Address").asText())) return mapper.readTree(http.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/message/" + message.path("ID").asText())).GET().build(), HttpResponse.BodyHandlers.ofString()).body()); throw new IllegalStateException("Isolated delivered message missing"); }
    private static void until(BooleanSupplier condition, int seconds) { long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds); while (System.nanoTime() < deadline) { if (condition.getAsBoolean()) return; try { Thread.sleep(25); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Interrupted isolated test"); } } assertThat(condition.getAsBoolean()).as("Expected isolated persisted state").isTrue(); }
    private Account account(String name, String... roles) throws Exception { UUID id = UUID.randomUUID(); String email = "p14-" + id + "@fixture.invalid", password = "P14-test-only-" + key(); jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,display_name,status) VALUES(?,?,?,?,'ACTIVE')", id, email, encoder.encode(password), name); jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')", UUID.randomUUID(), id); var assigned = new HashSet<>(Arrays.asList(roles)); assigned.add("LEARNER"); for (String role : assigned) assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?", UUID.randomUUID(), id, role)).isEqualTo(1); var who = new Account(HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build(), id, email); var q = HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type", "application/x-www-form-urlencoded").header("X-CSRF-TOKEN", csrf(who)).POST(HttpRequest.BodyPublishers.ofString("email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8))).build(); assertThat(who.http().send(q, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(200); return who; }
    private HttpResponse<String> mutate(Account who, String method, String path, Object body, String etag, String idem) throws Exception { return send(who, method, path, body, csrf(who), etag, idem, who.id().toString()); }
    private HttpResponse<String> send(Account who, String method, String path, Object body, String token, String etag, String idem, String context) throws Exception { var q = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))); if (token != null) q.header("X-CSRF-TOKEN", token); if (etag != null) q.header("If-Match", etag); if (idem != null) q.header("Idempotency-Key", idem); if (context != null) q.header("X-Account-Context", context); return who.http().send(q.build(), HttpResponse.BodyHandlers.ofString()); }
    private HttpResponse<String> get(Account who, String path) throws Exception { return who.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
    private String csrf(Account who) throws Exception { return text(get(who, "/api/v1/auth/csrf"), "token"); }
    private void problem(HttpResponse<String> response, int status, String code) throws Exception { assertThat(response.statusCode()).isEqualTo(status); assertThat(text(response, "code")).isEqualTo(code); assertThat(response.body().contains(PRIVATE_NOTE) || response.body().contains(PRIVATE_PRODUCTION)).isFalse(); }
    private JsonNode tree(HttpResponse<String> r) throws Exception { return mapper.readTree(r.body()); }
    private String text(HttpResponse<String> r, String field) throws Exception { return tree(r).path(field).asText(); }
    private UUID id(HttpResponse<String> r) { try { return UUID.fromString(text(r, "id")); } catch (Exception failure) { throw new IllegalStateException("Expected isolated response UUID"); } }
    private UUID attestationId(HttpResponse<String> r) throws Exception { return UUID.fromString(tree(r).path("summary").path("id").asText()); }
    private static String tag(HttpResponse<?> r) { return r.headers().firstValue("ETag").orElseThrow(); }
    private static String contentTag(ContentView c) { return EntityTags.forRevision("content", c.id(), c.revision()); }
    private static String key() { return UUID.randomUUID().toString(); }
    private static String sha(byte[] value) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
    private static String s3Endpoint() { return "http://127.0.0.1:" + S3.getMappedPort(8333); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private record Account(HttpClient http, UUID id, String email) { }
    private record Fixture(Account owner, Account editor, ContentView activity, ContentView module, ContentView course, EnrollmentView enrollment) { }
}
