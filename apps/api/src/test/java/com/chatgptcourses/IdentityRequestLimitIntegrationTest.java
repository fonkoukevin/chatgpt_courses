package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","STRIPE_ENABLED=false","PAYMENT_INBOX_ENABLED=false","REFUND_WORKER_ENABLED=false","NOTIFICATION_OUTBOX_ENABLED=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class IdentityRequestLimitIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void configuration(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);}
    @Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;@LocalServerPort int port;

    @Test void loginLimitsCommitAcrossFailedAuthenticationAreSessionScopedAndExpire()throws Exception{
        var before=keys();var browser=browser();String token=csrf(browser);
        for(int i=0;i<21;i++)assertThat(login(browser,null).statusCode()).isEqualTo(403);
        assertThat(newBuckets(before)).isEmpty();
        for(int i=0;i<20;i++)problem(login(browser,token),401,"BAD_CREDENTIALS");
        var limited=login(browser,token);problem(limited,429,"RATE_LIMITED");
        assertThat(Integer.parseInt(limited.headers().firstValue("Retry-After").orElseThrow())).isBetween(1,300);
        assertThat(limited.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        var original=newBuckets(before);assertThat(original).hasSize(1);
        String bucket=original.getFirst();assertThat(jdbc.queryForObject("SELECT request_count FROM identity_rate_limits WHERE bucket_key=?",Integer.class,bucket)).isEqualTo(21);
        var other=browser();problem(login(other,csrf(other)),401,"BAD_CREDENTIALS");
        assertThat(newBuckets(before)).hasSize(2);
        // An operational test counter's expired window is explicit; no account or grant dates are changed.
        jdbc.update("UPDATE identity_rate_limits SET window_started_at=clock_timestamp()-interval '6 minutes' WHERE bucket_key=?",bucket);
        problem(login(browser,token),401,"BAD_CREDENTIALS");
        assertThat(jdbc.queryForObject("SELECT request_count FROM identity_rate_limits WHERE bucket_key=?",Integer.class,bucket)).isEqualTo(1);
    }
    @Test void registrationCountsAnAlreadyRegisteredFailureWithoutRollingBackItsLimit()throws Exception{
        var before=keys();var browser=browser();String token=csrf(browser),email=email();
        problem(register(browser,token,email),201,null);
        problem(register(browser,token,email),409,"EMAIL_ALREADY_REGISTERED");
        for(int i=0;i<3;i++)problem(register(browser,token,email()),201,null);
        var limited=register(browser,token,email());problem(limited,429,"RATE_LIMITED");
        assertThat(Integer.parseInt(limited.headers().firstValue("Retry-After").orElseThrow())).isBetween(1,900);
        var buckets=newBuckets(before);assertThat(buckets).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT request_count FROM identity_rate_limits WHERE bucket_key=?",Integer.class,buckets.getFirst())).isEqualTo(6);
        // A registration limit is not a ban on logging into the same session.
        problem(login(browser,token),401,"BAD_CREDENTIALS");
        assertThat(newBuckets(before)).hasSize(2);
    }
    @Test void concurrentRegistrationsShareAnAtomicQuotaAndInvalidCsrfCannotConsumeIt()throws Exception{
        var before=keys();var browser=browser();String token=csrf(browser);
        for(int i=0;i<6;i++)problem(register(browser,null,email()),403,"CSRF_INVALID");
        assertThat(newBuckets(before)).isEmpty();
        for(int i=0;i<4;i++)problem(register(browser,token,email()),201,null);
        var barrier=new CyclicBarrier(2);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var first=pool.submit(()->{barrier.await(5,TimeUnit.SECONDS);return register(browser,token,email()).statusCode();});
            var second=pool.submit(()->{barrier.await(5,TimeUnit.SECONDS);return register(browser,token,email()).statusCode();});
            assertThat(List.of(first.get(20,TimeUnit.SECONDS),second.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,429);
        }
        var buckets=newBuckets(before);assertThat(buckets).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT request_count FROM identity_rate_limits WHERE bucket_key=?",Integer.class,buckets.getFirst())).isEqualTo(6);
    }
    private Set<String> keys(){return Set.copyOf(jdbc.queryForList("SELECT bucket_key FROM identity_rate_limits",String.class));}
    private List<String> newBuckets(Set<String> before){return keys().stream().filter(k->!before.contains(k)).toList();}
    private HttpClient browser(){return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();}
    private String csrf(HttpClient browser)throws Exception{return mapper.readTree(browser.send(HttpRequest.newBuilder(uri("/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).path("token").asText();}
    private HttpResponse<String> login(HttpClient browser,String token)throws Exception{
        var q=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode("unknown@fixture.invalid",StandardCharsets.UTF_8)+"&password=Only-isolated-P17-password"));if(token!=null)q.header("X-CSRF-TOKEN",token);return browser.send(q.build(),HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> register(HttpClient browser,String token,String email)throws Exception{
        var q=HttpRequest.newBuilder(uri("/api/v1/auth/register")).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(Map.of("email",email,"password","Only-isolated-P17-password","locale","fr"))));if(token!=null)q.header("X-CSRF-TOKEN",token);return browser.send(q.build(),HttpResponse.BodyHandlers.ofString());
    }
    private void problem(HttpResponse<String> response,int status,String code)throws Exception{assertThat(response.statusCode()).isEqualTo(status);if(code!=null)assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);}
    private static String email(){return "p17-"+UUID.randomUUID()+"@fixture.invalid";}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
}
