package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EditorialServiceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));
        r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Autowired EditorialService editorial;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test void realLifecycleRetainsImmutablePublishedSnapshotAndSeparatesPublicAnswers() {
        UUID actor=actor(true);var created=create(actor,ResourceKind.ACTIVITY,"FREE");
        expect(ApiError.RESOURCE_NOT_FOUND,()->editorial.publicContent(created.resourceId(),"fr"));
        var published=publish(actor,created);
        var publicDoc=editorial.publicContent(created.resourceId(),"fr");
        assertThat(publicDoc.document().exerciseInstructions()).isEqualTo("Produce a short proposal");
        String json=mapper.writeValueAsString(publicDoc);
        assertThat(json).doesNotContain("\"correctOption\":","\"explanation\":","\"correction\":","PRIVATE_ANSWER");
        assertThat(published.frozenAt()).isNotNull();assertThat(published.verifiedAt()).isNotNull();
        var corrected=editorial.revise(actor,published.id(),tag(published),new SaveRevision("Corrected title",published.summary(),published.document(),"Editorial wording correction"));
        assertThat(corrected.versionId()).isEqualTo(published.versionId());assertThat(corrected.currentRevisionId()).isNotEqualTo(published.currentRevisionId());
        assertThat(editorial.publicContent(created.resourceId(),"fr").title()).isEqualTo(created.title());
        assertThat(editorial.history(actor,created.id(),0,20).items()).hasSize(2);
        var republished=publish(actor,corrected);
        assertThat(editorial.publicContent(created.resourceId(),"fr").title()).isEqualTo("Corrected title");
        var archived=editorial.archive(actor,republished.id(),tag(republished),new ArchiveContent("Replaced by editorial decision"));
        assertThat(archived.state()).isEqualTo(EditorialState.ARCHIVED);
        expect(ApiError.RESOURCE_NOT_FOUND,()->editorial.publicContent(created.resourceId(),"fr"));
        assertThat(editorial.history(actor,created.id(),0,20).total()).isEqualTo(2);
        Throwable update=catchThrowable(()->jdbc.update("UPDATE editorial_revisions SET title='not allowed' WHERE id=?",created.currentRevisionId()));
        assertThat(update).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(editorial.dependencies(actor,created.id()).consequences()).contains("HISTORY_RETAINED");
    }

    @Test void permissionsAndPreconditionsAreEnforcedByTheServiceAndConcurrentWritersCannotOverwrite() throws Exception {
        UUID actor=actor(true),learner=actor(false);var created=create(actor,ResourceKind.GUIDE,"FREE");
        assertThat(catchThrowable(()->editorial.get(learner,created.id()))).isInstanceOf(AccessDeniedException.class);
        expect(ApiError.PRECONDITION_REQUIRED,()->editorial.revise(actor,created.id(),null,new SaveRevision("New",created.summary(),created.document(),"Changed")));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return attempt(()->editorial.revise(actor,created.id(),tag(created),new SaveRevision("Winner A",created.summary(),created.document(),"Changed A")));});
            var b=pool.submit(()->{start.await();return attempt(()->editorial.revise(actor,created.id(),tag(created),new SaveRevision("Winner B",created.summary(),created.document(),"Changed B")));});
            start.countDown();assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        assertThat(editorial.history(actor,created.id(),0,20).total()).isEqualTo(2);
        jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,CURRENT_TIMESTAMP),revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE user_id=?",actor);
        assertThat(catchThrowable(()->editorial.get(actor,created.id()))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void translationsUseTheExactReviewedSourceAndStaleContentHasNoPublicBodyOrLanguageFallback() {
        UUID actor=actor(true);var fr=publish(actor,create(actor,ResourceKind.GUIDE,"FREE"));
        long beforeTranslation=fr.revision();var base=document("FREE");var question=base.quiz().getFirst();
        var mismatched=new ContentDocument(base.objective(),base.expectedResult(),base.prerequisites(),base.blocks(),base.estimatedMinutes(),base.exercise(),List.of(new QuizQuestion(question.key(),question.prompt(),question.options(),question.correctOption(),question.explanation(),2)),base.rubric(),base.access(),base.media(),base.relatedResourceIds());
        var en=editorial.translate(actor,fr.id(),tag(fr),new CreateTranslation("en","english-"+UUID.randomUUID(),"English guide","English summary",mismatched,"Explicit English translation"));
        assertThat(en.versionId()).isEqualTo(fr.versionId());assertThat(en.sourceRevisionId()).isEqualTo(fr.currentRevisionId());
        assertThat(editorial.readiness(actor,en.id()).blockingIssues()).extracting(Issue::code).contains("TRANSLATION_ASSESSMENT_MISMATCH");
        var invalidReview=editorial.transition(actor,en.id(),tag(en),new TransitionContent(EditorialState.TO_REVIEW,"Review translated assessment",null));
        UUID sourceRevision=fr.currentRevisionId();
        expect(ApiError.CONTENT_NOT_READY,()->editorial.transition(actor,invalidReview.id(),tag(invalidReview),new TransitionContent(EditorialState.READY,"Inconsistent assessment",sourceRevision)));
        en=editorial.revise(actor,invalidReview.id(),tag(invalidReview),new SaveRevision(en.title(),en.summary(),base,"Align equivalent assessment before first publication"));
        fr=editorial.get(actor,fr.id());
        assertThat(fr.translations()).hasSize(2);assertThat(fr.revision()).isGreaterThan(beforeTranslation);
        en=publish(actor,en);var originalEn=en;
        assertThat(editorial.publicContent(fr.resourceId(),"en").availability()).isEqualTo("PUBLISHED");
        var fr2=editorial.revise(actor,fr.id(),tag(editorial.get(actor,fr.id())),new SaveRevision("New source wording",fr.summary(),fr.document(),"Correct source wording"));
        var stale=editorial.get(actor,en.id());assertThat(stale.state()).isEqualTo(EditorialState.STALE);
        assertThat(editorial.publicContent(fr.resourceId(),"en").document()).isNull();
        assertThat(editorial.history(actor,en.id(),0,20).items().getFirst().id()).isEqualTo(originalEn.currentRevisionId());
        var reviewing=editorial.transition(actor,stale.id(),tag(stale),new TransitionContent(EditorialState.TO_REVIEW,"Check changed source",null));
        expect(ApiError.REVISION_CONFLICT,()->editorial.transition(actor,reviewing.id(),tag(reviewing),new TransitionContent(EditorialState.READY,"Reviewed old source",originalEn.sourceRevisionId())));
        var ready=editorial.transition(actor,reviewing.id(),tag(reviewing),new TransitionContent(EditorialState.READY,"Reviewed current source",fr2.currentRevisionId()));
        editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Republish checked translation"));
        assertThat(editorial.publicContent(fr.resourceId(),"en").document()).isNotNull();
        var latestFr=editorial.get(actor,fr.id());
        var newVersion=editorial.newVersion(actor,latestFr.id(),tag(latestFr),new NewVersion("New learning objective","New assessment",latestFr.title(),latestFr.summary(),document("FREE"),List.of(),"Different pedagogy"));
        var v2=publish(actor,newVersion);
        assertThat(v2.versionNumber()).isEqualTo(2);
        UUID resource=fr.resourceId();expect(ApiError.RESOURCE_NOT_FOUND,()->editorial.publicContent(resource,"en"));
        editorial.archive(actor,v2.id(),tag(v2),new ArchiveContent("Retire current version"));
        expect(ApiError.RESOURCE_NOT_FOUND,()->editorial.publicContent(resource,"fr"));
    }

    @Test void readinessBlocksMissingMediaAndPedagogyAndPremiumNeverLeavesThePublicProjection() {
        UUID actor=actor(true);var draft=create(actor,ResourceKind.ACTIVITY,"PROTECTED");
        var d=draft.document();var withMedia=new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),null,d.exercise(),d.quiz(),d.rubric(),d.access(),List.of(new MediaReference(UUID.randomUUID(),"VIDEO",true,"Video not produced")),d.relatedResourceIds());
        var blocked=editorial.revise(actor,draft.id(),tag(draft),new SaveRevision(draft.title(),draft.summary(),withMedia,"Promise needs real media"));
        assertThat(editorial.readiness(actor,blocked.id()).blockingIssues()).extracting(Issue::code).contains("MEDIA_UNVERIFIED");
        var reviewing=editorial.transition(actor,blocked.id(),tag(blocked),new TransitionContent(EditorialState.TO_REVIEW,"Review",null));
        expect(ApiError.CONTENT_NOT_READY,()->editorial.transition(actor,reviewing.id(),tag(reviewing),new TransitionContent(EditorialState.READY,"Not actually ready",null)));
        var corrected=editorial.revise(actor,reviewing.id(),tag(reviewing),new SaveRevision(draft.title(),draft.summary(),d,"Remove unproduced media promise"));
        var published=publish(actor,corrected);
        assertThat(editorial.publicContent(published.resourceId(),"fr").access()).isEqualTo("PROTECTED");
        assertThat(editorial.publicContent(published.resourceId(),"fr").document()).isNull();
        var changedObjective=new ContentDocument("Different goal",d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),d.access(),d.media(),d.relatedResourceIds());
        expect(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED,()->editorial.revise(actor,published.id(),tag(published),new SaveRevision("Changed pedagogy",published.summary(),changedObjective,"Not just a correction")));
        var copied=editorial.duplicate(actor,published.id(),tag(published),new DuplicateContent("copied-"+UUID.randomUUID(),"Copied draft","Explicit duplicate"));
        assertThat(copied.resourceId()).isNotEqualTo(published.resourceId());assertThat(copied.state()).isEqualTo(EditorialState.DRAFT);
    }

    @Test void orderedCompositionPublishesBottomUpAndKeepsDependenciesAndStableVersions() {
        UUID actor=actor(true);var child=create(actor,ResourceKind.ACTIVITY,"FREE");
        var module=editorial.create(actor,new CreateContent(ResourceKind.MODULE,"fr","module-"+UUID.randomUUID(),"Module","Summary","Objective","Assessment",document("FREE"),List.of(child.versionId()),"Create module"));
        assertThat(editorial.readiness(actor,module.id()).blockingIssues()).extracting(Issue::code).contains("CHILD_NOT_FROZEN","CHILD_NOT_PUBLISHED");
        assertThat(editorial.dependencies(actor,child.id()).items()).extracting(Dependency::relation).contains("COMPOSITION");
        child=publish(actor,child);var publishedModule=publish(actor,module);
        var other=publish(actor,create(actor,ResourceKind.ACTIVITY,"FREE"));
        expect(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED,()->editorial.composition(actor,publishedModule.id(),tag(publishedModule),new ReplaceComposition(List.of(other.versionId()),"Change frozen curriculum")));
        var v2=editorial.newVersion(actor,publishedModule.id(),tag(publishedModule),new NewVersion("New objective","New assessment","New module","Summary",document("FREE"),List.of(child.versionId(),other.versionId()),"New curriculum"));
        var reordered=editorial.composition(actor,v2.id(),tag(v2),new ReplaceComposition(List.of(other.versionId(),child.versionId()),"Keyboard reorder"));
        assertThat(reordered.childVersionIds()).containsExactly(other.versionId(),child.versionId());
        assertThat(editorial.get(actor,publishedModule.id()).childVersionIds()).containsExactly(child.versionId());
        assertThat(editorial.list(actor,new ContentQuery(null,ResourceKind.ACTIVITY,null,"fr",null,Instant.now(),null,0,1)).size()).isEqualTo(1);
    }

    @Test void upgradeV003PreservesLegacySnapshotsAndSessionThenRequiresExplicitStructuredConversion() throws Exception {
        String schema="p05_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("CREATE SCHEMA "+schema);
        Flyway old=Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("003").load();old.migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
            String fixture=new String(getClass().getResourceAsStream("/devdata/p03-demo.sql").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            isolated.execute(fixture);String session=UUID.randomUUID().toString();
            isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(isolated.queryForObject("SELECT count(*) FROM editorial_revisions",Integer.class)).isEqualTo(6);
            assertThat(isolated.queryForObject("SELECT count(*) FROM editorial_revisions WHERE document_json IS NULL",Integer.class)).isEqualTo(6);
            assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);
            assertThat(isolated.queryForObject("SELECT count(*) FROM user_accounts",Integer.class)).isZero();
            assertThat(isolated.queryForObject("SELECT count(*) FROM roles WHERE code='EDITOR'",Integer.class)).isEqualTo(1);
            isolated.execute(fixture);assertThat(isolated.queryForObject("SELECT count(*) FROM editorial_revisions",Integer.class)).isEqualTo(6);
            UUID editor=UUID.randomUUID();isolated.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'test-only-unusable-hash','ACTIVE')",editor,editor+"@example.test");
            isolated.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),editor);
            var legacyService=new EditorialService(isolated,mapper);UUID legacyId=UUID.fromString("03400000-0000-4000-8000-000000000001");
            var legacy=legacyService.get(editor,legacyId);assertThat(legacy.document()).isNull();assertThat(legacy.legacyBody()).isNotBlank();
            assertThat(legacyService.history(editor,legacyId,0,20).items().getFirst().legacyBody()).isEqualTo(legacy.legacyBody());
            assertThat(legacyService.readiness(editor,legacyId).blockingIssues()).extracting(Issue::code).contains("STRUCTURED_DOCUMENT_REQUIRED");
        }
    }

    @Test void boundedStructuredContentRejectsUnsafeLinksAndOversizedPayloadsBeforeInsertion() {
        UUID actor=actor(true);var d=document("FREE");
        var unsafe=new ContentDocument(d.objective(),d.expectedResult(),List.of(),List.of(new ContentBlock("LINK","Unsafe","javascript:alert(1)")),null,d.exercise(),d.quiz(),d.rubric(),"FREE",List.of(),List.of());
        expect(ApiError.VALIDATION_FAILED,()->editorial.create(actor,new CreateContent(ResourceKind.GUIDE,"fr","unsafe-"+UUID.randomUUID(),"Unsafe","Summary","Goal","Assessment",unsafe,List.of(),"Invalid URL")));
        var blocks=java.util.stream.IntStream.range(0,20).mapToObj(i->new ContentBlock("PARAGRAPH","x".repeat(4000),null)).toList();
        var tooLarge=new ContentDocument(d.objective(),d.expectedResult(),List.of(),blocks,null,d.exercise(),d.quiz(),d.rubric(),"FREE",List.of(),List.of());
        expect(ApiError.VALIDATION_FAILED,()->editorial.create(actor,new CreateContent(ResourceKind.GUIDE,"fr","large-"+UUID.randomUUID(),"Large","Summary","Goal","Assessment",tooLarge,List.of(),"Too large")));
        assertThat(editorial.list(actor,new ContentQuery("Unsafe",null,null,null,null,null,null,0,20)).items()).isEmpty();
    }

    @Test void permissionRevokedWhilePublicationWaitsOnTheResourceLockIsCheckedAgain() throws Exception {
        UUID actor=actor(true);var draft=create(actor,ResourceKind.GUIDE,"FREE");
        var reviewing=editorial.transition(actor,draft.id(),tag(draft),new TransitionContent(EditorialState.TO_REVIEW,"Review",null));
        var ready=editorial.transition(actor,reviewing.id(),tag(reviewing),new TransitionContent(EditorialState.READY,"Checked",null));
        try(var pool=Executors.newSingleThreadExecutor();
            var blocker=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.prepareStatement("SELECT id FROM learning_resources WHERE id=? FOR UPDATE")) {
                statement.setObject(1,ready.resourceId());statement.executeQuery().close();
            }
            var publication=pool.submit(()->catchThrowable(()->editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Should be denied after wait"))));
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);boolean waiting=false;
            while(System.nanoTime()<deadline) {
                waiting=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM learning_resources%')",Boolean.class));
                if(waiting)break;Thread.sleep(20);
            }
            assertThat(waiting).as("Real PostgreSQL publication transaction waits on row lock").isTrue();
            jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,CURRENT_TIMESTAMP),revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE user_id=?",actor);
            blocker.commit();assertThat(publication.get(10,TimeUnit.SECONDS)).isInstanceOf(AccessDeniedException.class);
            assertThat(jdbc.queryForObject("SELECT published_revision_id FROM content_translations WHERE id=?",UUID.class,ready.id())).isNull();
        }
    }

    private UUID actor(boolean editor) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'test-only-unusable-hash','ACTIVE')",id,id+"@example.test");
        jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),id);
        if(editor)jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),id);
        return id;
    }
    private ContentView create(UUID actor,ResourceKind kind,String access) {
        return editorial.create(actor,new CreateContent(kind,"fr","fixture-"+UUID.randomUUID(),"Editorial fixture","Explicit test content","Observable objective","Declared assessment",document(access),List.of(),"Create fixture"));
    }
    private static ContentDocument document(String access) {
        return new ContentDocument("Observable objective","A short proposal",List.of("Read the brief"),List.of(new ContentBlock("PARAGRAPH","A factual explanation",null)),null,
            new Exercise("Produce a short proposal","PRIVATE_ANSWER correction"),List.of(new QuizQuestion("q1","Which is a fact?",List.of("A stated requirement","An invented claim"),0,"PRIVATE_ANSWER explanation",1)),
            List.of(new RubricCriterion("facts","Keep stated facts",1,true)),access,List.of(),List.of());
    }
    private ContentView publish(UUID actor,ContentView input) {
        var current=editorial.get(actor,input.id());
        if(current.state()==EditorialState.DRAFT || current.state()==EditorialState.STALE)current=editorial.transition(actor,current.id(),tag(current),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));
        UUID source=current.sourceTranslationId()==null?null:editorial.get(actor,current.sourceTranslationId()).currentRevisionId();
        var ready=editorial.transition(actor,current.id(),tag(current),new TransitionContent(EditorialState.READY,"Verified actual revision",source));
        return editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish checked revision"));
    }
    private static String tag(ContentView view) {return EntityTags.forRevision("content",view.id(),view.revision());}
    private static void expect(ApiError error,Runnable work) {Throwable failure=catchThrowable(work::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private static String attempt(Runnable work) {try{work.run();return "OK";}catch(ApiException failure){return failure.error().name();}}
}
