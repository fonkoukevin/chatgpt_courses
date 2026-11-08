package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningTypes.QuizPolicy;
import com.chatgptcourses.shared.http.EntityTags;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Learning requests use real HTTP/filters/PostgreSQL. Editorial fixture setup uses the real publishing service. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "MAIL_MODE=disabled", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LearningHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        r.add("POSTGRES_HOST",POSTGRES::getHost); r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));
        r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Value("${local.server.port}") int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired EditorialService editorial;
    private static final String PRIVATE_NOTE="P08_PRIVATE_NOTE_SENTINEL", CORRECTION="P08_CORRECTION_AFTER_SUBMISSION_ONLY";

    @Test void anonymousCheckHasRealCorrectionCsrfAndNoDurableLearningSideEffect() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var anonymous=browser();
        var initial=get(anonymous,"/api/v1/catalog/resources/"+f.free().resourceId()+"/versions/"+f.free().versionId()+"?locale=fr");
        assertInitialWithoutSolutions(initial);
        var command=check(f.free(),"fr",0);var before=learningCounts();
        assertProblem(send(anonymous,"POST",checkPath(f.free()),command,null,null,null),403,"CSRF_INVALID");
        var result=send(anonymous,"POST",checkPath(f.free()),command,csrf(anonymous),null,null);
        assertThat(result.statusCode()).isEqualTo(200);assertPrivate(result);
        assertThat(tree(result).path("scorePoints").asInt()).isEqualTo(2);assertThat(tree(result).path("maxPoints").asInt()).isEqualTo(2);
        assertThat(tree(result).path("passed").asBoolean()).isTrue();assertThat(tree(result).path("policy").path("passPercent").asInt()).isEqualTo(100);
        assertThat(tree(result).path("results").get(0).path("explanation").asText()).isEqualTo(CORRECTION);
        for(String absent:List.of("id","attemptId","submissionId","submittedAt","savedAt","ownerId"))assertThat(tree(result).has(absent)).isFalse();
        assertThat(learningCounts()).isEqualTo(before);
        var forged=new LinkedHashMap<String,Object>(command);forged.put("scorePoints",2);
        assertProblem(send(anonymous,"POST",checkPath(f.free()),forged,csrf(anonymous),null,null),400,"INVALID_REQUEST");
        assertProblem(send(anonymous,"POST",checkPath(f.free()),check(f.free(),"fr",7),csrf(anonymous),null,null),400,"VALIDATION_FAILED");
        assertProblem(send(anonymous,"POST",checkPath(f.premium()),check(f.premium(),"fr",0),csrf(anonymous),null,null),403,"ACCESS_DENIED");
        var wrongRevision=new LinkedHashMap<String,Object>(command);wrongRevision.put("revisionId",UUID.randomUUID());
        assertProblem(send(anonymous,"POST",checkPath(f.free()),wrongRevision,csrf(anonymous),null,null),412,"REVISION_CONFLICT");
    }

    @Test void enrollmentIsIdempotentAcrossSessionsAndKeepsTheFullPinnedDenominator() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var owner=account(false);var second=browser();login(second,owner.email(),owner.password());
        var empty=tree(get(owner.browser(),"/api/v1/me/learning?locale=fr"));assertThat(empty.path("resume").isNull()).isTrue();assertThat(empty.path("enrollments").isEmpty()).isTrue();
        var body=enrollCommand(f.course(),"fr");
        String firstToken=csrf(owner.browser()),secondToken=csrf(second);
        var a=owner.browser().http().sendAsync(request("POST","/api/v1/me/enrollments",body,firstToken,owner.id().toString(),null),HttpResponse.BodyHandlers.ofString());
        var b=second.http().sendAsync(request("POST","/api/v1/me/enrollments",body,secondToken,owner.id().toString(),null),HttpResponse.BodyHandlers.ofString());
        var responses=List.of(a.get(),b.get());assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200,201);
        String id=tree(responses.getFirst()).path("summary").path("id").asText();
        assertThat(tree(responses.getLast()).path("summary").path("id").asText()).isEqualTo(id);
        var stored=get(second,"/api/v1/me/enrollments/"+id+"?locale=fr");assertPrivate(stored);
        assertThat(tree(stored).path("summary").path("progress").path("totalActivities").asInt()).isEqualTo(2);
        assertThat(tree(stored).path("activities").size()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM learning_enrollments WHERE owner_id=? AND course_version_id=?",Integer.class,owner.id(),f.course().versionId())).isEqualTo(1);
        var activity=get(second,activityPath(id,f.free(),"fr"));assertInitialWithoutSolutions(activity);
        assertThat(tree(activity).path("activityVersionId").asText()).isEqualTo(f.free().versionId().toString());
        assertThat(tree(activity).path("accessStatus").asText()).isEqualTo("ACTIVE");
        var premium=get(second,activityPath(id,f.premium(),"fr"));assertThat(tree(premium).path("resource").path("document").isNull()).isTrue();
        assertThat(tree(premium).path("accessStatus").asText()).isEqualTo("PROTECTED");
    }

    @Test void visitsReadCompletionQuizAndProjectAvailabilityRemainDifferentFacts() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var owner=account(false);String enrollment=enroll(owner,f.course(),"fr");
        var original=get(owner.browser(),progressPath(enrollment,f.free()));String initialTag=etag(original);
        var visited=mutate(owner,"POST","/api/v1/me/enrollments/"+enrollment+"/visits",Map.of("activityId",f.free().resourceId(),"activityVersionId",f.free().versionId(),"locale","fr"),null);
        assertThat(visited.statusCode()).isEqualTo(200);assertThat(etag(get(owner.browser(),progressPath(enrollment,f.free())))).isEqualTo(initialTag);
        var read=mutate(owner,"PUT",progressWritePath(f.free()),progressCommand(enrollment,f.free(),true,false),initialTag);
        assertThat(read.statusCode()).isEqualTo(200);assertThat(tree(read).path("readAt").isNull()).isFalse();assertThat(tree(read).path("completedAt").isNull()).isTrue();
        var quiz=mutate(owner,"POST",quizPath(f.free()),submit(f.free(),enrollment,"fr",UUID.randomUUID(),0),null);
        assertThat(quiz.statusCode()).isEqualTo(201);assertThat(tree(quiz).path("passed").asBoolean()).isTrue();
        var totals=tree(get(owner.browser(),"/api/v1/me/enrollments/"+enrollment+"?locale=fr")).path("summary").path("progress");
        assertThat(totals.path("readActivities").asInt()).isEqualTo(1);assertThat(totals.path("completedActivities").asInt()).isZero();
        assertThat(totals.path("quizPassedActivities").asInt()).isEqualTo(1);assertThat(totals.path("projectAvailability").asText()).isEqualTo("NOT_AVAILABLE");
        var done=mutate(owner,"PUT",progressWritePath(f.free()),progressCommand(enrollment,f.free(),false,true),etag(read));
        assertThat(tree(done).path("readAt").isNull()).isTrue();assertThat(tree(done).path("completedAt").isNull()).isFalse();
        assertProblem(mutate(owner,"PUT",progressWritePath(f.free()),progressCommand(enrollment,f.free(),true,true),initialTag),412,"REVISION_CONFLICT");
        assertProblem(mutate(owner,"PUT",progressWritePath(f.premium()),progressCommand(enrollment,f.premium(),true,true),etag(get(owner.browser(),progressPath(enrollment,f.premium())))),403,"ACCESS_DENIED");
        var second=browser();login(second,owner.email(),owner.password());
        assertThat(tree(get(second,"/api/v1/me/learning?locale=fr")).path("resume").path("activityVersionId").asText()).isEqualTo(f.free().versionId().toString());
    }

    @Test void notesKeepOriginalLanguageAcrossSessionsAndConcurrentEditsAndSourceWithdrawal() throws Exception {
        var editor=account(true);var f=fixture(editor,true,null);var owner=account(false);var second=browser();login(second,owner.email(),owner.password());
        String lookup="/api/v1/me/activity-notes/by-activity/"+f.free().resourceId()+"?activityVersionId="+f.free().versionId();
        assertThat(tree(get(owner.browser(),lookup)).path("note").isNull()).isTrue();
        var created=mutate(owner,"POST","/api/v1/me/activity-notes",noteCommand(f.free(),"fr",PRIVATE_NOTE),null);assertThat(created.statusCode()).isEqualTo(201);
        String path="/api/v1/me/activity-notes/"+text(created,"id");var otherSession=get(second,path);
        assertThat(tree(otherSession).path("locale").asText()).isEqualTo("fr");assertThat(tree(otherSession).path("text").asText()).isEqualTo(PRIVATE_NOTE);
        assertProblem(mutate(owner,"POST","/api/v1/me/activity-notes",noteCommand(f.free(),"en","Must not replace French note"),null),409,"ACTIVITY_NOTE_EXISTS");
        assertProblem(mutate(owner,"PATCH",path,Map.of("text","No precondition"),null),428,"PRECONDITION_REQUIRED");
        String firstToken=csrf(owner.browser()),secondToken=csrf(second);
        var first=owner.browser().http().sendAsync(request("PATCH",path,Map.of("text","First candidate"),firstToken,owner.id().toString(),etag(created)),HttpResponse.BodyHandlers.ofString());
        var last=second.http().sendAsync(request("PATCH",path,Map.of("text","Second candidate"),secondToken,owner.id().toString(),etag(created)),HttpResponse.BodyHandlers.ofString());
        var responses=List.of(first.get(),last.get());assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200,412);
        var winner=responses.stream().filter(r->r.statusCode()==200).findFirst().orElseThrow();
        assertThat(tree(get(second,path)).path("text")).isEqualTo(tree(winner).path("text"));
        archive(editor,f.free());var after=mutate(owner,"PATCH",path,Map.of("text","Mon travail personnel reste modifiable."),etag(winner));
        assertThat(after.statusCode()).isEqualTo(200);assertThat(tree(after).path("locale").asText()).isEqualTo("fr");
        assertThat(tree(get(second,path)).path("text").asText()).isEqualTo("Mon travail personnel reste modifiable.");
    }

    @Test void ownerCsrfAccountContextAndStrictCommandsProtectAllPrivateLearningObjects() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var owner=account(false);var other=account(false);String enrollment=enroll(owner,f.course(),"fr");
        var note=mutate(owner,"POST","/api/v1/me/activity-notes",noteCommand(f.free(),"fr",PRIVATE_NOTE),null);String notePath="/api/v1/me/activity-notes/"+text(note,"id");
        var attempt=mutate(owner,"POST",quizPath(f.free()),submit(f.free(),enrollment,"fr",UUID.randomUUID(),0),null);String attemptPath="/api/v1/me/quiz-attempts/"+text(attempt,"id");
        for(String path:List.of("/api/v1/me/enrollments/"+enrollment+"?locale=fr",activityPath(enrollment,f.free(),"fr"),progressPath(enrollment,f.free()),notePath,attemptPath))assertProblem(get(other.browser(),path),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(other,"PATCH",notePath,Map.of("text","No access"),etag(note)),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(other,"PUT",progressWritePath(f.free()),progressCommand(enrollment,f.free(),true,true),etag(get(owner.browser(),progressPath(enrollment,f.free())))),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(other,"POST",quizPath(f.free()),submit(f.free(),enrollment,"fr",UUID.randomUUID(),0),null),404,"RESOURCE_NOT_FOUND");
        assertProblem(get(browser(),"/api/v1/me/learning?locale=fr"),401,"AUTHENTICATION_REQUIRED");
        var body=enrollCommand(f.course(),"fr");
        assertProblem(send(owner.browser(),"POST","/api/v1/me/enrollments",body,null,owner.id().toString(),null),403,"CSRF_INVALID");
        assertProblem(send(owner.browser(),"POST","/api/v1/me/enrollments",body,csrf(owner.browser()),null,null),428,"ACCOUNT_CONTEXT_REQUIRED");
        assertProblem(send(owner.browser(),"POST","/api/v1/me/enrollments",body,csrf(owner.browser()),other.id().toString(),null),409,"ACCOUNT_CONTEXT_CHANGED");
        assertProblem(send(owner.browser(),"POST","/api/v1/me/enrollments",body,csrf(owner.browser()),"invalid-account",null),400,"VALIDATION_FAILED");
        var forged=new LinkedHashMap<String,Object>(submit(f.free(),enrollment,"fr",UUID.randomUUID(),0));forged.put("scorePoints",2);forged.put("ownerId",other.id());
        assertProblem(mutate(owner,"POST",quizPath(f.free()),forged,null),400,"INVALID_REQUEST");
        assertProblem(mutate(owner,"PATCH",notePath,Map.of("text","No language rewrite","locale","en"),etag(note)),400,"INVALID_REQUEST");
        assertProblem(get(owner.browser(),"/api/v1/me/quiz-attempts?activityVersionId="+f.free().versionId()+"&pageSize=101"),400,"VALIDATION_FAILED");
        jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),updated_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),revision=revision+1 WHERE user_id=? AND revoked_at IS NULL",other.id());
        assertProblem(get(other.browser(),"/api/v1/me/learning?locale=fr"),403,"ACCESS_DENIED");
    }

    @Test void quizReplayQuotaAndSnapshotsAreAuthoritativeAcrossLanguagesAndNewVersions() throws Exception {
        var editor=account(true);var f=fixture(editor,true,new QuizPolicy(100,2));var owner=account(false);String enrollment=enroll(owner,f.course(),"fr");
        UUID submission=UUID.randomUUID();var command=submit(f.free(),enrollment,"fr",submission,0);var second=browser();login(second,owner.email(),owner.password());
        String firstToken=csrf(owner.browser()),secondToken=csrf(second);
        var a=owner.browser().http().sendAsync(request("POST",quizPath(f.free()),command,firstToken,owner.id().toString(),null),HttpResponse.BodyHandlers.ofString());
        var b=second.http().sendAsync(request("POST",quizPath(f.free()),command,secondToken,owner.id().toString(),null),HttpResponse.BodyHandlers.ofString());
        var first=a.get();var replay=b.get();assertThat(first.statusCode()).isEqualTo(201);assertThat(replay.statusCode()).isEqualTo(201);assertThat(tree(first)).isEqualTo(tree(replay));
        assertThat(tree(first).path("scorePoints").asInt()).isEqualTo(2);assertThat(tree(first).path("attemptNumber").asInt()).isEqualTo(1);
        assertProblem(mutate(owner,"POST",quizPath(f.free()),submit(f.free(),enrollment,"fr",submission,1),null),409,"CONFLICT");
        var english=mutate(owner,"POST",quizPath(f.free()),submit(f.freeEnglish(),enrollment,"en",UUID.randomUUID(),1),null);
        assertThat(english.statusCode()).isEqualTo(201);assertThat(tree(english).path("attemptNumber").asInt()).isEqualTo(2);assertThat(tree(english).path("locale").asText()).isEqualTo("en");
        assertThat(tree(english).path("passed").asBoolean()).isFalse();
        assertProblem(mutate(owner,"POST",quizPath(f.free()),submit(f.free(),enrollment,"fr",UUID.randomUUID(),0),null),409,"QUIZ_ATTEMPTS_EXHAUSTED");
        var newer=newVersion(editor,f.free(),1);publish(editor,newer);
        String path="/api/v1/me/quiz-attempts/"+text(first,"id");assertThat(tree(get(second,path))).isEqualTo(tree(first));
        assertThat(tree(get(owner.browser(),activityPath(enrollment,f.free(),"fr"))).path("resource").path("versionId").asText()).isEqualTo(f.free().versionId().toString());
        archive(editor,f.free());assertThat(tree(get(second,path))).isEqualTo(tree(first));
        assertThat(tree(mutate(owner,"POST",quizPath(f.free()),command,null))).isEqualTo(tree(first));
        var history=tree(get(owner.browser(),"/api/v1/me/quiz-attempts?activityVersionId="+f.free().versionId()+"&pageSize=1"));
        assertThat(history.path("total").asInt()).isEqualTo(2);assertThat(history.path("items").size()).isEqualTo(1);
    }

    @Test void withdrawalOfAModuleBlocksChildActionsWithoutRemovingNotesOrFabricatingAccess() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var owner=account(false);String enrollment=enroll(owner,f.course(),"fr");
        var note=mutate(owner,"POST","/api/v1/me/activity-notes",noteCommand(f.free(),"fr",PRIVATE_NOTE),null);
        archive(editor,f.module());var response=get(owner.browser(),activityPath(enrollment,f.free(),"fr"));
        assertThat(response.statusCode()).isEqualTo(200);assertThat(tree(response).path("accessStatus").asText()).isEqualTo("UNAVAILABLE");
        assertThat(tree(response).path("resource").path("document").isNull()).isTrue();assertThat(tree(response).path("availability").asText()).isEqualTo("WITHDRAWN");
        assertProblem(mutate(owner,"POST","/api/v1/me/enrollments/"+enrollment+"/visits",Map.of("activityId",f.free().resourceId(),"activityVersionId",f.free().versionId(),"locale","fr"),null),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(owner,"PUT",progressWritePath(f.free()),progressCommand(enrollment,f.free(),true,true),etag(get(owner.browser(),progressPath(enrollment,f.free())))),404,"RESOURCE_NOT_FOUND");
        assertThat(tree(get(owner.browser(),"/api/v1/me/activity-notes/"+text(note,"id"))).path("text").asText()).isEqualTo(PRIVATE_NOTE);
        assertThat(tree(get(owner.browser(),"/api/v1/me/learning?locale=fr")).path("resume").isNull()).isTrue();
    }

    @Test void theSameActivityIdentityAtTwoPinnedVersionsRequiresAnExplicitVersionForEveryRead() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);var v2=publish(editor,newVersion(editor,f.free(),1));
        var otherModule=create(editor,ResourceKind.MODULE,"PROTECTED",List.of(v2.versionId()),null);otherModule=publish(editor,otherModule);
        var course=create(editor,ResourceKind.COURSE,"PROTECTED",List.of(f.module().versionId(),otherModule.versionId()),null);course=publish(editor,course);
        var owner=account(false);String enrollment=enroll(owner,course,"fr");
        var first=get(owner.browser(),activityPath(enrollment,f.free(),"fr"));var second=get(owner.browser(),activityPath(enrollment,v2,"fr"));
        assertThat(tree(first).path("activityVersionId").asText()).isEqualTo(f.free().versionId().toString());assertThat(tree(second).path("activityVersionId").asText()).isEqualTo(v2.versionId().toString());
        assertThat(tree(first).path("progress").path("id").asText()).isNotEqualTo(tree(second).path("progress").path("id").asText());
        assertProblem(get(owner.browser(),"/api/v1/me/enrollments/"+enrollment+"/activities/"+f.free().resourceId()+"?locale=fr"),400,"INVALID_REQUEST");
        assertProblem(get(owner.browser(),"/api/v1/me/activity-progress/"+f.free().resourceId()+"?enrollmentId="+enrollment),400,"INVALID_REQUEST");
        assertProblem(get(owner.browser(),"/api/v1/me/enrollments/"+enrollment+"/activities/"+f.free().resourceId()+"?locale=fr&activityVersionId="+UUID.randomUUID()),404,"RESOURCE_NOT_FOUND");
    }

    @Test void quizPolicyIsValidatedAndFrozenWhileTheSameEffectiveLegacyDefaultCanBeSaved() throws Exception {
        var editor=account(true);var f=fixture(editor,false,null);String path="/api/v1/admin/contents/"+f.free().id()+"/revisions";
        var same=Map.of("title",f.free().title(),"summary",f.free().summary(),"document",document(ResourceKind.ACTIVITY,"FREE",new QuizPolicy(100,null),0),"reason","Make the same legacy policy explicit");
        var saved=send(editor.browser(),"POST",path,same,csrf(editor.browser()),null,tag(editorial.get(editor.id(),f.free().id())));
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(tree(saved).path("document").path("quizPolicy").path("passPercent").asInt()).isEqualTo(100);
        for(var invalid:List.of(new QuizPolicy(0,null),new QuizPolicy(100,51))) {
            var body=Map.of("title",f.free().title(),"summary",f.free().summary(),"document",document(ResourceKind.ACTIVITY,"FREE",invalid,0),"reason","Reject invalid policy bounds");
            assertProblem(send(editor.browser(),"POST",path,body,csrf(editor.browser()),null,etag(saved)),400,"VALIDATION_FAILED");
        }
        var changed=Map.of("title",f.free().title(),"summary",f.free().summary(),"document",document(ResourceKind.ACTIVITY,"FREE",new QuizPolicy(50,null),0),"reason","A different assessment policy needs a new version");
        assertProblem(send(editor.browser(),"POST",path,changed,csrf(editor.browser()),null,etag(saved)),409,"NEW_PEDAGOGICAL_VERSION_REQUIRED");
    }

    private Fixture fixture(Account editor,boolean bilingual,QuizPolicy policy) {
        var free=publish(editor,create(editor,ResourceKind.ACTIVITY,"FREE",List.of(),policy));
        var premium=publish(editor,create(editor,ResourceKind.ACTIVITY,"PROTECTED",List.of(),policy));
        ContentView english=null;if(bilingual){english=translate(editor,free,policy);translate(editor,premium,policy);}
        var module=publish(editor,create(editor,ResourceKind.MODULE,"PROTECTED",List.of(free.versionId(),premium.versionId()),null));
        if(bilingual)translate(editor,module,null);
        var course=publish(editor,create(editor,ResourceKind.COURSE,"PROTECTED",List.of(module.versionId()),null));if(bilingual)translate(editor,course,null);
        return new Fixture(free,premium,module,course,english);
    }
    private ContentView create(Account editor,ResourceKind kind,String access,List<UUID> children,QuizPolicy policy) {
        return editorial.create(editor.id(),new CreateContent(kind,"fr",unique(),kind+" "+unique(),"Isolated fictional BR01 learning fixture","Distinguish supplied facts","Check the declared facts",document(kind,access,policy,0),children,"Isolated P08 HTTP fixture"));
    }
    private ContentView publish(Account editor,ContentView input) {
        var current=editorial.get(editor.id(),input.id());
        if(current.state()==EditorialState.DRAFT||current.state()==EditorialState.STALE)current=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.TO_REVIEW,"Request actual review",null));
        UUID source=current.sourceTranslationId()==null?null:editorial.get(editor.id(),current.sourceTranslationId()).currentRevisionId();
        var ready=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.READY,"Review exact revision",source));
        return editorial.publish(editor.id(),ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Explicit publication"));
    }
    private ContentView translate(Account editor,ContentView input,QuizPolicy policy) {
        var current=editorial.get(editor.id(),input.id());
        return publish(editor,editorial.translate(editor.id(),current.id(),tag(current),new CreateTranslation("en",unique(),"English "+current.title(),"Explicit fictional English fixture",document(current.kind(),current.document().access(),policy,0),"Explicit translation")));
    }
    private ContentView newVersion(Account editor,ContentView source,int correctOption) {
        var current=editorial.get(editor.id(),source.id());
        return editorial.newVersion(editor.id(),current.id(),tag(current),new NewVersion("New pedagogical objective","New quiz answer definition","New version "+unique(),"New fictional pedagogy",document(ResourceKind.ACTIVITY,"FREE",new QuizPolicy(100,null),correctOption),List.of(),"New pedagogy, preserve old attempts"));
    }
    private void archive(Account editor,ContentView source) {var current=editorial.get(editor.id(),source.id());editorial.archive(editor.id(),current.id(),tag(current),new ArchiveContent("Withdraw fixture, preserve history"));}
    private static ContentDocument document(ResourceKind kind,String access,QuizPolicy policy,int correct) {
        boolean activity=kind==ResourceKind.ACTIVITY;
        return new ContentDocument("Distinguer les faits du dossier BR01.","Un tableau faits, inconnues et conséquences.",List.of("Lire BR01 et TR01"),List.of(new ContentBlock("PARAGRAPH","Réécriture des quatre pages existantes. Logo et intégration à clarifier.",null)),null,
                activity?new Exercise("Relever deux faits et une inconnue.",CORRECTION):null,
                activity?List.of(new QuizQuestion("brief-fact","Quel élément est confirmé dans BR01 ?",List.of("Quatre pages existantes","Un tarif de logo confirmé"),correct,CORRECTION,2)):List.of(),
                activity?List.of(new RubricCriterion("facts","Aucun fait inventé",1,true)):List.of(),access,List.of(),List.of(),null,policy);
    }
    private String enroll(Account owner,ContentView course,String locale)throws Exception {var response=mutate(owner,"POST","/api/v1/me/enrollments",enrollCommand(course,locale),null);assertThat(response.statusCode()).isIn(200,201);return tree(response).path("summary").path("id").asText();}
    private static Map<String,Object> enrollCommand(ContentView course,String locale){return Map.of("courseResourceId",course.resourceId(),"courseVersionId",course.versionId(),"locale",locale);}
    private static Map<String,Object> check(ContentView activity,String locale,int option){return Map.of("revisionId",activity.currentRevisionId(),"locale",locale,"answers",List.of(Map.of("key","brief-fact","optionIndex",option)));}
    private static Map<String,Object> submit(ContentView activity,String enrollment,String locale,UUID submission,int option){var value=new LinkedHashMap<String,Object>(check(activity,locale,option));value.put("enrollmentId",enrollment);value.put("activityVersionId",activity.versionId());value.put("submissionId",submission);return value;}
    private static Map<String,Object> progressCommand(String enrollment,ContentView activity,boolean read,boolean completed){return Map.of("enrollmentId",enrollment,"activityVersionId",activity.versionId(),"read",read,"completed",completed,"locale","fr");}
    private static Map<String,Object> noteCommand(ContentView activity,String locale,String text){return Map.of("activityId",activity.resourceId(),"activityVersionId",activity.versionId(),"locale",locale,"text",text);}
    private static String checkPath(ContentView activity){return "/api/v1/learning/activities/"+activity.resourceId()+"/versions/"+activity.versionId()+"/quiz-checks";}
    private static String quizPath(ContentView activity){return "/api/v1/activities/"+activity.resourceId()+"/quiz-attempts";}
    private static String activityPath(String enrollment,ContentView activity,String locale){return "/api/v1/me/enrollments/"+enrollment+"/activities/"+activity.resourceId()+"?activityVersionId="+activity.versionId()+"&locale="+locale;}
    private static String progressWritePath(ContentView activity){return "/api/v1/me/activity-progress/"+activity.resourceId();}
    private static String progressPath(String enrollment,ContentView activity){return progressWritePath(activity)+"?enrollmentId="+enrollment+"&activityVersionId="+activity.versionId();}
    private Map<String,Integer> learningCounts(){var counts=new LinkedHashMap<String,Integer>();for(String table:List.of("learning_enrollments","learning_activity_progress","learning_activity_notes","learning_quiz_attempts"))counts.put(table,jdbc.queryForObject("SELECT count(*) FROM "+table,Integer.class));return counts;}
    private Account account(boolean editor)throws Exception {
        var browser=browser();String email=unique()+"@courses.invalid",password=unique()+"-isolated-password";
        var response=send(browser,"POST","/api/v1/auth/register",Map.of("email",email,"password",password,"locale","fr"),csrf(browser),null,null);assertThat(response.statusCode()).isEqualTo(201);
        UUID id=UUID.fromString(text(response,"id"));if(editor)assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),id)).isEqualTo(1);
        login(browser,email,password);return new Account(browser,id,email,password);
    }
    private void login(Browser browser,String email,String password)throws Exception {var request=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf(browser)).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(email,StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build();assertThat(browser.http().send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);}
    private String csrf(Browser browser)throws Exception {var response=get(browser,"/api/v1/auth/csrf");assertThat(response.statusCode()).isEqualTo(200);return text(response,"token");}
    private HttpResponse<String> mutate(Account owner,String method,String path,Object body,String etag)throws Exception{return send(owner.browser(),method,path,body,csrf(owner.browser()),owner.id().toString(),etag);}
    private HttpResponse<String> send(Browser browser,String method,String path,Object body,String csrf,String account,String etag)throws Exception{return browser.http().send(request(method,path,body,csrf,account,etag),HttpResponse.BodyHandlers.ofString());}
    private HttpRequest request(String method,String path,Object body,String csrf,String account,String etag)throws Exception {var request=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));if(body!=null)request.header("Content-Type","application/json");if(csrf!=null)request.header("X-CSRF-TOKEN",csrf);if(account!=null)request.header("X-Account-Context",account);if(etag!=null)request.header("If-Match",etag);return request.build();}
    private HttpResponse<String> get(Browser browser,String path)throws Exception{return browser.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private JsonNode tree(HttpResponse<String> response)throws Exception{return mapper.readTree(response.body());}
    private String text(HttpResponse<String> response,String field)throws Exception{return tree(response).path(field).asText();}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
    private static String etag(HttpResponse<String> response){return response.headers().firstValue("ETag").orElseThrow();}
    private static String tag(ContentView content){return EntityTags.forRevision("content",content.id(),content.revision());}
    private static String unique(){return "p08-"+UUID.randomUUID();}
    private void assertPrivate(HttpResponse<String> response){assertThat(response.headers().firstValue("Cache-Control")).hasValue("private, no-store");assertThat(response.body()).doesNotContain("\"ownerId\"","\"passwordHash\"");}
    private void assertInitialWithoutSolutions(HttpResponse<String> response){assertThat(response.statusCode()).isEqualTo(200);assertThat(response.body()).doesNotContain("\"correctOption\"","\"correction\"","\"explanation\"",CORRECTION);}
    private void assertProblem(HttpResponse<String> response,int status,String code)throws Exception{assertThat(response.statusCode()).isEqualTo(status);assertPrivate(response);var value=tree(response);assertThat(value.path("type").asText()).isEqualTo("about:blank");assertThat(value.path("code").asText()).isEqualTo(code);assertThat(value.path("status").asInt()).isEqualTo(status);assertThat(response.body()).doesNotContain(PRIVATE_NOTE,CORRECTION,"rejectedValue");assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(v->assertThat(v).startsWith("application/problem+json"));}
    private static Browser browser(){return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build());}
    private record Browser(HttpClient http){}
    private record Account(Browser browser,UUID id,String email,String password){@Override public String toString(){return "Account[redacted]";}}
    private record Fixture(ContentView free,ContentView premium,ContentView module,ContentView course,ContentView freeEnglish){}
}
