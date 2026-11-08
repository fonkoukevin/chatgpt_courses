package com.chatgptcourses.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.notifications.NotificationTypes.*;
import com.chatgptcourses.NotificationTestKeys;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real PostgreSQL and Mailpit SMTP. Future activation/support events are typed port fixtures, not fake purchases or support CRUD. */
@SpringBootTest(properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false",
        "courses.notifications.outbox.worker-enabled=false","courses.notifications.outbox.max-attempts=2",
        "courses.notifications.outbox.retry-base=1s","courses.notifications.outbox.retry-max=2s"})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class NotificationOutboxIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @Container static final GenericContainer<?> MAILPIT=new GenericContainer<>(DockerImageName.parse("axllent/mailpit:v1.33.0@sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231")).withExposedPorts(1025,8025).waitingFor(Wait.forHttp("/readyz").forPort(8025));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
        r.add("MAIL_HOST",MAILPIT::getHost);r.add("MAIL_PORT",()->MAILPIT.getMappedPort(1025));r.add("MAIL_MODE",()->"local");r.add("MAIL_FROM",()->"noreply@courses.local.invalid");
        r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);
    }
    @Autowired IdentityService identity;
    @Autowired TransactionalNotifications notifications;
    @Autowired NotificationWorker worker;
    @Autowired NotificationOperations operations;
    @Autowired NotificationCipher cipher;
    @Autowired OutboxSettings settings;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired JavaMailSender mail;
    @Autowired ControlledSender controlled;
    private TransactionTemplate transaction(){return new TransactionTemplate(manager);}
    @BeforeEach void restoreTransport(){((JavaMailSenderImpl)mail).setPort(MAILPIT.getMappedPort(1025));drain();}

    @Test void registrationAndRecoveryEnqueueAtomicallyAndRollbackNeverLeaksAnEmail(){
        String absent=email();long before=count();
        assertThat(catchThrowable(()->transaction().executeWithoutResult(status->{identity.register(absent,"Atomic registration 123",null,"fr");throw new IllegalStateException("Deliberate transaction rollback");}))).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE normalized_email=?",Integer.class,absent)).isZero();assertThat(count()).isEqualTo(before);
        var owner=account("fr");long queued=count();
        assertThat(catchThrowable(()->transaction().executeWithoutResult(status->{identity.requestPasswordReset(owner.email(),"en");throw new IllegalStateException("Deliberate transaction rollback");}))).isInstanceOf(IllegalStateException.class);
        assertThat(count()).isEqualTo(queued);assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens WHERE user_id=?",Integer.class,owner.id())).isZero();
        assertThat(catchThrowable(()->notifications.accountCreated(owner.id(),owner.email(),"fr"))).isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    }

    @Test void realRegistrationAndRecoveryAreLocalizedReceivedByMailpitAndPurgedAfterDelivery()throws Exception{
        for(String locale:List.of("fr","en")){
            var owner=account(locale);identity.requestPasswordReset(owner.email(),locale);
            var rows=jdbc.queryForList("SELECT payload_ciphertext FROM notification_outbox WHERE owner_id=?",byte[].class,owner.id());assertThat(rows).hasSize(2);
            for(byte[] encrypted:rows){String encoded=new String(encrypted,StandardCharsets.ISO_8859_1);assertThat(encoded.contains(owner.email())||encoded.contains("token")||encoded.contains("recipient")).as("outbox ciphertext contains no plaintext fields").isFalse();}
            drain();var messages=awaitMessages(owner.email(),2);assertThat(messages.size()).isEqualTo(2);
            String expected="en".equals(locale)?"Reset your ChatGPT Courses password":"Réinitialiser votre mot de passe ChatGPT Courses";
            var reset=messages.stream().filter(value->value.path("Subject").asText().equals(expected)).findFirst().orElseThrow();String body=reset.path("Text").asText();
            var token=Pattern.compile("http://localhost:3000/"+(locale.equals("en")?"en/reset-password":"fr/reinitialisation")+"#token=([A-Za-z0-9_-]{43})").matcher(body);assertThat(token.find()).as("recovery uses configured origin and fragment").isTrue();
            assertThat(messages.stream().anyMatch(value->value.path("Subject").asText().equals(locale.equals("en")?"Your ChatGPT Courses account was created":"Votre compte ChatGPT Courses a été créé"))).isTrue();
            identity.resetPassword(token.group(1),"Actually changed password 456");assertThat(identity.loadSessionUser(owner.id()).orElseThrow().authenticationVersion()).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE owner_id=? AND status='SENT' AND payload_ciphertext IS NULL AND purged_at IS NOT NULL",Integer.class,owner.id())).isEqualTo(2);
        }
    }

    @Test void encryptionUsesAuthenticatedUniqueNoncesAndThePersistedKeySurvivesANewCipherInstance()throws Exception{
        var owner=account("fr");String token=randomToken();Instant expiry=Instant.now().plusSeconds(120);
        UUID id=transaction().execute(status->notifications.passwordReset(owner.id(),digest(token),owner.email(),"fr",token,expiry));
        var row=jdbc.queryForMap("SELECT payload_ciphertext,business_key FROM notification_outbox WHERE id=?",id);byte[] encrypted=(byte[])row.get("payload_ciphertext");String key=(String)row.get("business_key");var claim=new Claim(id,Type.PASSWORD_RESET,UUID.randomUUID(),encrypted,key,expiry);
        var payload=new NotificationCipher(settings,mapper).decrypt(claim);assertThat(payload.token().equals(token)).as("decrypted token matches without printing it").isTrue();assertThat(payload.recipient().equals(owner.email())).isTrue();
        assertThat(cipher.encrypt(id,Type.PASSWORD_RESET,key,payload)).isNotEqualTo(encrypted);
        assertThat(catchThrowable(()->cipher.decrypt(new Claim(UUID.randomUUID(),Type.PASSWORD_RESET,UUID.randomUUID(),encrypted,key,expiry)))).isInstanceOf(IllegalStateException.class);
        byte[] changed=encrypted.clone();changed[changed.length-1]^=1;assertThat(catchThrowable(()->cipher.decrypt(new Claim(id,Type.PASSWORD_RESET,UUID.randomUUID(),changed,key,expiry)))).isInstanceOf(IllegalStateException.class);
        assertThat(claim.toString().contains(token)||claim.toString().contains(owner.email())).isFalse();assertThat(settings.toString().contains(settings.encryptionKey())).isFalse();
    }

    @Test void concurrentBusinessEventsDeduplicateBeforeSmtpAndBodyChangesConflict()throws Exception{
        var owner=account("en");drain();UUID event=UUID.randomUUID(),ticket=UUID.randomUUID();var start=new CountDownLatch(1);
        UUID a,b;try(var pool=Executors.newFixedThreadPool(2)){
            var first=pool.submit(()->{start.await();return transaction().execute(status->notifications.supportReply(event,owner.id(),owner.email(),"en",ticket));});
            var second=pool.submit(()->{start.await();return transaction().execute(status->notifications.supportReply(event,owner.id(),owner.email(),"en",ticket));});start.countDown();a=first.get(10,TimeUnit.SECONDS);b=second.get(10,TimeUnit.SECONDS);
        }
        assertThat(a).isEqualTo(b);assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE business_key=?",Integer.class,"support:reply:"+event)).isEqualTo(1);
        expect(ApiError.CONFLICT,()->transaction().executeWithoutResult(status->notifications.supportReply(event,owner.id(),owner.email(),"fr",ticket)));
        try(var pool=Executors.newFixedThreadPool(2)){var one=pool.submit(worker::runOnce);var two=pool.submit(worker::runOnce);one.get(15,TimeUnit.SECONDS);two.get(15,TimeUnit.SECONDS);}
        assertThat(status(a)).isEqualTo("SENT");assertThat(awaitMessages(owner.email(),2).stream().filter(value->value.path("Subject").asText().equals("A support update is available")).count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT attempts FROM notification_outbox WHERE id=?",Integer.class,a)).isEqualTo(1);
    }

    @Test void aRealConnectionFailureRetriesWithBackoffWithoutBlockingTheBusinessTransaction()throws Exception{
        var owner=account("fr");drain();UUID event=UUID.randomUUID();UUID id=transaction().execute(status->notifications.accessActivated(event,owner.id(),owner.email(),"fr","Référence fictive sans achat"));
        int closed;try(var socket=new ServerSocket(0)){closed=socket.getLocalPort();}((JavaMailSenderImpl)mail).setPort(closed);
        try{runUntilAttempt(id);assertThat(status(id)).isEqualTo("RETRY");var row=jdbc.queryForMap("SELECT next_attempt_at,updated_at,last_error_code FROM notification_outbox WHERE id=?",id);assertThat(((java.sql.Timestamp)row.get("next_attempt_at")).toInstant()).isAfter(((java.sql.Timestamp)row.get("updated_at")).toInstant());assertThat(row.get("last_error_code")).isEqualTo("SMTP_CONNECT");}
        finally{((JavaMailSenderImpl)mail).setPort(MAILPIT.getMappedPort(1025));}
        Thread.sleep(1150);drain();assertThat(status(id)).isEqualTo("SENT");assertThat(jdbc.queryForObject("SELECT attempts FROM notification_outbox WHERE id=?",Integer.class,id)).isEqualTo(2);
        assertThat(awaitMessages(owner.email(),2).stream().filter(value->value.path("Subject").asText().contains("accès de formation")).count()).isEqualTo(1);
    }

    @Test void exhaustedTransportIsDeadAndOnlyAnAuthorizedExplicitOperationCanResumeIt()throws Exception{
        var owner=account("en");drain();UUID id=transaction().execute(status->notifications.supportReply(UUID.randomUUID(),owner.id(),owner.email(),"en",UUID.randomUUID()));
        int closed;try(var socket=new ServerSocket(0)){closed=socket.getLocalPort();}((JavaMailSenderImpl)mail).setPort(closed);
        try{runUntilAttempt(id);Thread.sleep(1150);drain();assertThat(status(id)).isEqualTo("DEAD");}
        finally{((JavaMailSenderImpl)mail).setPort(MAILPIT.getMappedPort(1025));}
        assertThat(catchThrowable(()->operations.list(owner.id(),null,0,20))).isInstanceOf(AccessDeniedException.class);
        assertThat(catchThrowable(()->operations.retry(owner.id(),owner.id(),id,"CONFIGURATION_FIXED",false))).isInstanceOf(AccessDeniedException.class);
        grantOperator(owner.id());var before=operations.list(owner.id(),"DEAD",0,100);assertThat(before.items().stream().anyMatch(value->value.id().equals(id))).isTrue();
        var resumed=operations.retry(owner.id(),owner.id(),id,"CONFIGURATION_FIXED",false);assertThat(resumed.status()).isEqualTo("RETRY");assertThat(resumed.cycleAttempts()).isZero();assertThat(resumed.attempts()).isEqualTo(2);drain();assertThat(status(id)).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox_requeues WHERE notification_id=?",Integer.class,id)).isEqualTo(1);
        String operational=mapper.writeValueAsString(operations.list(owner.id(),null,0,100));assertThat(operational.contains(owner.email())||operational.contains("ciphertext")||operational.contains("businessKey")||operational.contains("payload_fingerprint")).as("operational output excludes sensitive fields").isFalse();
    }

    @Test void anAbandonedLeaseBecomesIndeterminateWithoutAutomaticResendAndRequiresDuplicateAcknowledgement(){
        var owner=account("fr");drain();UUID id=transaction().execute(status->notifications.supportReply(UUID.randomUUID(),owner.id(),owner.email(),"fr",UUID.randomUUID()));
        jdbc.update("UPDATE notification_outbox SET status='PROCESSING',next_attempt_at=NULL,lease_id=?,lease_until=clock_timestamp()-interval '1 second',attempts=1,cycle_attempts=1,updated_at=clock_timestamp() WHERE id=?",UUID.randomUUID(),id);
        worker.runOnce();assertThat(status(id)).isEqualTo("INDETERMINATE");assertThat(jdbc.queryForObject("SELECT attempts FROM notification_outbox WHERE id=?",Integer.class,id)).isEqualTo(1);
        grantOperator(owner.id());expect(ApiError.CONFLICT,()->operations.retry(owner.id(),owner.id(),id,"MANUAL_RECONCILIATION",false));
        operations.retry(owner.id(),owner.id(),id,"MANUAL_RECONCILIATION",true);drain();assertThat(status(id)).isEqualTo("SENT");
    }

    @Test void anExpiredRecoveryPayloadIsPurgedAndCannotBeRequeued()throws Exception{
        var owner=account("fr");drain();String token=randomToken();Instant expires=Instant.now().plusSeconds(2);
        UUID id=transaction().execute(status->notifications.passwordReset(owner.id(),digest(token),owner.email(),"fr",token,expires));Thread.sleep(2150);
        boolean databaseExpired=Boolean.TRUE.equals(jdbc.queryForObject("SELECT expires_at<=clock_timestamp() FROM notification_outbox WHERE id=?",Boolean.class,id));boolean applicationExpired=!expires.isAfter(Instant.now());worker.runOnce();
        assertThat(status(id)).as("expiry checkpoints: applicationExpired=%s databaseExpired=%s",applicationExpired,databaseExpired).isEqualTo("DEAD");assertThat(jdbc.queryForObject("SELECT payload_ciphertext IS NULL AND purged_at IS NOT NULL FROM notification_outbox WHERE id=?",Boolean.class,id)).isTrue();
        grantOperator(owner.id());expect(ApiError.CONFLICT,()->operations.retry(owner.id(),owner.id(),id,"CONFIGURATION_FIXED",false));assertThat(messages(owner.email()).size()).isEqualTo(1);
    }

    @Test void smtpDeliveryHoldsNoDatabaseClaimTransactionAndAnotherBusinessEventCanCommit()throws Exception{
        var owner=account("en");drain();UUID id=transaction().execute(status->notifications.supportReply(UUID.randomUUID(),owner.id(),owner.email(),"en",UUID.randomUUID()));
        controlled.pause(id);
        try(var executor=Executors.newSingleThreadExecutor()){
            var delivery=executor.submit(worker::runOnce);
            try{
                assertThat(controlled.arrived.await(5,TimeUnit.SECONDS)).as("worker reached delivery outside its claim").isTrue();
                transaction().executeWithoutResult(status->{var unlocked=jdbc.queryForObject("SELECT id FROM notification_outbox WHERE id=? FOR UPDATE NOWAIT",UUID.class,id);assertThat(unlocked).isEqualTo(id);});
                UUID second=transaction().execute(status->notifications.accessActivated(UUID.randomUUID(),owner.id(),owner.email(),"en","Explicit future-event fixture"));assertThat(second).isNotNull();assertThat(status(second)).isEqualTo("PENDING");
            }finally{controlled.release.countDown();}
            assertThat(delivery.get(10,TimeUnit.SECONDS)).isTrue();assertThat(status(id)).isEqualTo("SENT");
        }finally{controlled.paused=null;controlled.release.countDown();}
    }

    private Owner account(String locale){String email=email();var profile=identity.register(email,"Outbox isolated password 123",null,locale);return new Owner(profile.id(),email);}
    private static String email(){return "p10."+UUID.randomUUID()+"@courses.invalid";}
    private long count(){return jdbc.queryForObject("SELECT count(*) FROM notification_outbox",Long.class);}
    private String status(UUID id){return jdbc.queryForObject("SELECT status FROM notification_outbox WHERE id=?",String.class,id);}
    private void runUntilAttempt(UUID id){for(int i=0;i<100;i++){if(jdbc.queryForObject("SELECT attempts FROM notification_outbox WHERE id=?",Integer.class,id)>0)return;worker.runOnce();}throw new AssertionError("Expected an outbox attempt");}
    private void drain(){for(int i=0;i<100&&worker.runOnce();i++){/* SMTP delivery is outside the claim transaction. */}}
    private void grantOperator(UUID owner){UUID role=UUID.randomUUID();jdbc.update("INSERT INTO roles(id,code) VALUES(?,?)",role,"MAIL_OP_"+UUID.randomUUID().toString().substring(0,8).toUpperCase(java.util.Locale.ROOT));jdbc.update("INSERT INTO user_roles(id,user_id,role_id) VALUES(?,?,?)",UUID.randomUUID(),owner,role);jdbc.update("INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),?,id FROM permissions WHERE code IN('notifications.read','notifications.manage')",role);}
    private List<JsonNode> messages(String recipient)throws Exception{
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();String base="http://"+MAILPIT.getHost()+":"+MAILPIT.getMappedPort(8025);
        var response=http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/messages")).timeout(Duration.ofSeconds(5)).GET().build(),HttpResponse.BodyHandlers.ofString());var result=new ArrayList<JsonNode>();
        for(var message:mapper.readTree(response.body()).path("messages")){boolean matches=false;for(var to:message.path("To"))if(recipient.equals(to.path("Address").asText()))matches=true;if(matches){var detail=http.send(HttpRequest.newBuilder(URI.create(base+"/api/v1/message/"+message.path("ID").asText())).timeout(Duration.ofSeconds(5)).GET().build(),HttpResponse.BodyHandlers.ofString());result.add(mapper.readTree(detail.body()));}}
        return result;
    }
    private List<JsonNode> awaitMessages(String recipient,int count)throws Exception{long deadline=System.nanoTime()+Duration.ofSeconds(5).toNanos();List<JsonNode> result;do{result=messages(recipient);if(result.size()>=count)return result;Thread.sleep(50);}while(System.nanoTime()<deadline);return result;}
    private static String digest(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII)));}catch(java.security.NoSuchAlgorithmException failure){throw new AssertionError("SHA-256 unavailable");}}
    private static String randomToken(){byte[] value=new byte[32];new java.security.SecureRandom().nextBytes(value);return Base64.getUrlEncoder().withoutPadding().encodeToString(value);}
    private static void expect(ApiError error,Runnable action){var failure=catchThrowable(action::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private record Owner(UUID id,String email){@Override public String toString(){return "Owner[redacted]";}}
    /** Synchronizes one worker before the real SMTP call; it never fabricates a delivery or an access right. */
    static final class ControlledSender implements NotificationSender {
        private final SmtpNotificationSender smtp;
        volatile UUID paused;
        CountDownLatch arrived=new CountDownLatch(0),release=new CountDownLatch(0);
        ControlledSender(SmtpNotificationSender smtp){this.smtp=smtp;}
        void pause(UUID id){arrived=new CountDownLatch(1);release=new CountDownLatch(1);paused=id;}
        @Override public void send(UUID id,Type type,Payload payload){if(id.equals(paused)){arrived.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Controlled delivery wait expired");}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("Controlled delivery interrupted");}}smtp.send(id,type,payload);}
    }
    @TestConfiguration static class DeliveryConfiguration {
        @Bean @Primary ControlledSender controlledSender(SmtpNotificationSender smtp){return new ControlledSender(smtp);}
    }
}
