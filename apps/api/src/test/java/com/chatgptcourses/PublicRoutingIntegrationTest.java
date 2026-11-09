package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.catalog.service.PublicRouteService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.methods.service.MethodTypes.*;
import com.chatgptcourses.shared.http.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","STRIPE_ENABLED=false","NOTIFICATION_OUTBOX_ENABLED=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class PublicRoutingIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void config(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);}
    @Autowired JdbcTemplate jdbc;@Autowired EditorialService editorial;@Autowired PublicCatalogueService catalogue;@Autowired PublicRouteService routes;@Autowired ObjectMapper mapper;@Autowired PasswordEncoder encoder;
    @LocalServerPort int port;

    @Test void renamedPublishedSlugKeepsEveryReservationAndFrozenRevisionAndBumpsFamilyTags(){
        UUID actor=actor();var fr=publish(actor,create(actor,ResourceKind.GUIDE,"fr",List.of()));
        var en=publish(actor,translate(actor,fr,"en"));fr=editorial.get(actor,fr.id());
        String original=fr.slug();UUID published=fr.publishedRevisionId();long sibling=en.revision();String next=unique();
        var renamed=editorial.renameSlug(actor,actor,fr.id(),tag(fr),new RenameContentSlug(next,"Controlled public URL replacement"));
        assertThat(renamed.currentRevisionId()).isEqualTo(fr.currentRevisionId());assertThat(renamed.publishedRevisionId()).isEqualTo(published);
        assertThat(renamed.state()).isEqualTo(EditorialState.PUBLISHED);assertThat(renamed.revision()).isGreaterThan(fr.revision());
        assertThat(editorial.get(actor,en.id()).revision()).isGreaterThan(sibling);
        assertThat(catalogue.bySlug(ResourceKind.GUIDE,original,"fr").slug()).isEqualTo(next);
        assertThat(catalogue.bySlug(ResourceKind.GUIDE,next,"fr").resourceId()).isEqualTo(fr.resourceId());
        var noop=editorial.renameSlug(actor,actor,fr.id(),tag(renamed),new RenameContentSlug(next,"No-op"));assertThat(noop.revision()).isEqualTo(renamed.revision());
        var restored=editorial.renameSlug(actor,actor,fr.id(),tag(noop),new RenameContentSlug(original,"Restore the original owned reservation"));
        assertThat(catalogue.bySlug(ResourceKind.GUIDE,next,"fr").slug()).isEqualTo(original);
        assertThat(restored.publishedRevisionId()).isEqualTo(published);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM resource_slug_changes WHERE resource_id=?",Integer.class,fr.resourceId())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM resource_slug_reservations WHERE resource_id=? AND locale='fr'",Integer.class,fr.resourceId())).isEqualTo(2);
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM resource_slug_changes WHERE resource_id=?",renamed.resourceId()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void historicalSlugsCannotBeReassignedAndConcurrentClaimsHaveOneWinner()throws Exception{
        UUID actor=actor();var a=create(actor,ResourceKind.GUIDE,"fr",List.of());String before=a.slug();
        var current=editorial.renameSlug(actor,actor,a.id(),tag(a),new RenameContentSlug(unique(),"Keep old reservation"));
        var other=create(actor,ResourceKind.GUIDE,"fr",List.of());
        expect(ApiError.SLUG_ALREADY_RESERVED,()->editorial.renameSlug(actor,actor,other.id(),tag(other),new RenameContentSlug(before,"Attempt reassignment")));
        // The namespace is kind AND locale, never a global collision across unrelated localized URLs.
        var cross=editorial.create(actor,new CreateContent(ResourceKind.COURSE,"en",before,"Different namespace","Summary","Objective","Evaluation",document(),List.of(),"Draft namespace fixture"));
        assertThat(cross.slug()).isEqualTo(before);
        var b=create(actor,ResourceKind.GUIDE,"fr",List.of());String shared=unique();var barrier=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<String> first=()->{barrier.await(5,TimeUnit.SECONDS);return attempt(()->editorial.renameSlug(actor,actor,current.id(),tag(current),new RenameContentSlug(shared,"First claim")));};
            Callable<String> second=()->{barrier.await(5,TimeUnit.SECONDS);return attempt(()->editorial.renameSlug(actor,actor,b.id(),tag(b),new RenameContentSlug(shared,"Second claim")));};
            var x=pool.submit(first);var y=pool.submit(second);assertThat(List.of(x.get(10,TimeUnit.SECONDS),y.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","SLUG_ALREADY_RESERVED");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM resource_slug_reservations WHERE resource_kind='GUIDE' AND locale='fr' AND slug=?",Integer.class,shared)).isEqualTo(1);
    }

    @Test void preconditionsAccountBoundaryAndPublishPermissionAreCheckedAfterTheResourceLock()throws Exception{
        UUID actor=actor();var source=publish(actor,create(actor,ResourceKind.GUIDE,"fr",List.of()));
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->editorial.renameSlug(actor,null,source.id(),tag(source),new RenameContentSlug(unique(),"No context")));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->editorial.renameSlug(actor,UUID.randomUUID(),source.id(),tag(source),new RenameContentSlug(unique(),"Other account")));
        expect(ApiError.PRECONDITION_REQUIRED,()->editorial.renameSlug(actor,actor,source.id(),null,new RenameContentSlug(unique(),"Missing tag")));
        var one=editorial.renameSlug(actor,actor,source.id(),tag(source),new RenameContentSlug(unique(),"First revision"));
        expect(ApiError.REVISION_CONFLICT,()->editorial.renameSlug(actor,actor,source.id(),tag(source),new RenameContentSlug(unique(),"Old tag")));
        UUID writer=writer();assertThat(catchThrowable(()->editorial.renameSlug(writer,writer,one.id(),tag(one),new RenameContentSlug(unique(),"Writer cannot replace a published URL")))).isInstanceOf(AccessDeniedException.class);
        try(var connection=POSTGRES.createConnection("")){
            connection.setAutoCommit(false);try(var q=connection.prepareStatement("SELECT id FROM learning_resources WHERE id=? FOR UPDATE")){q.setObject(1,source.resourceId());q.executeQuery();}
            try(var pool=Executors.newSingleThreadExecutor()){
                var waiting=pool.submit(()->catchThrowable(()->editorial.renameSlug(actor,actor,one.id(),tag(one),new RenameContentSlug(unique(),"Revoked while waiting"))));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean blocked=false;while(System.nanoTime()<deadline){blocked=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM learning_resources%FOR UPDATE%')",Boolean.class));if(blocked)break;Thread.sleep(20);}assertThat(blocked).isTrue();
                jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,clock_timestamp()),updated_at=greatest(created_at,updated_at,clock_timestamp()),revision=revision+1 WHERE user_id=? AND revoked_at IS NULL",actor);
                connection.commit();assertThat(waiting.get(10,TimeUnit.SECONDS)).isInstanceOf(AccessDeniedException.class);
            }
        }
        assertThat(catalogue.bySlug(ResourceKind.GUIDE,one.slug(),"fr").slug()).isEqualTo(one.slug());
    }

    @Test void publicationsAreMetadataOnlyExactPublishedSnapshotsWithNoDraftOrOldVersionFallback(){
        UUID actor=actor();var fr=publish(actor,create(actor,ResourceKind.GUIDE,"fr",List.of()));var en=publish(actor,translate(actor,fr,"en"));fr=editorial.get(actor,fr.id());
        UUID resourceId=fr.resourceId();var first=routes.publications("fr",0,100).items().stream().filter(p->p.resourceId().equals(resourceId)).findFirst().orElseThrow();
        var event=jdbc.queryForObject("SELECT max(created_at) FROM editorial_events WHERE revision_id=? AND event_type='PUBLISH'",java.sql.Timestamp.class,fr.publishedRevisionId()).toInstant();
        assertThat(first.publishedAt()).isEqualTo(event);assertThat(first.languages()).extracting(x->x.locale()).containsExactly("en","fr");
        var corrected=editorial.revise(actor,fr.id(),tag(fr),new SaveRevision("DRAFT_PRIVATE_TITLE","Private draft summary",fr.document(),"Unpublished correction"));
        var still=routes.publications("fr",0,100).items().stream().filter(p->p.resourceId().equals(corrected.resourceId())).findFirst().orElseThrow();
        assertThat(still.title()).isEqualTo(first.title());assertThat(still.revisionId()).isEqualTo(first.revisionId());assertThat(still.publishedAt()).isEqualTo(event);
        assertThat(routes.publications("en",0,100).items()).noneMatch(p->p.resourceId().equals(corrected.resourceId()));
        String serialized=mapper.writeValueAsString(routes.publications("fr",0,100));assertThat(serialized.contains("PRIVATE_BODY")||serialized.contains("PRIVATE_CORRECTION")||serialized.contains("DRAFT_PRIVATE_TITLE")).isFalse();
        var v2=publish(actor,editorial.newVersion(actor,corrected.id(),tag(corrected),new NewVersion("New objective","New evaluation","Version two","Summary",document(),List.of(),"New pedagogy")));
        assertThat(routes.publications("fr",0,100).items().stream().filter(p->p.resourceId().equals(v2.resourceId())).findFirst().orElseThrow().versionId()).isEqualTo(v2.versionId());
        assertThat(routes.publications("en",0,100).items()).noneMatch(p->p.resourceId().equals(v2.resourceId()));
        editorial.archive(actor,v2.id(),tag(v2),new ArchiveContent("Withdraw current version"));
        assertThat(routes.publications("fr",0,100).items()).noneMatch(p->p.resourceId().equals(v2.resourceId()));
        var all=routes.publications("fr",0,100);var paged=new ArrayList<UUID>();for(int p=0;p<all.total();p++)paged.addAll(routes.publications("fr",p,1).items().stream().map(x->x.resourceId()).toList());
        assertThat(paged).containsExactlyElementsOf(all.items().stream().map(x->x.resourceId()).toList());
    }

    @Test void activityContextRequiresTheExactPinnedParentAndEveryLanguageInItsChain(){
        UUID actor=actor();var activity=publish(actor,create(actor,ResourceKind.ACTIVITY,"fr",List.of()));var activityEn=publish(actor,translate(actor,activity,"en"));
        var module=publish(actor,create(actor,ResourceKind.MODULE,"fr",List.of(activity.versionId())));var moduleEn=publish(actor,translate(actor,module,"en"));
        var course=publish(actor,create(actor,ResourceKind.COURSE,"fr",List.of(module.versionId())));
        assertThat(routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"en").availability()).isEqualTo("MISSING_TRANSLATION");
        var courseEn=publish(actor,translate(actor,course,"en"));
        var en=routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"en");assertThat(en.availability()).isEqualTo("PUBLISHED");
        assertThat(en.courseSlug()).isEqualTo(courseEn.slug());assertThat(en.activitySlug()).isEqualTo(activityEn.slug());
        module=editorial.get(actor,module.id());editorial.revise(actor,module.id(),tag(module),new SaveRevision("Module editorial correction",module.summary(),module.document(),"Translation requires a new review"));
        assertThat(routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"en").availability()).isEqualTo("STALE");
        moduleEn=editorial.get(actor,moduleEn.id());editorial.archive(actor,moduleEn.id(),tag(moduleEn),new ArchiveContent("Withdraw module translation only"));
        assertThat(routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"en").availability()).isEqualTo("WITHDRAWN");
        assertThat(routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"fr").availability()).isEqualTo("PUBLISHED");
        assertThat(catalogue.version(activity.resourceId(),activity.versionId(),"en").availability()).isEqualTo("PUBLISHED");
        var changed=editorial.get(actor,activity.id());var newer=publish(actor,editorial.newVersion(actor,changed.id(),tag(changed),new NewVersion("New activity objective","New quiz definition","New activity","Summary",document(),List.of(),"New version")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->routes.activityContext(course.resourceId(),course.versionId(),newer.resourceId(),newer.versionId(),"fr"));
        assertThat(routes.activityContext(course.resourceId(),course.versionId(),activity.resourceId(),activity.versionId(),"fr").activityVersionId()).isEqualTo(activity.versionId());
    }

    @Test void realHttpRoutesEnforceCsrfAccountContextAndExposeOnlyCanonicalPublicMetadata()throws Exception{
        UUID actor=actor();String password="Only isolated P16 password 123",email=actor+"@fixture.invalid";
        jdbc.update("UPDATE user_accounts SET password_hash=? WHERE id=?",encoder.encode(password),actor);
        var source=publish(actor,create(actor,ResourceKind.GUIDE,"fr",List.of()));var http=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        String token=mapper.readTree(http.send(HttpRequest.newBuilder(uri("/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).path("token").asText();
        var login=http.send(HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(email,StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build(),HttpResponse.BodyHandlers.ofString());assertThat(login.statusCode()).isEqualTo(200);
        token=mapper.readTree(http.send(HttpRequest.newBuilder(uri("/api/v1/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).path("token").asText();
        String path="/api/v1/admin/contents/"+source.id()+"/slug",body=mapper.writeValueAsString(Map.of("slug",unique(),"reason","Explicit HTTP rename"));
        var denied=http.send(HttpRequest.newBuilder(uri(path)).header("Content-Type","application/json").header("If-Match",tag(source)).header("X-Account-Context",actor.toString()).method("PATCH",HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());assertThat(denied.statusCode()).isEqualTo(403);
        var saved=http.send(HttpRequest.newBuilder(uri(path)).header("Content-Type","application/json").header("If-Match",tag(source)).header("X-Account-Context",actor.toString()).header("X-CSRF-TOKEN",token).method("PATCH",HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());assertThat(saved.statusCode()).isEqualTo(200);assertThat(saved.headers().firstValue("ETag")).isPresent();
        var anonymous=HttpClient.newHttpClient();var page=anonymous.send(HttpRequest.newBuilder(uri("/api/v1/catalog/publications?locale=fr")).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(page.statusCode()).isEqualTo(200);assertThat(page.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(page.body().contains("PRIVATE_BODY")||page.body().contains("PRIVATE_CORRECTION")).isFalse();
        var alias=anonymous.send(HttpRequest.newBuilder(uri("/api/v1/catalog/by-slug/GUIDE/"+source.slug()+"?locale=fr")).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(alias.statusCode()).isEqualTo(200);assertThat(mapper.readTree(alias.body()).path("slug").asText()).isEqualTo(mapper.readTree(saved.body()).path("slug").asText());
    }

    private UUID actor(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@fixture.invalid");jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),id);jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),id);return id;}
    private UUID writer(){UUID id=actor();jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,clock_timestamp()),updated_at=greatest(created_at,updated_at,clock_timestamp()),revision=revision+1 WHERE user_id=?",id);UUID role=UUID.randomUUID();jdbc.update("INSERT INTO roles(id,code) VALUES(?,?)",role,"P16_"+unique().replace("-", "").toUpperCase(Locale.ROOT));jdbc.update("INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),?,id FROM permissions WHERE code IN('content.read','content.write')",role);jdbc.update("INSERT INTO user_roles(id,user_id,role_id) VALUES(?,?,?)",UUID.randomUUID(),id,role);return id;}
    private ContentView create(UUID actor,ResourceKind kind,String locale,List<UUID> children){return editorial.create(actor,new CreateContent(kind,locale,unique(),"Published P16 "+kind,"Explicit summary","Objective","Evaluation",document(),children,"Isolated P16 fixture"));}
    private ContentView translate(UUID actor,ContentView source,String locale){var current=editorial.get(actor,source.id());return editorial.translate(actor,current.id(),tag(current),new CreateTranslation(locale,unique(),"Localized P16 "+source.kind(),"Localized summary",source.document(),"Explicit translation"));}
    private ContentView publish(UUID actor,ContentView source){var value=editorial.get(actor,source.id());value=editorial.transition(actor,value.id(),tag(value),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));var revision=value.sourceTranslationId()==null?null:editorial.get(actor,value.sourceTranslationId()).currentRevisionId();value=editorial.transition(actor,value.id(),tag(value),new TransitionContent(EditorialState.READY,"Review exact version",revision));return editorial.publish(actor,value.id(),tag(value),new PublishContent(value.currentRevisionId(),"Publish exact revision"));}
    private static ContentDocument document(){return new ContentDocument("Distinguish facts","A checked output",List.of(),List.of(new ContentBlock("PARAGRAPH","PRIVATE_BODY",null)),null,new Exercise("Produce a factual answer","PRIVATE_CORRECTION"),List.of(new QuizQuestion("facts","Which fact?",List.of("Known","Invented"),0,"PRIVATE_CORRECTION",1)),List.of(new RubricCriterion("facts","Use stated facts",1,true)),"PROTECTED",List.of(),List.of());}
    private static String unique(){return "p16-"+UUID.randomUUID();}
    private static String tag(ContentView value){return EntityTags.forRevision("content",value.id(),value.revision());}
    private static void expect(ApiError error,Runnable operation){var failure=catchThrowable(operation::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private static String attempt(Runnable operation){try{operation.run();return "OK";}catch(ApiException failure){return failure.error().name();}}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
}
