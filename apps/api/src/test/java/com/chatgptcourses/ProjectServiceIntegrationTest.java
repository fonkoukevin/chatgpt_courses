package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.projects.service.ProjectTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.learning.service.LearningTypes.EnrollCourse;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
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

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false"})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ProjectServiceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);}
    @Autowired ProjectService projects;
    @Autowired LearningService learning;
    @Autowired EditorialService editorial;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test void creationIsIdempotentAndEveryPersonalRepresentationBelongsToItsOwner() {
        UUID editor=actor(true),a=actor(false),b=actor(false);var source=publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr"));
        var module=parent(editor,ResourceKind.MODULE,source.versionId());var course=parent(editor,ResourceKind.COURSE,module.versionId(),"PROTECTED");var enrollment=learning.enroll(a,a,new EnrollCourse(course.resourceId(),course.versionId(),"fr")).value();
        var command=new CreateProject(UUID.randomUUID(),source.resourceId(),source.versionId(),source.publishedRevisionId(),"fr",enrollment.summary().id(),fields("My proposal","Personal external text"),"READY_FOR_SELF_ASSESSMENT");
        var first=projects.create(a,a,command);var replay=projects.create(a,a,command);assertThat(first.created()).isTrue();assertThat(replay.created()).isFalse();assertThat(replay.value()).isEqualTo(first.value());
        var project=first.value();assertThat(project.origin().activityVersionNumber()).isEqualTo(1);assertThat(project.fields().externalText()).isEqualTo("Personal external text");
        assertThat(project.origin().courseVersionId()).isEqualTo(course.versionId());assertThat(project.origin().enrollmentId()).isEqualTo(enrollment.summary().id());
        assertThat(projects.context(a,project.id(),"fr").accessStatus()).isEqualTo("ACTIVE");
        projects.reveal(a,a,source.resourceId(),reveal(project));
        var currentModule=editorial.get(editor,module.id());editorial.archive(editor,currentModule.id(),contentTag(currentModule),new ArchiveContent("Withdraw parent module only"));
        assertThat(projects.template(source.resourceId(),source.versionId(),"fr").availability()).isEqualTo("PUBLISHED");
        assertThat(projects.context(a,project.id(),"fr").availability()).isEqualTo("WITHDRAWN");assertThat(projects.context(a,project.id(),"fr").resource()).isNull();
        expect(ApiError.RESOURCE_NOT_FOUND,()->projects.reveal(a,a,source.resourceId(),reveal(project)));
        expect(ApiError.CONFLICT,()->projects.create(a,a,creation(source,command.creationId(),fields("Other body","Different"),"DRAFT")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->projects.get(b,project.id()));expect(ApiError.RESOURCE_NOT_FOUND,()->projects.save(b,b,project.id(),null,new SaveProject(fields("Forbidden","Other"),"DRAFT")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->projects.context(b,project.id(),"fr"));expect(ApiError.RESOURCE_NOT_FOUND,()->projects.revisions(b,project.id(),0,20));
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->projects.create(a,null,creation(source,UUID.randomUUID(),fields("No account","Not stored"),"DRAFT")));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->projects.create(a,b,creation(source,UUID.randomUUID(),fields("Old account form","Not stored"),"DRAFT")));
        assertThat(projects.list(a,new ProjectQuery("external",null,null,null,0,20)).total()).isEqualTo(1);assertThat(projects.list(b,new ProjectQuery(null,null,null,null,0,20)).items()).isEmpty();
        assertThat(projects.list(a,new ProjectQuery("objective",null,null,null,0,20)).items()).isEmpty();
        assertThat(catchThrowable(()->jdbc.update("UPDATE projects SET owner_id=? WHERE id=?",b,project.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        var retained=projects.save(a,a,project.id(),tag(project),new SaveProject(fields("My proposal","Personal external text retained after parent withdrawal"),"DRAFT"));assertThat(retained.rubric()).isEqualTo(project.rubric());
        UUID c=actor(false);var secondModule=parent(editor,ResourceKind.MODULE,source.versionId());var secondCourse=parent(editor,ResourceKind.COURSE,secondModule.versionId());var secondEnrollment=learning.enroll(c,c,new EnrollCourse(secondCourse.resourceId(),secondCourse.versionId(),"fr")).value();
        var secondProject=projects.create(c,c,new CreateProject(UUID.randomUUID(),source.resourceId(),source.versionId(),source.publishedRevisionId(),"fr",secondEnrollment.summary().id(),fields("Retained course work","Personal text remains"),"READY_FOR_SELF_ASSESSMENT")).value();
        var currentCourse=editorial.get(editor,secondCourse.id());editorial.archive(editor,currentCourse.id(),contentTag(currentCourse),new ArchiveContent("Withdraw parent course only"));
        assertThat(projects.context(c,secondProject.id(),"fr").accessStatus()).isEqualTo("UNAVAILABLE");assertThat(projects.context(c,secondProject.id(),"fr").resource()).isNull();expect(ApiError.RESOURCE_NOT_FOUND,()->projects.reveal(c,c,source.resourceId(),reveal(secondProject)));assertThat(projects.get(c,secondProject.id()).fields()).isEqualTo(secondProject.fields());
    }

    @Test void twoConcurrentEditorsRecheckTheLockedCurrentRevisionWithoutLosingTheWinner()throws Exception {
        UUID editor=actor(true),owner=actor(false);var source=publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr"));var project=project(owner,source);
        expect(ApiError.PRECONDITION_REQUIRED,()->projects.save(owner,owner,project.id(),null,new SaveProject(fields("No precondition","Not stored"),"DRAFT")));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return attempt(()->projects.save(owner,owner,project.id(),tag(project),new SaveProject(fields("Revision A","First text"),"READY_FOR_SELF_ASSESSMENT")));});
            var b=pool.submit(()->{start.await();return attempt(()->projects.save(owner,owner,project.id(),tag(project),new SaveProject(fields("Revision B","Second text"),"READY_FOR_SELF_ASSESSMENT")));});start.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        var current=projects.get(owner,project.id());assertThat(current.revision()).isEqualTo(1);assertThat(current.revisionNumber()).isEqualTo(2);assertThat(current.fields().title()).isIn("Revision A","Revision B");
        assertThat(projects.revisions(owner,project.id(),0,1).total()).isEqualTo(2);assertThat(projects.revision(owner,project.id(),project.currentRevisionId()).fields()).isEqualTo(project.fields());
        assertThat(projects.save(owner,owner,project.id(),tag(current),new SaveProject(current.fields(),current.stage()))).isEqualTo(current);
        assertThat(projects.revisions(owner,project.id(),0,20).total()).isEqualTo(2);
        try(var cms=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());var pool=Executors.newSingleThreadExecutor()) {
            cms.setAutoCommit(false);
            try(var lock=cms.prepareStatement("SELECT id FROM learning_resources WHERE id=? FOR UPDATE")){lock.setObject(1,source.resourceId());lock.executeQuery().close();}
            var personal=pool.submit(()->projects.create(editor,editor,creation(source,UUID.randomUUID(),fields("Editor practising their own course","An independently saved production"),"READY_FOR_SELF_ASSESSMENT")));
            try {
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean waiting=false;
                while(System.nanoTime()<deadline){waiting=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM learning_resources WHERE id IN%FOR SHARE')",Boolean.class));if(waiting)break;Thread.sleep(10);}
                assertThat(waiting).as("project creation is waiting for the CMS source lock").isTrue();
                try(var timeout=cms.createStatement()){timeout.execute("SET LOCAL lock_timeout='1500ms'");}
                // The real editorial author FK requests KEY SHARE on the same actor.
                // This must be compatible with serializing personal submissions.
                try(var insert=cms.prepareStatement("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,author_id,reason) SELECT ?,?,coalesce(max(revision_number),0)+1,'Concurrent editorial probe','No publication','No publication',?,'FK lock compatibility check' FROM editorial_revisions WHERE translation_id=?")){
                    insert.setObject(1,UUID.randomUUID());insert.setObject(2,source.id());insert.setObject(3,editor);insert.setObject(4,source.id());assertThat(insert.executeUpdate()).isEqualTo(1);
                }
            } finally {cms.rollback();}
            assertThat(personal.get(15,TimeUnit.SECONDS).value().origin().activityVersionId()).isEqualTo(source.versionId());
        }
    }

    @Test void br01AndBr02UseTheirOwnRubricAndDeclaredThresholdWithoutAnalyzingTheProductionText() {
        UUID editor=actor(true),owner=actor(false);
        var one=project(owner,publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr")));
        var first=projects.selfAssess(owner,owner,one.id(),tag(one),declaration(one,UUID.randomUUID(),16,false));assertThat(first.scorePoints()).isEqualTo(16);assertThat(first.thresholdMet()).isTrue();assertThat(first.needsRevision()).isFalse();
        assertThat(first.method()).isEqualTo("SELF_ASSESSMENT");assertThat(first.evaluatorId()).isNull();assertThat(first.declaredByUser()).isTrue();assertThat(first.authorId()).isEqualTo(owner);assertThat(projects.get(owner,one.id())).isEqualTo(one);
        assertThat(projects.status(owner,one.id()).state()).isEqualTo("SELF_ASSESSED");
        var two=project(owner,publish(editor,createSource(editor,"BR02",17,"EXPLICIT","FREE","fr")));
        String labels=two.rubric().criteria().toString().replace(" ","");assertThat(labels).contains("1400","1180","1200");assertThat(two.rubric().criteria().stream().filter(c->c.key().equals("schedule-1")).findFirst().orElseThrow().label()).contains("dix");
        var below=projects.selfAssess(owner,owner,two.id(),tag(two),declaration(two,UUID.randomUUID(),16,false));assertThat(below.thresholdMet()).isFalse();assertThat(below.needsRevision()).isTrue();
        var explicit=projects.selfAssess(owner,owner,two.id(),tag(two),declaration(two,UUID.randomUUID(),20,true));assertThat(explicit.scorePoints()).isEqualTo(20);assertThat(explicit.thresholdMet()).isTrue();assertThat(explicit.needsRevision()).isTrue();assertThat(explicit.blockingIssues()).extracting(DeclaredBlockingIssue::key).containsExactly("invented-claims");
        assertThat(projects.status(owner,two.id()).state()).isEqualTo("NEEDS_REVISION");assertThat(projects.get(owner,two.id()).fields().externalText()).isEqualTo("Unverified text: the application must not claim to verify its truth.");
        assertThat(first.projectRevisionId()).isEqualTo(one.currentRevisionId());assertThat(explicit.projectRevisionId()).isEqualTo(two.currentRevisionId());
    }

    @Test void aNewProductionRevisionNeverReusesAnOldScoreAndSourceCorrectionsDoNotOverwritePersonalWork() {
        UUID editor=actor(true),owner=actor(false);var source=publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr"));var project=project(owner,source);
        var proof=projects.selfAssess(owner,owner,project.id(),tag(project),declaration(project,UUID.randomUUID(),20,false));var changed=projects.save(owner,owner,project.id(),tag(project),new SaveProject(fields("Revised proposal","My newer independent text"),"DRAFT"));
        assertThat(projects.status(owner,project.id()).state()).isEqualTo("DRAFT");assertThat(projects.status(owner,project.id()).latestAssessment()).isNull();assertThat(projects.assessment(owner,project.id(),proof.id())).isEqualTo(proof);
        assertThat(projects.revision(owner,project.id(),project.currentRevisionId()).fields()).isEqualTo(project.fields());
        assertThat(projects.revisions(owner,project.id(),0,20).items()).extracting(ProjectRevisionSummary::revisionNumber).containsExactly(2,1);
        var original=editorial.get(editor,source.id());var corrected=publish(editor,editorial.revise(editor,original.id(),contentTag(original),new SaveRevision("Corrected title",original.summary(),original.document(),"Editorial correction only")));
        assertThat(projects.context(owner,project.id(),"fr").sourceChanged()).isTrue();assertThat(projects.context(owner,project.id(),"fr").currentPublishedRevisionId()).isEqualTo(corrected.publishedRevisionId());assertThat(projects.get(owner,project.id())).isEqualTo(changed);
        assertThat(catchThrowable(()->jdbc.update("UPDATE project_revisions SET stage='READY_FOR_SELF_ASSESSMENT' WHERE id=?",project.currentRevisionId()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM project_self_assessments WHERE id=?",proof.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void concurrentDuplicateDeclarationsAreOneAppendOnlyProofAndHistoricalReplaysDoNotMoveToNewText()throws Exception {
        UUID editor=actor(true),owner=actor(false);var project=project(owner,publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr")));var command=declaration(project,UUID.randomUUID(),20,false);var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return projects.selfAssess(owner,owner,project.id(),tag(project),command);});var b=pool.submit(()->{start.await();return projects.selfAssess(owner,owner,project.id(),tag(project),command);});start.countDown();assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));
        }
        assertThat(projects.assessments(owner,project.id(),0,20).total()).isEqualTo(1);var original=projects.status(owner,project.id()).latestAssessment();
        try(var blocker=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());var pool=Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);try(var lock=blocker.prepareStatement("SELECT id FROM projects WHERE id=? FOR UPDATE")){lock.setObject(1,project.id());lock.executeQuery().close();}
            var waitingA=pool.submit(()->projects.selfAssess(owner,owner,project.id(),tag(project),declaration(project,UUID.randomUUID(),16,false)));
            var waitingB=pool.submit(()->projects.selfAssess(owner,owner,project.id(),tag(project),declaration(project,UUID.randomUUID(),20,false)));
            Instant releasedAfter;
            try {
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean waiting=false;
                while(System.nanoTime()<deadline) {waiting=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM projects WHERE id=%FOR UPDATE')",Boolean.class));if(waiting)break;Thread.sleep(10);}
                assertThat(waiting).as("a real PostgreSQL row-lock wait").isTrue();
                releasedAfter=jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();
            } finally {blocker.commit();}
            var afterA=waitingA.get(15,TimeUnit.SECONDS);var afterB=waitingB.get(15,TimeUnit.SECONDS);assertThat(afterA.evaluatedAt()).isAfterOrEqualTo(releasedAfter);assertThat(afterB.evaluatedAt()).isAfterOrEqualTo(releasedAfter);
        }
        var different=new SubmitSelfAssessment(command.submissionId(),command.projectRevisionId(),command.rubricVersionId(),command.answers(),command.blockingDeclarations(),"Changed comment");expect(ApiError.CONFLICT,()->projects.selfAssess(owner,owner,project.id(),tag(project),different));
        var changed=projects.save(owner,owner,project.id(),tag(project),new SaveProject(fields("Next revision","Independent new production"),"READY_FOR_SELF_ASSESSMENT"));assertThat(projects.selfAssess(owner,owner,project.id(),tag(project),command)).isEqualTo(original);assertThat(projects.status(owner,project.id()).latestAssessment()).isNull();
        expect(ApiError.REVISION_CONFLICT,()->projects.selfAssess(owner,owner,project.id(),tag(changed),declaration(project,UUID.randomUUID(),20,false)));
        assertThat(projects.revisions(owner,project.id(),0,20).total()).isEqualTo(2);assertThat(projects.assessments(owner,project.id(),0,20).total()).isEqualTo(3);
    }

    @Test void voluntaryRevealIsTracedButNeverValidatesAProjectAndSourceAccessIsRecheckedOnEveryDelivery() {
        UUID editor=actor(true),owner=actor(false);var explicitSource=publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr"));var explicit=project(owner,explicitSource);
        var first=projects.reveal(owner,owner,explicitSource.resourceId(),reveal(explicit));assertThat(first.correction()).contains("1 200");assertThat(projects.reveal(owner,owner,explicitSource.resourceId(),reveal(explicit))).isEqualTo(first);assertThat(projects.get(owner,explicit.id())).isEqualTo(explicit);assertThat(projects.status(owner,explicit.id()).state()).isEqualTo("READY_FOR_SELF_ASSESSMENT");
        assertThat(projects.assessments(owner,explicit.id(),0,20).total()).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM project_solution_reveals WHERE project_id=?",Integer.class,explicit.id())).isEqualTo(1);
        var gatedSource=publish(editor,createSource(editor,"BR02",16,"AFTER_SUBMISSION","FREE","fr"));var gated=project(owner,gatedSource);expect(ApiError.SOLUTION_REVEAL_REQUIRES_ASSESSMENT,()->projects.reveal(owner,owner,gatedSource.resourceId(),reveal(gated)));
        projects.selfAssess(owner,owner,gated.id(),tag(gated),declaration(gated,UUID.randomUUID(),3,false));assertThat(projects.reveal(owner,owner,gatedSource.resourceId(),reveal(gated)).correction()).contains("1 400");assertThat(projects.status(owner,gated.id()).state()).isEqualTo("NEEDS_REVISION");
        var current=editorial.get(editor,explicitSource.id());var d=current.document();var protectedDocument=new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),"PROTECTED",d.media(),d.relatedResourceIds(),d.methodDefinition(),d.quizPolicy(),d.projectPolicy());publish(editor,editorial.revise(editor,current.id(),contentTag(current),new SaveRevision(current.title(),current.summary(),protectedDocument,"Protect educational resource")));
        assertThat(projects.context(owner,explicit.id(),"fr").resource()).isNull();assertThat(projects.context(owner,explicit.id(),"fr").accessStatus()).isEqualTo("PROTECTED");assertThat(catchThrowable(()->projects.reveal(owner,owner,explicitSource.resourceId(),reveal(explicit)))).isInstanceOf(AccessDeniedException.class);
        var preserved=projects.save(owner,owner,explicit.id(),tag(explicit),new SaveProject(fields("My retained work","Editable without source access"),"DRAFT"));assertThat(preserved.fields().externalText()).isEqualTo("Editable without source access");assertThat(preserved.rubric()).isEqualTo(explicit.rubric());
        var source=editorial.get(editor,gatedSource.id());editorial.archive(editor,source.id(),contentTag(source),new ArchiveContent("Withdraw source, keep personal work"));expect(ApiError.RESOURCE_NOT_FOUND,()->projects.reveal(owner,owner,gatedSource.resourceId(),reveal(gated)));assertThat(projects.get(owner,gated.id()).fields()).isEqualTo(gated.fields());
    }

    @Test void translationsAndNewSourceVersionsNeverRebindThePersonalTextOrItsRubric() {
        UUID editor=actor(true),owner=actor(false);var source=publish(editor,createSource(editor,"BR01",16,"EXPLICIT","FREE","fr"));var project=project(owner,source);
        var english=publish(editor,editorial.translate(editor,source.id(),contentTag(editorial.get(editor,source.id())),new CreateTranslation("en","project-en-"+UUID.randomUUID(),"English workshop","Explicit English translation",document("BR01",16,"EXPLICIT","FREE","en"),"Translate exact rubric")));
        var context=projects.context(owner,project.id(),"en");assertThat(context.activityVersionId()).isEqualTo(source.versionId());assertThat(context.resource().locale()).isEqualTo("en");assertThat(context.resource().revisionId()).isEqualTo(english.publishedRevisionId());assertThat(context.currentPublishedRevisionId()).isEqualTo(source.publishedRevisionId());assertThat(context.sourceChanged()).isFalse();assertThat(projects.get(owner,project.id()).fields().locale()).isEqualTo("fr");
        var fresh=publish(editor,editorial.newVersion(editor,source.id(),contentTag(editorial.get(editor,source.id())),new NewVersion("Transfer to BR02","Adapt amount and minimum timeline","BR02 source version","Different pedagogical task",document("BR02",16,"EXPLICIT","FREE","fr"),List.of(),"New objectives and rubric")));
        assertThat(projects.get(owner,project.id())).isEqualTo(project);assertThat(projects.template(source.resourceId(),source.versionId(),"fr").rubric().caseCode()).isEqualTo("BR01");assertThat(projects.template(fresh.resourceId(),fresh.versionId(),"fr").rubric().caseCode()).isEqualTo("BR02");
        var wrongRevision=new CreateProject(UUID.randomUUID(),fresh.resourceId(),fresh.versionId(),source.publishedRevisionId(),"fr",null,fields("Mismatch","Not stored"),"DRAFT");expect(ApiError.REVISION_CONFLICT,()->projects.create(owner,owner,wrongRevision));
        assertThat(catchThrowable(()->jdbc.update("UPDATE project_rubric_snapshots SET case_code='BR02' WHERE project_id=?",project.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void upgradeFromV007PreservesSessionsMethodsAndActivityNotesWithoutCreatingAProject()throws Exception {
        String schema="project_upgrade_"+UUID.randomUUID().toString().replace("-","");Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("007").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));UUID user=UUID.randomUUID(),method=UUID.randomUUID(),activity=UUID.randomUUID(),version=UUID.randomUUID(),note=UUID.randomUUID();String session=UUID.randomUUID().toString();
            isolated.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",user,user+"@example.test");isolated.update("INSERT INTO personal_methods(id,owner_id,title,locale,body,parameters,notes) VALUES(?,?,'Method','fr','Existing method body','{}'::jsonb,'Existing method notes')",method,user);
            isolated.update("INSERT INTO learning_resources(id,kind) VALUES(?,'ACTIVITY')",activity);isolated.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition) VALUES(?,?,1,'Existing objective','Existing rubric')",version,activity);
            isolated.update("INSERT INTO learning_activity_notes(id,owner_id,activity_id,activity_version_id,locale,body) VALUES(?,?,?,?,'fr','Existing private activity note')",note,user,activity,version);
            isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(isolated.queryForObject("SELECT body FROM personal_methods WHERE id=?",String.class,method)).isEqualTo("Existing method body");assertThat(isolated.queryForObject("SELECT body FROM learning_activity_notes WHERE id=?",String.class,note)).isEqualTo("Existing private activity note");assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);assertThat(isolated.queryForObject("SELECT count(*) FROM projects",Integer.class)).isZero();assertThat(isolated.queryForObject("SELECT count(*) FROM project_self_assessments",Integer.class)).isZero();
        }
    }

    private UUID actor(boolean editor) {UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='LEARNER' OR (? AND code='EDITOR')",id,editor);return id;}
    private ContentView createSource(UUID actor,String code,int threshold,String reveal,String access,String locale) {return editorial.create(actor,new CreateContent(ResourceKind.ACTIVITY,locale,"project-"+UUID.randomUUID(),"Project source "+code,"Fictional source for integration checks","Prepare a truthful proposal","Twenty declared checks",document(code,threshold,reveal,access,locale),List.of(),"P09 isolated reference fixture"));}
    private ContentView parent(UUID actor,ResourceKind kind,UUID child) {return parent(actor,kind,child,"FREE");}
    private ContentView parent(UUID actor,ResourceKind kind,UUID child,String access) {var d=new ContentDocument("Follow the pinned programme","A declared production",List.of(),List.of(new ContentBlock("PARAGRAPH","Isolated programme metadata",null)),null,null,List.of(),List.of(),access,List.of(),List.of());return publish(actor,editorial.create(actor,new CreateContent(kind,"fr","parent-"+UUID.randomUUID(),"Project programme "+kind,"Fictional parent","Follow exact versions","Independent facts",d,List.of(child),"P09 version-pinned parent fixture")));}
    private ContentDocument document(String code,int threshold,String reveal,String access,String locale) {
        try(var input=new ClassPathResource("editorial/project-presets.json").getInputStream()) {
            var presets=mapper.readTree(input);for(var preset:presets)if(preset.path("caseCode").asText().equals(code)&&preset.path("locale").asText().equals(locale)) {
                var original=mapper.treeToValue(preset.path("policy"),ProjectPolicy.class);var policy=new ProjectPolicy(code,threshold,reveal,original.blockingIssues());var rubric=Arrays.asList(mapper.treeToValue(preset.path("rubric"),RubricCriterion[].class));
                String correction=code.equals("BR01")?"BR01 : 1 200 € HT. Quinze jours ouvrés après éléments reçus et brief validé, logo/intégration à clarifier.":"BR02 : 1 400 € HT avant intégration ; option 1 180 € HT sous accord, dix jours minimum, jamais cinq jours promis.";
                return new ContentDocument(locale.equals("fr")?"Respecter les faits fournis.":"Respect the supplied facts.","A proposal ready for declared checking",List.of(),List.of(new ContentBlock("PARAGRAPH","Fictional "+code+" brief and pricing, not a training price.",null)),null,new Exercise("Prepare the structured proposal.",correction),List.of(),rubric,access,List.of(),List.of(),null,null,policy);
            }
            throw new IllegalStateException("Reference preset missing");
        } catch(java.io.IOException error){throw new IllegalStateException("Reference preset unavailable",error);}
    }
    private ContentView publish(UUID actor,ContentView initial) {var content=editorial.get(actor,initial.id());if(content.state()==EditorialState.DRAFT||content.state()==EditorialState.STALE)content=editorial.transition(actor,content.id(),contentTag(content),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));UUID source=content.sourceTranslationId()==null?null:editorial.get(actor,content.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(actor,content.id(),contentTag(content),new TransitionContent(EditorialState.READY,"Review exact source",source));return editorial.publish(actor,ready.id(),contentTag(ready),new PublishContent(ready.currentRevisionId(),"Publish reviewed source"));}
    private ProjectView project(UUID actor,ContentView source) {return projects.create(actor,actor,creation(source,UUID.randomUUID(),fields("My project","Unverified text: the application must not claim to verify its truth."),"READY_FOR_SELF_ASSESSMENT")).value();}
    private static ProjectFields fields(String title,String text) {return new ProjectFields(title,"fr","","","","","","","",text);}
    private static CreateProject creation(ContentView source,UUID creation,ProjectFields fields,String stage) {return new CreateProject(creation,source.resourceId(),source.versionId(),source.publishedRevisionId(),source.locale(),null,fields,stage);}
    private static SubmitSelfAssessment declaration(ProjectView project,UUID submission,int satisfied,boolean blocking) {var answers=new ArrayList<CriterionDeclaration>();int index=0;for(var criterion:project.rubric().criteria())answers.add(new CriterionDeclaration(criterion.key(),index++<satisfied,""));var errors=project.rubric().blockingIssues().stream().map(i->new BlockingDeclaration(i.key(),blocking&&i.key().equals("invented-claims"),blocking?"Explicitly declared problem":"")).toList();return new SubmitSelfAssessment(submission,project.currentRevisionId(),project.rubric().id(),answers,errors,"My declared evaluation");}
    private static RevealSolution reveal(ProjectView project) {return new RevealSolution(project.id(),project.currentRevisionId(),project.origin().activityVersionId(),project.origin().revisionId(),project.origin().locale());}
    private static String tag(ProjectView project) {return EntityTags.forRevision("project",project.id(),project.revision());}
    private static String contentTag(ContentView source) {return EntityTags.forRevision("content",source.id(),source.revision());}
    private static void expect(ApiError expected,Runnable action) {var error=catchThrowable(action::run);assertThat(error).isInstanceOf(ApiException.class);assertThat(((ApiException)error).error()).isEqualTo(expected);}
    private static String attempt(Runnable action) {try{action.run();return "OK";}catch(ApiException error){return error.error().name();}}
}
