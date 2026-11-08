package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningMediaPort;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.learning.service.LearningValidation;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.sql.DriverManager;
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

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false"})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LearningServiceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Autowired LearningService learning;
    @Autowired EditorialService editorial;
    @Autowired PublicCatalogueService catalogue;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test void concurrentEnrollmentTracksTheCompletePinnedProgrammeWithoutGrantingProtectedBodies()throws Exception {
        UUID editor=actor(true),learner=actor(false);var f=fixture(editor,new QuizPolicy(100,3),true);
        var command=new EnrollCourse(f.course().resourceId(),f.course().versionId(),"fr");var start=new CountDownLatch(1);
        EnrollmentResult first,second;
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return learning.enroll(learner,learner,command);});var b=pool.submit(()->{start.await();return learning.enroll(learner,learner,command);});start.countDown();
            first=a.get(15,TimeUnit.SECONDS);second=b.get(15,TimeUnit.SECONDS);
        }
        assertThat(first.value().summary().id()).isEqualTo(second.value().summary().id());assertThat(List.of(first.created(),second.created())).containsExactlyInAnyOrder(true,false);
        var enrollment=first.value();var id=enrollment.summary().id();assertThat(enrollment.summary().accessStatus()).isEqualTo("PROTECTED");assertThat(enrollment.summary().progress().totalActivities()).isEqualTo(2);
        var open=learning.activity(learner,id,f.free().resourceId(),f.free().versionId(),"fr");assertThat(open.resource().document()).isNotNull();assertThat(open.progress().revision()).isZero();
        var protectedActivity=learning.activity(learner,id,f.protectedActivity().resourceId(),f.protectedActivity().versionId(),"fr");assertThat(protectedActivity.accessStatus()).isEqualTo("PROTECTED");assertThat(protectedActivity.resource().document()).isNull();
        assertThat(catchThrowable(()->learning.setProgress(learner,learner,f.protectedActivity().resourceId(),progressTag(protectedActivity.progress()),new SetActivityProgress(id,f.protectedActivity().versionId(),true,true,"fr")))).isInstanceOf(AccessDeniedException.class);
        learning.visit(learner,learner,id,new VisitActivity(f.free().resourceId(),f.free().versionId(),"fr"));
        var visited=learning.progress(learner,f.free().resourceId(),id,f.free().versionId());assertThat(visited).isEqualTo(open.progress());
        var completed=learning.setProgress(learner,learner,f.free().resourceId(),progressTag(visited),new SetActivityProgress(id,f.free().versionId(),false,true,"fr"));
        assertThat(completed.readAt()).isNull();assertThat(completed.completedAt()).isNotNull();
        var dashboard=learning.dashboard(learner,"fr");var totals=dashboard.enrollments().getFirst().progress();assertThat(totals.completedActivities()).isEqualTo(1);assertThat(totals.readActivities()).isZero();assertThat(totals.quizPassedActivities()).isZero();assertThat(totals.projectAvailability()).isEqualTo("NOT_AVAILABLE");
        assertThat(dashboard.resume().activityVersionId()).isEqualTo(f.free().versionId());assertThat(dashboard.resume().courseVersionId()).isEqualTo(f.course().versionId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM learning_enrollments WHERE owner_id=?",Integer.class,learner)).isEqualTo(1);
        assertThat(catchThrowable(()->jdbc.update("UPDATE learning_enrollment_activities SET position=99 WHERE enrollment_id=?",id))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->learning.enroll(learner,null,command));expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->learning.visit(learner,editor,id,new VisitActivity(f.free().resourceId(),f.free().versionId(),"fr")));
    }

    @Test void notesPreserveOriginalLanguageAndTextAcrossConflictsWithdrawalAndOtherOwners()throws Exception {
        UUID editor=actor(true),a=actor(false),b=actor(false);var f=fixture(editor,null,false);var enrollment=enroll(a,f);
        assertThat(learning.noteForActivity(a,f.free().resourceId(),f.free().versionId()).note()).isNull();
        var note=learning.createNote(a,a,new CreateActivityNote(f.free().resourceId(),f.free().versionId(),"fr","Mes questions privées : logo et intégration."));
        expect(ApiError.ACTIVITY_NOTE_EXISTS,()->learning.createNote(a,a,new CreateActivityNote(f.free().resourceId(),f.free().versionId(),"fr","Not an overwrite")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->learning.note(b,note.id()));expect(ApiError.RESOURCE_NOT_FOUND,()->learning.updateNote(b,b,note.id(),null,new UpdateActivityNote("Forbidden")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->learning.enrollment(b,enrollment.summary().id(),"fr"));
        expect(ApiError.PRECONDITION_REQUIRED,()->learning.updateNote(a,a,note.id(),null,new UpdateActivityNote("Missing precondition")));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var left=pool.submit(()->{start.await();return attempt(()->learning.updateNote(a,a,note.id(),noteTag(note),new UpdateActivityNote("Révision A")));});
            var right=pool.submit(()->{start.await();return attempt(()->learning.updateNote(a,a,note.id(),noteTag(note),new UpdateActivityNote("Revision B")));});start.countDown();
            assertThat(List.of(left.get(15,TimeUnit.SECONDS),right.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        var changed=learning.note(a,note.id());editorial.archive(editor,f.free().id(),tag(editorial.get(editor,f.free().id())),new ArchiveContent("Withdraw source, preserve personal notes"));
        assertThat(learning.noteForActivity(a,f.free().resourceId(),f.free().versionId()).note()).isEqualTo(changed);
        var after=learning.updateNote(a,a,note.id(),noteTag(changed),new UpdateActivityNote("Je conserve mon travail même après retrait."));assertThat(after.locale()).isEqualTo("fr");
        assertThat(learning.enrollment(a,enrollment.summary().id(),"en").summary().progress().totalActivities()).isEqualTo(2);
        assertThat(learning.note(a,note.id()).text()).isEqualTo(after.text());
        assertThat(catchThrowable(()->jdbc.update("UPDATE learning_activity_notes SET locale='en' WHERE id=?",note.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void serverGradesBr01AndKeepsLanguageVersionPolicyAndAttemptsWithoutCompletingTheActivity() {
        UUID editor=actor(true),learner=actor(false);var f=fixture(editor,new QuizPolicy(100,2),false);
        var en=publish(editor,editorial.translate(editor,f.free().id(),tag(editorial.get(editor,f.free().id())),new CreateTranslation("en","learning-en-"+UUID.randomUUID(),"BR01 English activity","Explicit English version",document(ResourceKind.ACTIVITY,"FREE",new QuizPolicy(100,2),"en"),"Translate exact BR01 assessment")));
        publish(editor,editorial.translate(editor,f.protectedActivity().id(),tag(editorial.get(editor,f.protectedActivity().id())),new CreateTranslation("en","protected-en-"+UUID.randomUUID(),"Protected English activity","Explicit English version",document(ResourceKind.ACTIVITY,"PROTECTED",new QuizPolicy(100,2),"en"),"Translate protected assessment")));
        publish(editor,editorial.translate(editor,f.module().id(),tag(editorial.get(editor,f.module().id())),new CreateTranslation("en","module-en-"+UUID.randomUUID(),"English module","Explicit English module",document(ResourceKind.MODULE,"FREE",null,"en"),"Translate exact module")));
        publish(editor,editorial.translate(editor,f.course().id(),tag(editorial.get(editor,f.course().id())),new CreateTranslation("en","course-en-"+UUID.randomUUID(),"English course","Explicit English course",document(ResourceKind.COURSE,"FREE",null,"en"),"Translate exact course")));
        var enrollment=enroll(learner,f);UUID enrollmentId=enrollment.summary().id();
        var wrong=learning.submitQuiz(learner,learner,f.free().resourceId(),submission(enrollmentId,f.free(),"fr",UUID.randomUUID(),false));assertThat(wrong.passed()).isFalse();assertThat(wrong.scorePoints()).isZero();assertThat(wrong.results().getFirst().correctOption()).isEqualTo(1);
        var correct=learning.submitQuiz(learner,learner,en.resourceId(),submission(enrollmentId,en,"en",UUID.randomUUID(),true));assertThat(correct.passed()).isTrue();assertThat(correct.scorePoints()).isEqualTo(3);assertThat(correct.attemptNumber()).isEqualTo(2);assertThat(correct.locale()).isEqualTo("en");
        assertThat(correct.results().getFirst().explanation()).contains("budget");
        var progress=learning.progress(learner,f.free().resourceId(),enrollmentId,f.free().versionId());assertThat(progress.readAt()).isNull();assertThat(progress.completedAt()).isNull();
        var totals=learning.dashboard(learner,"fr").enrollments().getFirst().progress();assertThat(totals.completedActivities()).isZero();assertThat(totals.quizPassedActivities()).isEqualTo(1);assertThat(totals.projectAvailability()).isEqualTo("NOT_AVAILABLE");
        var history=learning.attempts(learner,f.free().versionId(),0,20);assertThat(history.total()).isEqualTo(2);assertThat(history.items()).extracting(QuizAttemptView::locale).containsExactlyInAnyOrder("fr","en");
        var old=editorial.get(editor,f.free().id());var revised=editorial.revise(editor,old.id(),tag(old),new SaveRevision("Editorial title correction",old.summary(),old.document(),"Correct only a title"));publish(editor,revised);
        assertThat(learning.attempt(learner,wrong.id())).isEqualTo(wrong);expect(ApiError.REVISION_CONFLICT,()->learning.submitQuiz(learner,learner,f.free().resourceId(),submission(enrollmentId,f.free(),"fr",UUID.randomUUID(),true)));
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM learning_quiz_attempts WHERE id=?",wrong.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void quizSubmissionIsIdempotentAndAConcurrentAttemptCannotExceedTheEditorialLimit()throws Exception {
        UUID editor=actor(true),learner=actor(false);var f=fixture(editor,new QuizPolicy(100,1),false);UUID enrollment=enroll(learner,f).summary().id();
        var one=submission(enrollment,f.free(),"fr",UUID.randomUUID(),true);var two=submission(enrollment,f.free(),"fr",UUID.randomUUID(),false);var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return attempt(()->learning.submitQuiz(learner,learner,f.free().resourceId(),one));});
            var b=pool.submit(()->{start.await();return attempt(()->learning.submitQuiz(learner,learner,f.free().resourceId(),two));});start.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","QUIZ_ATTEMPTS_EXHAUSTED");
        }
        var saved=learning.attempts(learner,f.free().versionId(),0,20).items().getFirst();var original=saved.submissionId().equals(one.submissionId())?one:two;
        assertThat(learning.submitQuiz(learner,learner,f.free().resourceId(),original)).isEqualTo(saved);
        var changed=new SubmitQuiz(enrollment,f.free().versionId(),f.free().publishedRevisionId(),"fr",original.submissionId(),answers(!saved.passed()));
        expect(ApiError.CONFLICT,()->learning.submitQuiz(learner,learner,f.free().resourceId(),changed));
        editorial.archive(editor,f.free().id(),tag(editorial.get(editor,f.free().id())),new ArchiveContent("Withdraw after persisted quiz"));
        assertThat(learning.submitQuiz(learner,learner,f.free().resourceId(),original)).isEqualTo(saved);
        assertThat(learning.attempts(learner,f.free().versionId(),0,20).total()).isEqualTo(1);
    }

    @Test void anonymousFeedbackIsRealButNeverWritesLearningAndAWithdrawnContextCannotMutateProgress() {
        UUID editor=actor(true),learner=actor(false);var f=fixture(editor,null,false);var enrollment=enroll(learner,f);long before=jdbc.queryForObject("SELECT count(*) FROM learning_quiz_attempts",Long.class);
        var result=learning.checkQuiz(f.free().resourceId(),f.free().versionId(),new CheckQuiz("fr",f.free().publishedRevisionId(),answers(true)));assertThat(result.passed()).isTrue();assertThat(result.policy()).isEqualTo(new QuizPolicy(100,null));assertThat(result.results().get(1).explanation()).contains("tarif");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM learning_quiz_attempts",Long.class)).isEqualTo(before);
        expect(ApiError.VALIDATION_FAILED,()->learning.checkQuiz(f.free().resourceId(),f.free().versionId(),new CheckQuiz("fr",f.free().publishedRevisionId(),List.of(new QuizAnswer("unknown",0)))));
        expect(ApiError.REVISION_CONFLICT,()->learning.checkQuiz(f.free().resourceId(),f.free().versionId(),new CheckQuiz("fr",UUID.randomUUID(),answers(true))));
        assertThat(catchThrowable(()->learning.checkQuiz(f.protectedActivity().resourceId(),f.protectedActivity().versionId(),new CheckQuiz("fr",f.protectedActivity().publishedRevisionId(),answers(true))))).isInstanceOf(AccessDeniedException.class);
        editorial.archive(editor,f.module().id(),tag(editorial.get(editor,f.module().id())),new ArchiveContent("Module unavailable while standalone activity remains public"));
        assertThat(catalogue.version(f.free().resourceId(),f.free().versionId(),"fr").document()).isNotNull();
        var unavailable=learning.activity(learner,enrollment.summary().id(),f.free().resourceId(),f.free().versionId(),"fr");assertThat(unavailable.availability()).isEqualTo("WITHDRAWN");assertThat(unavailable.accessStatus()).isEqualTo("UNAVAILABLE");assertThat(unavailable.resource().document()).isNull();
        expect(ApiError.RESOURCE_NOT_FOUND,()->learning.setProgress(learner,learner,f.free().resourceId(),progressTag(unavailable.progress()),new SetActivityProgress(enrollment.summary().id(),f.free().versionId(),true,true,"fr")));
        assertThat(learning.dashboard(learner,"fr").resume()).isNull();assertThat(learning.dashboard(learner,"fr").enrollments()).hasSize(1);
    }

    @Test void programmeKeepsTwoExactVersionsOfOneActivityAndNeverUpgradesTheSavedDenominator() {
        UUID editor=actor(true),learner=actor(false);var first=publish(editor,create(editor,ResourceKind.ACTIVITY,"FREE",null,List.of()));
        var second=publish(editor,editorial.newVersion(editor,first.id(),tag(editorial.get(editor,first.id())),new NewVersion("Different objective","Different assessment","BR01 second version","Second version",document(ResourceKind.ACTIVITY,"FREE",null,"fr"),List.of(),"New pedagogical version")));
        var m1=publish(editor,create(editor,ResourceKind.MODULE,"FREE",null,List.of(first.versionId())));var m2=publish(editor,create(editor,ResourceKind.MODULE,"FREE",null,List.of(second.versionId())));
        var course=publish(editor,create(editor,ResourceKind.COURSE,"FREE",null,List.of(m1.versionId(),m2.versionId())));
        var enrollment=learning.enroll(learner,learner,new EnrollCourse(course.resourceId(),course.versionId(),"fr")).value();UUID id=enrollment.summary().id();
        var a=learning.activity(learner,id,first.resourceId(),first.versionId(),"fr");var b=learning.activity(learner,id,first.resourceId(),second.versionId(),"fr");assertThat(a.progress().id()).isNotEqualTo(b.progress().id());assertThat(a.activityVersionId()).isEqualTo(first.versionId());assertThat(b.activityVersionId()).isEqualTo(second.versionId());
        learning.setProgress(learner,learner,first.resourceId(),progressTag(b.progress()),new SetActivityProgress(id,second.versionId(),true,false,"fr"));
        assertThat(learning.progress(learner,first.resourceId(),id,first.versionId()).readAt()).isNull();assertThat(learning.progress(learner,first.resourceId(),id,second.versionId()).readAt()).isNotNull();
        var third=publish(editor,editorial.newVersion(editor,second.id(),tag(editorial.get(editor,second.id())),new NewVersion("Third objective","Third assessment","BR01 third version","Third version",second.document(),List.of(),"Another pedagogical version")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->learning.activity(learner,id,first.resourceId(),third.versionId(),"fr"));assertThat(learning.enrollment(learner,id,"fr").summary().progress().totalActivities()).isEqualTo(2);
        var missing=learning.activity(learner,id,first.resourceId(),first.versionId(),"en");assertThat(missing.accessStatus()).isEqualTo("UNAVAILABLE");assertThat(missing.resource().document()).isNull();
    }

    @Test void effectiveDefaultPolicyIsCompatibleButNewThresholdOrTranslationMismatchRequiresARealReview() {
        UUID editor=actor(true);var source=publish(editor,create(editor,ResourceKind.ACTIVITY,"FREE",null,List.of()));var d=source.document();
        var explicit=new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),d.access(),d.media(),d.relatedResourceIds(),d.methodDefinition(),new QuizPolicy(100,null));
        var revised=editorial.revise(editor,source.id(),tag(editorial.get(editor,source.id())),new SaveRevision(source.title(),source.summary(),explicit,"Explicit equivalent legacy policy"));assertThat(revised.document().quizPolicy()).isEqualTo(new QuizPolicy(100,null));
        var altered=new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),d.access(),d.media(),d.relatedResourceIds(),null,new QuizPolicy(80,2));
        expect(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED,()->editorial.revise(editor,revised.id(),tag(revised),new SaveRevision(source.title(),source.summary(),altered,"Changed frozen policy")));
        var translated=editorial.translate(editor,revised.id(),tag(revised),new CreateTranslation("en","policy-en-"+UUID.randomUUID(),"English quiz","Explicit mismatch",document(ResourceKind.ACTIVITY,"FREE",new QuizPolicy(80,2),"en"),"Translation needs equivalent policy"));
        assertThat(editorial.readiness(editor,translated.id()).blockingIssues()).extracting(Issue::code).contains("TRANSLATION_ASSESSMENT_MISMATCH");
        var mediaA=new LearningMediaPort.AuthorizedMedia(UUID.randomUUID(),source.versionId(),"fr",120);var mediaB=new LearningMediaPort.AuthorizedMedia(UUID.randomUUID(),source.versionId(),"en",90);
        var positionA=LearningMediaPort.MediaPosition.forMedia(mediaA,45);var positionB=LearningMediaPort.MediaPosition.forMedia(mediaB,12);assertThat(positionA.mediaId()).isNotEqualTo(positionB.mediaId());assertThat(positionA.positionSeconds()).isEqualTo(45);assertThat(positionB.positionSeconds()).isEqualTo(12);
        expect(ApiError.VALIDATION_FAILED,()->LearningMediaPort.MediaPosition.forMedia(mediaB,120));expect(ApiError.VALIDATION_FAILED,()->LearningMediaPort.MediaPosition.forMedia(mediaA,Double.NaN));
    }

    @Test void upgradingThePreviousSchemaPreservesSessionPrivateTextAndLegacyQuizPolicy()throws Exception {
        String schema="learning_upgrade_"+UUID.randomUUID().toString().replace("-","");
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("006").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));UUID user=UUID.randomUUID(),method=UUID.randomUUID();String session=UUID.randomUUID().toString();
            isolated.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",user,user+"@example.test");
            isolated.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),user);
            isolated.update("INSERT INTO personal_methods(id,owner_id,title,locale,body,parameters,notes) VALUES(?,?,'Existing method','fr','Existing private method','{}'::jsonb,'Existing private notes')",method,user);
            isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(isolated.queryForObject("SELECT body FROM personal_methods WHERE id=?",String.class,method)).isEqualTo("Existing private method");assertThat(isolated.queryForObject("SELECT notes FROM personal_methods WHERE id=?",String.class,method)).isEqualTo("Existing private notes");
            assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);assertThat(isolated.queryForObject("SELECT count(*) FROM user_preferences WHERE user_id=?",Integer.class,user)).isEqualTo(1);
            assertThat(isolated.queryForObject("SELECT count(*) FROM learning_enrollments",Integer.class)).isZero();assertThat(isolated.queryForObject("SELECT count(*) FROM learning_quiz_attempts",Integer.class)).isZero();
            String old=mapper.writeValueAsString(document(ResourceKind.ACTIVITY,"FREE",null,"fr")).replace(",\"quizPolicy\":null","");assertThat(LearningValidation.effectivePolicy(mapper.readValue(old,ContentDocument.class).quizPolicy())).isEqualTo(new QuizPolicy(100,null));
        }
    }

    private UUID actor(boolean editor) {UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='LEARNER' OR (? AND code='EDITOR')",id,editor);return id;}
    private Fixture fixture(UUID editor,QuizPolicy policy,boolean protectedCourse) {var free=publish(editor,create(editor,ResourceKind.ACTIVITY,"FREE",policy,List.of()));var protectedActivity=publish(editor,create(editor,ResourceKind.ACTIVITY,"PROTECTED",policy,List.of()));var module=publish(editor,create(editor,ResourceKind.MODULE,"FREE",null,List.of(free.versionId(),protectedActivity.versionId())));var course=publish(editor,create(editor,ResourceKind.COURSE,protectedCourse?"PROTECTED":"FREE",null,List.of(module.versionId())));return new Fixture(free,protectedActivity,module,course);}
    private EnrollmentView enroll(UUID actor,Fixture f) {return learning.enroll(actor,actor,new EnrollCourse(f.course().resourceId(),f.course().versionId(),"fr")).value();}
    private ContentView create(UUID actor,ResourceKind kind,String access,QuizPolicy policy,List<UUID> children) {return editorial.create(actor,new CreateContent(kind,"fr","learning-"+UUID.randomUUID(),"BR01 "+kind,"Fictional learning integration fixture","Distinguish supplied facts","Verify declared facts",document(kind,access,policy,"fr"),children,"P08 real PostgreSQL fixture"));}
    private static ContentDocument document(ResourceKind kind,String access,QuizPolicy policy,String locale) {
        boolean activity=kind==ResourceKind.ACTIVITY;return new ContentDocument("Distinguish supplied facts","A checked list of facts and questions",List.of(),List.of(new ContentBlock("PARAGRAPH","BR01 asks for four French pages. Logo and integration need clarification.",null)),null,
            activity?new Exercise("List facts and information to clarify.","Do not invent logo or integration pricing."):null,activity?questions(locale):List.of(),activity?List.of(new RubricCriterion("facts","Facts remain distinct from assumptions",1,false)):List.of(),access,List.of(),List.of(),null,policy);
    }
    private static List<QuizQuestion> questions(String locale) {boolean en="en".equals(locale);return List.of(
        new QuizQuestion("budget",en?"What total follows from the supplied prices?":"Quel montant résulte des tarifs fournis ?",List.of("1 400 € HT","1 200 € HT","1 180 € HT"),1,en?"The budget ceiling does not replace the sum of the listed services.":"Le budget maximal ne remplace pas le calcul des cinq prestations.",1),
        new QuizQuestion("integration",en?"How should unpriced website integration be handled?":"Que faire de l’intégration sans tarif ?",List.of("Include remaining budget","Free integration","Clarify and price separately"),2,en?"Remaining budget is not an agreed price.":"Un montant disponible ne crée pas un tarif convenu.",1),
        new QuizQuestion("calendar",en?"Can delivery on 25 November be promised?":"Peut-on annoncer le 25 novembre ?",List.of("Always fifteen days","Starting conditions unconfirmed","If the client prefers"),1,en?"A conditional duration is not an agreed start date.":"Le dossier donne un délai conditionnel, pas une date ferme.",1));}
    private ContentView publish(UUID actor,ContentView initial) {var content=editorial.get(actor,initial.id());if(content.state()==EditorialState.DRAFT||content.state()==EditorialState.STALE)content=editorial.transition(actor,content.id(),tag(content),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));UUID source=content.sourceTranslationId()==null?null:editorial.get(actor,content.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(actor,content.id(),tag(content),new TransitionContent(EditorialState.READY,"Review exact version",source));return editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish reviewed fixture"));}
    private static List<QuizAnswer> answers(boolean correct) {return List.of(new QuizAnswer("budget",correct?1:0),new QuizAnswer("integration",correct?2:0),new QuizAnswer("calendar",correct?1:0));}
    private static SubmitQuiz submission(UUID enrollment,ContentView activity,String locale,UUID key,boolean correct) {return new SubmitQuiz(enrollment,activity.versionId(),activity.publishedRevisionId(),locale,key,answers(correct));}
    private static String tag(ContentView content) {return EntityTags.forRevision("content",content.id(),content.revision());}
    private static String progressTag(ActivityProgressView progress) {return EntityTags.forRevision("activity-progress",progress.id(),progress.revision());}
    private static String noteTag(ActivityNoteView note) {return EntityTags.forRevision("activity-note",note.id(),note.revision());}
    private static void expect(ApiError expected,Runnable work) {var failed=catchThrowable(work::run);assertThat(failed).isInstanceOf(ApiException.class);assertThat(((ApiException)failed).error()).isEqualTo(expected);}
    private static String attempt(Runnable work) {try{work.run();return "OK";}catch(ApiException error){return error.error().name();}}
    private record Fixture(ContentView free,ContentView protectedActivity,ContentView module,ContentView course) { }
}
