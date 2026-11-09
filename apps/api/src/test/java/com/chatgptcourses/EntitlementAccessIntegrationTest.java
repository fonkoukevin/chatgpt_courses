package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import static com.chatgptcourses.projects.service.ProjectTypes.*;
import com.chatgptcourses.access.*;
import com.chatgptcourses.assets.service.AssetAccessPolicy;
import com.chatgptcourses.assets.service.AssetTypes.AssetAccessContext;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.EntityTags;
import java.net.*;
import java.net.http.*;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

/** Real PostgreSQL and HTTP consumption policy; MANUAL_TEST is an explicit fixture, never a payment proof. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","STRIPE_ENABLED=false","PAYMENT_INBOX_ENABLED=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class EntitlementAccessIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry p){p.add("POSTGRES_HOST",POSTGRES::getHost);p.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));p.add("POSTGRES_DB",POSTGRES::getDatabaseName);p.add("POSTGRES_USER",POSTGRES::getUsername);p.add("POSTGRES_PASSWORD",POSTGRES::getPassword);p.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);}
    @Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;@Autowired PasswordEncoder encoder;
    @Autowired EditorialService editorial;@Autowired EntitlementAccess rights;@Autowired MemberContentService members;
    @Autowired PublicCatalogueService catalogue;@Autowired LearningService learning;@Autowired ProjectService projects;@Autowired AssetAccessPolicy assets;
    @Autowired PlatformTransactionManager transactions;
    @LocalServerPort int port;

    @Test void independentOriginsLanguagesAndPeriodsNeverBecomeOneUserCourseBoolean(){
        var owner=account(false);var other=account(false);var fixture=fixture(account(true).id());
        UUID first=grant(owner.id(),fixture.course(),"[\"fr\"]","PINNED","clock_timestamp()-interval '1 minute'","clock_timestamp()+interval '1 day'",null);
        assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isTrue();
        assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"en")).isFalse();
        assertThat(rights.covers(other.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isFalse();
        assertThat(rights.coveredVersions(owner.id(),"fr").contains(fixture.activity().versionId())).isTrue();
        assertThat(rights.coveredVersions(owner.id(),"en").contains(fixture.activity().versionId())).isFalse();
        assertThat(rights.coveredVersions(other.id(),"fr").contains(fixture.activity().versionId())).isFalse();
        UUID second=grant(owner.id(),fixture.course(),"[\"fr\",\"en\"]","PINNED","clock_timestamp()-interval '1 minute'","clock_timestamp()+interval '1 day'",null);
        revoke(first);assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isTrue();
        revoke(second);assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isFalse();
        assertThat(rights.coveredVersions(owner.id(),"fr").contains(fixture.activity().versionId())).isFalse();
        grant(owner.id(),fixture.course(),"[\"fr\"]","PINNED","clock_timestamp()-interval '2 days'","clock_timestamp()-interval '1 day'",null);
        grant(owner.id(),fixture.course(),"[\"fr\"]","PINNED","clock_timestamp()+interval '1 day'","clock_timestamp()+interval '2 days'",null);
        assertThat(rights.covers(owner.id(),fixture.course().resourceId(),fixture.course().versionId(),"fr")).isFalse();
        var production=new EntitlementAccess(jdbc,new RuntimeProperties("production",URI.create("https://courses.invalid"),true));
        grant(owner.id(),fixture.course(),"[\"fr\",\"en\"]","PINNED","clock_timestamp()-interval '1 minute'",null,null);
        assertThat(production.covers(owner.id(),fixture.course().resourceId(),fixture.course().versionId(),"fr")).isFalse();
        assertThat(production.coveredVersions(owner.id(),"fr").contains(fixture.course().versionId())).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,owner.id())).isEqualTo(5);
    }

    @Test void pinnedCourseAndUpdateWindowKeepExactDescendantsAndWithdrawnPathsStayClosed(){
        var editor=account(true);var owner=account(false);var fixture=fixture(editor.id());
        grant(owner.id(),fixture.course(),"[\"fr\",\"en\"]","PINNED","clock_timestamp()-interval '1 minute'",null,null);
        var current=editorial.get(editor.id(),fixture.course().id());
        var draft=editorial.newVersion(editor.id(),current.id(),tag(current),new NewVersion("Another task","Additional evidence","Another teaching version","Explicit technical fixture",current.document(),List.of(fixture.module().versionId()),"New pedagogical version"));
        var next=publish(editor.id(),draft);
        assertThat(rights.covers(owner.id(),next.resourceId(),next.versionId(),"fr")).isFalse();
        assertThat(rights.coveredVersions(owner.id(),"fr").contains(next.versionId())).isFalse();
        grant(owner.id(),fixture.course(),"[\"fr\"]","UPDATES_DURING_PERIOD","clock_timestamp()-interval '1 minute'",null,"clock_timestamp()+interval '1 day'");
        assertThat(rights.covers(owner.id(),next.resourceId(),next.versionId(),"fr")).isTrue();
        assertThat(rights.coveredVersions(owner.id(),"fr").contains(next.versionId())).isTrue();
        assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isTrue();
        var module=editorial.get(editor.id(),fixture.module().id());editorial.archive(editor.id(),module.id(),tag(module),new ArchiveContent("Withdraw a path, preserve grants and work"));
        assertThat(rights.covers(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr")).isFalse();
        assertThat(rights.coveredVersions(owner.id(),"fr").contains(fixture.activity().versionId())).isFalse();
        assertThat(members.detail(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr").document()).isNull();
    }

    @Test void actualPrivateHttpRequiresItsOwnerAndThePublicRouteNeverLeaksPaidBodies()throws Exception{
        var owner=account(false);var other=account(false);var fixture=fixture(account(true).id());
        String path="/api/v1/me/resources/"+fixture.activity().resourceId()+"/versions/"+fixture.activity().versionId()+"?locale=fr";
        var a=login(owner);var b=login(other);
        assertThat(get(a,path).statusCode()).isEqualTo(403);assertThat(get(browser(),path).statusCode()).isEqualTo(401);
        grant(owner.id(),fixture.course(),"[\"fr\",\"en\"]","PINNED","clock_timestamp()-interval '1 minute'",null,null);
        var allowed=get(a,path);assertThat(allowed.statusCode()).isEqualTo(200);assertThat(allowed.headers().firstValue("Cache-Control").orElse("")).contains("private","no-store");
        var json=mapper.readTree(allowed.body());assertThat(json.path("document").path("access").asText()).isEqualTo("PROTECTED");
        assertThat(allowed.body().contains("ONLY_MEMBER_BODY")).isTrue();assertThat(allowed.body().contains("ONLY_REVEALED_SOLUTION")).isFalse();assertThat(allowed.body().contains("correctOption")).isFalse();assertThat(allowed.body().contains("password_hash")).isFalse();
        assertThat(get(b,path).statusCode()).isEqualTo(403);
        var publicResult=get(a,"/api/v1/catalog/resources/"+fixture.activity().resourceId()+"/versions/"+fixture.activity().versionId()+"?locale=fr");
        assertThat(publicResult.statusCode()).isEqualTo(200);assertThat(mapper.readTree(publicResult.body()).path("document").isNull()).isTrue();assertThat(publicResult.body().contains("ONLY_MEMBER_BODY")).isFalse();
        assets.editorialDownload(owner.id(),fixture.file(),"FILE","fr",new AssetAccessContext("fr",fixture.activity().resourceId(),fixture.activity().versionId(),null));
        assertThat(catchThrowable(()->assets.editorialDownload(other.id(),fixture.file(),"FILE","fr",new AssetAccessContext("fr",fixture.activity().resourceId(),fixture.activity().versionId(),null)))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void freshlyCommittedPostgresTimestampIsReadableInParallelMemberAndLearningTransactions()throws Exception{
        var owner=account(false);var fixture=fixture(account(true).id());
        var firstSession=login(owner);var secondSession=login(owner);
        String memberPath="/api/v1/me/resources/"+fixture.activity().resourceId()+"/versions/"+fixture.activity().versionId();
        assertThat(get(firstSession,memberPath+"?locale=fr").statusCode()).isEqualTo(403);
        assertThat(get(secondSession,memberPath+"?locale=en").statusCode()).isEqualTo(403);
        UUID origin=UUID.randomUUID();
        // Match activation's PG -> Instant -> Timestamp binding, without the other fixtures' one-minute margin.
        Instant activated=new TransactionTemplate(transactions).execute(status->{
            Instant now=jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();
            jdbc.update("""
                INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at)
                VALUES(?,?,?,?,'MANUAL_TEST',?,'["fr","en"]'::jsonb,'PINNED',?)
                """,origin,owner.id(),fixture.course().resourceId(),fixture.course().versionId(),UUID.randomUUID(),Timestamp.from(now));
            return now;
        });
        assertThat(activated).isNotNull();
        assertThat(jdbc.queryForObject("SELECT starts_at=? FROM access_grants WHERE id=?",Boolean.class,Timestamp.from(activated),origin)).isTrue();
        assertThat(jdbc.queryForObject("SELECT starts_at<=clock_timestamp() FROM access_grants WHERE id=?",Boolean.class,origin))
            .as("PostgreSQL must see the freshly committed origin as started").isTrue();
        var enrollment=learning.enroll(owner.id(),owner.id(),new EnrollCourse(fixture.course().resourceId(),fixture.course().versionId(),"fr")).value();
        var tasks=new ArrayList<Callable<Void>>();var start=new CyclicBarrier(8);
        for(int index=0;index<8;index++){
            String locale=index%4<2?"fr":"en";var session=index%2==0?firstSession:secondSession;
            tasks.add(()->{
                start.await(10,TimeUnit.SECONDS);
                var member=get(session,memberPath+"?locale="+locale);
                if(member.statusCode()!=200)captureFreshFailure(member,session,owner.id(),fixture,locale,"member");
                assertThat(member.statusCode()).as("Fresh-origin member HTTP status").isEqualTo(200);
                var memberJson=mapper.readTree(member.body());
                if(!memberJson.path("document").isObject())captureFreshFailure(member,session,owner.id(),fixture,locale,"member-body");
                assertThat(memberJson.path("document").isObject()).isTrue();
                assertThat(member.body().contains("ONLY_MEMBER_BODY")).isTrue();
                var activity=get(session,"/api/v1/me/enrollments/"+enrollment.summary().id()+"/activities/"+fixture.activity().resourceId()
                    +"?activityVersionId="+fixture.activity().versionId()+"&locale="+locale);
                if(activity.statusCode()!=200)captureFreshFailure(activity,session,owner.id(),fixture,locale,"activity");
                assertThat(activity.statusCode()).as("Fresh-origin learning HTTP status").isEqualTo(200);
                var activityJson=mapper.readTree(activity.body());
                if(!"ACTIVE".equals(activityJson.path("accessStatus").asText())||!"PUBLISHED".equals(activityJson.path("availability").asText())||!activityJson.path("resource").path("document").isObject())captureFreshFailure(activity,session,owner.id(),fixture,locale,"activity-state");
                assertThat(activityJson.path("accessStatus").asText()).isEqualTo("ACTIVE");
                assertThat(activityJson.path("availability").asText()).isEqualTo("PUBLISHED");
                assertThat(activityJson.path("resource").path("locale").asText()).isEqualTo(locale);
                assertThat(activityJson.path("resource").path("document").isObject()).isTrue();
                return null;
            });
        }
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()){
            for(var result:executor.invokeAll(tasks,30,TimeUnit.SECONDS))result.get();
        }
    }

    private void captureFreshFailure(HttpResponse<String> response,HttpClient session,UUID owner,Fixture fixture,String locale,String operation)throws Exception{
        // Invoked only after the single unexpected read. Never retries member/activity/covers or changes a date.
        var report=new LinkedHashMap<String,Object>();report.put("operation",operation);report.put("locale",locale);report.put("httpStatus",response.statusCode());report.put("capturedAfterUnexpectedRead",true);
        try{
            var problem=mapper.readTree(response.body());String code=problem.path("code").asText();if(code.matches("[A-Z0-9_]{1,80}"))report.put("problemCode",code);
            var me=get(session,"/api/v1/auth/me");report.put("sessionHttpStatus",me.statusCode());
            var principal=mapper.readTree(me.body());boolean permission=false;for(var p:principal.path("permissions"))if("learning.read".equals(p.asText()))permission=true;report.put("sessionLearningRead",permission);
            report.put("ownerActive",jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts WHERE id=? AND status='ACTIVE')",Boolean.class,owner));
            var nodes=new ArrayList<Map<String,Object>>();
            for(var node:List.of(fixture.course(),fixture.module(),fixture.activity()))nodes.add(jdbc.queryForMap("""
                SELECT r.kind,r.archived_at IS NULL AS unarchived,t.id IS NOT NULL AS locale_exists,
                  coalesce(t.editorial_state NOT IN('ARCHIVED','STALE'),false) AS translation_available,
                  e.id IS NOT NULL AND e.document_json IS NOT NULL AS published_document,
                  t.id IS NOT NULL AND(t.source_translation_id IS NULL OR coalesce(t.published_source_revision_id=s.current_revision_id AND s.editorial_state NOT IN('ARCHIVED','STALE'),false)) AS source_fresh
                FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id
                LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
                LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations s ON s.id=t.source_translation_id
                WHERE v.id=? AND v.resource_id=?
                """,locale,node.versionId(),node.resourceId()));
            report.put("exactPinnedNodes",nodes);
            report.put("origins",jdbc.queryForList("""
                WITH observed AS MATERIALIZED(SELECT clock_timestamp() AS at)
                SELECT g.revoked_at IS NULL AS not_revoked,g.starts_at<=observed.at AS started,
                  g.expires_at IS NULL OR g.expires_at>observed.at AS unexpired,g.locales @> ?::jsonb AS locale_included,
                  g.version_id=? AS exact_version,g.origin_type='MANUAL_TEST' AS expected_manual_test_origin,
                  round(extract(epoch FROM(g.starts_at-observed.at))*1000000)::bigint AS start_delta_microseconds,
                  round(extract(epoch FROM observed.at)*1000000)::bigint AS observed_database_microseconds,
                  round(extract(epoch FROM g.starts_at)*1000000)::bigint AS starts_at_microseconds
                FROM access_grants g CROSS JOIN observed WHERE g.owner_id=? AND g.resource_id=? ORDER BY g.created_at
                ""","[\""+locale+"\"]",fixture.course().versionId(),owner,fixture.course().resourceId()));
        }catch(Exception unavailable){report.put("diagnosticAvailable",false);}
        try{var directory=java.nio.file.Path.of("../../.runtime").toAbsolutePath().normalize();java.nio.file.Files.createDirectories(directory);var path=java.nio.file.Files.createTempFile(directory,"p17-fresh-access-refusal-",".json");java.nio.file.Files.write(path,mapper.writeValueAsBytes(report));}catch(java.io.IOException unavailable){/* The original HTTP/access assertion still fails; a diagnostic must never replace it. */}
    }

    @Test void protectedLearningAndProjectsWorkAfterARealGrantAndPersonalWorkSurvivesRevocation(){
        var owner=account(false);var fixture=fixture(account(true).id());
        assertThat(catchThrowable(()->learning.enroll(owner.id(),owner.id(),new EnrollCourse(fixture.course().resourceId(),fixture.course().versionId(),"fr")))).isInstanceOf(AccessDeniedException.class);
        UUID origin=grant(owner.id(),fixture.course(),"[\"fr\",\"en\"]","PINNED","clock_timestamp()-interval '1 minute'",null,null);
        var enrollment=learning.enroll(owner.id(),owner.id(),new EnrollCourse(fixture.course().resourceId(),fixture.course().versionId(),"fr")).value();
        var activity=learning.activity(owner.id(),enrollment.summary().id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr");
        assertThat(activity.accessStatus()).isEqualTo("ACTIVE");assertThat(activity.resource().document()).isNotNull();assertThat(activity.progress().completedAt()).isNull();
        var note=learning.createNote(owner.id(),owner.id(),new CreateActivityNote(fixture.activity().resourceId(),fixture.activity().versionId(),"fr","Private retained note"));
        var attempt=learning.submitQuiz(owner.id(),owner.id(),fixture.activity().resourceId(),new SubmitQuiz(enrollment.summary().id(),fixture.activity().versionId(),fixture.activity().publishedRevisionId(),"fr",UUID.randomUUID(),List.of(new QuizAnswer("facts",0))));assertThat(attempt.passed()).isTrue();
        var template=projects.memberTemplate(owner.id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr");assertThat(template.availability()).isEqualTo("PUBLISHED");
        var fields=new ProjectFields("Retained draft","fr","","","","","","","","My private production");
        var project=projects.create(owner.id(),owner.id(),new CreateProject(UUID.randomUUID(),fixture.activity().resourceId(),fixture.activity().versionId(),fixture.activity().publishedRevisionId(),"fr",enrollment.summary().id(),fields,"DRAFT")).value();
        var reveal=new RevealSolution(project.id(),project.currentRevisionId(),fixture.activity().versionId(),fixture.activity().publishedRevisionId(),"fr");
        assertThat(projects.reveal(owner.id(),owner.id(),fixture.activity().resourceId(),reveal).correction()).contains("ONLY_REVEALED_SOLUTION");assertThat(projects.status(owner.id(),project.id()).state()).isEqualTo("DRAFT");
        revoke(origin);
        assertThat(learning.activity(owner.id(),enrollment.summary().id(),fixture.activity().resourceId(),fixture.activity().versionId(),"fr").resource().document()).isNull();
        assertThat(catchThrowable(()->projects.reveal(owner.id(),owner.id(),fixture.activity().resourceId(),reveal))).isInstanceOf(AccessDeniedException.class);
        assertThat(projects.get(owner.id(),project.id()).fields()).isEqualTo(fields);assertThat(learning.note(owner.id(),note.id()).text()).isEqualTo("Private retained note");assertThat(learning.attempts(owner.id(),fixture.activity().versionId(),0,20).total()).isEqualTo(1);
    }

    private Account account(boolean editor){UUID id=UUID.randomUUID();String password="Test-"+UUID.randomUUID()+"!",email=id+"@example.invalid";jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,?,'ACTIVE')",id,email,encoder.encode(password));jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),id);jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='LEARNER'",id);if(editor)jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='EDITOR'",id);return new Account(id,email,password);}
    private Fixture fixture(UUID editor){UUID file=UUID.randomUUID();var activity=publish(editor,create(editor,ResourceKind.ACTIVITY,List.of(),document(file)));translate(editor,activity);var module=publish(editor,create(editor,ResourceKind.MODULE,List.of(activity.versionId()),parent()));translate(editor,module);var course=publish(editor,create(editor,ResourceKind.COURSE,List.of(module.versionId()),parent()));translate(editor,course);return new Fixture(activity,module,course,file);}
    private ContentView create(UUID editor,ResourceKind kind,List<UUID> children,ContentDocument doc){return editorial.create(editor,new CreateContent(kind,"fr","access-"+UUID.randomUUID(),"Isolated access fixture","Not a commercial programme","Use given facts","Declared evidence",doc,children,"Explicit technical fixture"));}
    private ContentView publish(UUID editor,ContentView c){c=editorial.get(editor,c.id());if(c.state()==EditorialState.DRAFT||c.state()==EditorialState.STALE)c=editorial.transition(editor,c.id(),tag(c),new TransitionContent(EditorialState.TO_REVIEW,"Request fixture review",null));UUID source=c.sourceTranslationId()==null?null:editorial.get(editor,c.sourceTranslationId()).currentRevisionId();c=editorial.transition(editor,c.id(),tag(c),new TransitionContent(EditorialState.READY,"Review exact fixture",source));return editorial.publish(editor,c.id(),tag(c),new PublishContent(c.currentRevisionId(),"Publish isolated fixture"));}
    private ContentView translate(UUID editor,ContentView fr){var current=editorial.get(editor,fr.id());var doc=current.kind()==ResourceKind.ACTIVITY?document(current.document().media().getFirst().assetId(),"en"):current.document();return publish(editor,editorial.translate(editor,current.id(),tag(current),new CreateTranslation("en","access-en-"+UUID.randomUUID(),"English technical fixture","Equivalent technical fixture",doc,"Explicit equivalent translation")));}
    private ContentDocument document(UUID file){return document(file,"fr");}
    private ContentDocument document(UUID file,String locale){try(var input=new ClassPathResource("editorial/project-presets.json").getInputStream()){for(var p:mapper.readTree(input))if(p.path("caseCode").asText().equals("BR01")&&p.path("locale").asText().equals(locale)){var policy=mapper.treeToValue(p.path("policy"),ProjectPolicy.class);policy=new ProjectPolicy("BR01",policy.passPoints(),"EXPLICIT",policy.blockingIssues());var rubric=Arrays.asList(mapper.treeToValue(p.path("rubric"),RubricCriterion[].class));return new ContentDocument("Keep supplied facts","A checked brief",List.of(),List.of(new ContentBlock("PARAGRAPH","ONLY_MEMBER_BODY",null)),null,new Exercise("Prepare a brief","ONLY_REVEALED_SOLUTION"),List.of(new QuizQuestion("facts","Which fact is supplied?",List.of("Supplied","Invented"),0,"Use the source",1)),rubric,"PROTECTED",List.of(new MediaReference(file,"FILE",false,"Unavailable technical file fixture")),List.of(),null,new QuizPolicy(100,3),policy);}throw new IllegalStateException("Preset missing");}catch(java.io.IOException e){throw new IllegalStateException("Preset unavailable",e);}}
    private static ContentDocument parent(){return new ContentDocument("Use exact versions","Declared evidence",List.of(),List.of(new ContentBlock("PARAGRAPH","Technical programme only",null)),null,null,List.of(),List.of(),"PROTECTED",List.of(),List.of());}
    private UUID grant(UUID owner,ContentView course,String locales,String policy,String start,String end,String updates){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at,updates_until) VALUES(?,?,?,?,'MANUAL_TEST',?,?::jsonb,?,"+start+","+(end==null?"NULL":end)+","+(updates==null?"NULL":updates)+")",id,owner,course.resourceId(),course.versionId(),UUID.randomUUID(),locales,policy);return id;}
    private void revoke(UUID id){jdbc.update("UPDATE access_grants SET revoked_at=clock_timestamp() WHERE id=?",id);}
    private HttpClient login(Account user)throws Exception{var client=browser();var token=mapper.readTree(get(client,"/api/v1/auth/csrf").body()).path("token").asText();var request=HttpRequest.newBuilder(uri("/api/v1/auth/login")).timeout(Duration.ofSeconds(20)).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(user.email(),java.nio.charset.StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(user.password(),java.nio.charset.StandardCharsets.UTF_8))).build();assertThat(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);return client;}
    private HttpResponse<String> get(HttpClient client,String path)throws Exception{return client.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private URI uri(String path){return URI.create("http://localhost:"+port+path);}private static HttpClient browser(){return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build();}
    private static String tag(ContentView c){return EntityTags.forRevision("content",c.id(),c.revision());}
    private record Account(UUID id,String email,String password){@Override public String toString(){return "AccessTestAccount[redacted]";}}
    private record Fixture(ContentView activity,ContentView module,ContentView course,UUID file){ }
}
