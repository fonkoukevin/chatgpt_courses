package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.projects.service.ProjectTypes.ProjectPolicy;
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
import java.util.ArrayList;
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

/** Real HTTP, sessions, CSRF, permission refresh and PostgreSQL. Editorial fixtures use the actual publishing service. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "MAIL_MODE=disabled", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ProjectsHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));
        r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Value("${local.server.port}") int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired EditorialService editorial;
    private static final String PRIVATE_TEXT="P09_PRIVATE_PRODUCTION_SENTINEL",CORRECTION="P09_CORRECTION_EXPLICIT_REVEAL_ONLY";

    @Test void publicWorkshopHasExactFreePublishedSourceAndNoInitialSolutionOrPrivateSave() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","EXPLICIT",16,true);var anonymous=browser();
        var result=get(anonymous,templatePath(source,"fr"));assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.headers().firstValue("Cache-Control")).hasValue("no-store");
        assertThat(result.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(tree(result).path("availability").asText()).isEqualTo("PUBLISHED");
        assertThat(tree(result).path("rubric").path("criteria").size()).isEqualTo(20);
        assertThat(tree(result).path("rubric").has("id")).isFalse();
        assertThat(result.body()).doesNotContain(CORRECTION,"\"correction\"","\"answers\"","\"ownerId\"");
        assertThat(tree(get(anonymous,templatePath(source,"en"))).path("availability").asText()).isEqualTo("PUBLISHED");
        assertProblem(get(anonymous,"/api/v1/me/projects"),401,"AUTHENTICATION_REQUIRED");
        var draft=createContent(editor,"BR01","EXPLICIT",16,"FREE");
        assertProblem(get(anonymous,templatePath(draft,"fr")),404,"RESOURCE_NOT_FOUND");
        var premium=publish(editor,createContent(editor,"BR01","EXPLICIT",16,"PROTECTED"));
        var protectedSource=get(anonymous,templatePath(premium,"fr"));assertThat(tree(protectedSource).path("resource").isNull()).isTrue();assertThat(tree(protectedSource).path("rubric").isNull()).isTrue();
        assertProblem(get(anonymous,"/api/v1/project-templates/"+source.resourceId()+"/versions/"+UUID.randomUUID()+"?locale=fr"),404,"RESOURCE_NOT_FOUND");
    }

    @Test void creationAndAssessmentAreIdempotentAndServerComputesDeclaredScoreWithoutChangingTextEtag() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","EXPLICIT",16,false);var owner=account(false);
        var command=createCommand(source,UUID.randomUUID(),fields("Ma proposition",PRIVATE_TEXT),"READY_FOR_SELF_ASSESSMENT");
        var created=mutate(owner,"POST","/api/v1/me/projects",command,null);assertThat(created.statusCode()).isEqualTo(201);assertPrivate(created);
        String path=projectPath(created),tag=etag(created);assertThat(created.headers().firstValue("Location")).hasValue(path);
        var replay=mutate(owner,"POST","/api/v1/me/projects",command,null);assertThat(replay.statusCode()).isEqualTo(200);assertThat(tree(replay)).isEqualTo(tree(created));assertThat(etag(replay)).isEqualTo(tag);
        var different=new LinkedHashMap<String,Object>(command);different.put("fields",fields("Autre titre",PRIVATE_TEXT));
        assertProblem(mutate(owner,"POST","/api/v1/me/projects",different,null),409,"CONFLICT");
        var submit=assessment(created,UUID.randomUUID(),16,false,"Commentaire personnel.");
        var assessed=mutate(owner,"POST",path+"/self-assessments",submit,tag);assertThat(assessed.statusCode()).isEqualTo(201);assertPrivate(assessed);
        assertThat(assessed.headers().firstValue("ETag")).isEmpty();
        var value=tree(assessed);assertThat(value.path("scorePoints").asInt()).isEqualTo(16);assertThat(value.path("maxPoints").asInt()).isEqualTo(20);
        assertThat(value.path("passPoints").asInt()).isEqualTo(16);assertThat(value.path("thresholdMet").asBoolean()).isTrue();assertThat(value.path("needsRevision").asBoolean()).isFalse();
        assertThat(value.path("method").asText()).isEqualTo("SELF_ASSESSMENT");assertThat(value.path("declaredByUser").asBoolean()).isTrue();assertThat(value.path("evaluatorId").isNull()).isTrue();
        assertThat(value.path("authorId").asText()).isEqualTo(owner.id().toString());assertThat(value.path("answers").size()).isEqualTo(20);
        assertThat(etag(get(owner.browser(),path))).isEqualTo(tag);
        var status=get(owner.browser(),path+"/status");assertThat(tree(status).path("state").asText()).isEqualTo("SELF_ASSESSED");assertThat(status.headers().firstValue("ETag")).isEmpty();
        var same=mutate(owner,"POST",path+"/self-assessments",submit,"\"project-"+text(created,"id")+"-r999\"");
        assertThat(same.statusCode()).isEqualTo(201);assertThat(tree(same)).isEqualTo(tree(assessed));
        var changed=new LinkedHashMap<String,Object>(submit);changed.put("comment","Un autre corps ne remplace pas la preuve.");assertProblem(mutate(owner,"POST",path+"/self-assessments",changed,tag),409,"CONFLICT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM project_self_assessments WHERE project_id=?",Integer.class,UUID.fromString(text(created,"id")))).isEqualTo(1);
    }

    @Test void thresholdBlockingDeclarationsAndBr02AdaptedRubricRemainExplicitAndDeclarative() throws Exception {
        var editor=account(true);var owner=account(false);var source=fixture(editor,"BR02","EXPLICIT",17,false);
        var created=createProject(owner,source,"Proposition BR02","Texte libre contenant volontairement un montant non analysé.");String path=projectPath(created);
        assertThat(tree(created).path("rubric").path("caseCode").asText()).isEqualTo("BR02");assertThat(tree(created).path("rubric").path("passPoints").asInt()).isEqualTo(17);
        var below=mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),16,false,"Sous le seuil configuré."),etag(created));
        assertThat(tree(below).path("thresholdMet").asBoolean()).isFalse();assertThat(tree(below).path("needsRevision").asBoolean()).isTrue();
        var blocked=mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),20,true,"Tous contrôles cochés mais erreur déclarée."),etag(created));
        assertThat(tree(blocked).path("scorePoints").asInt()).isEqualTo(20);assertThat(tree(blocked).path("thresholdMet").asBoolean()).isTrue();assertThat(tree(blocked).path("needsRevision").asBoolean()).isTrue();
        assertThat(tree(blocked).path("blockingIssues").get(0).path("key").asText()).isEqualTo("invented-claims");
        assertThat(tree(blocked).path("blockingIssues").get(0).path("comment").asText()).isEqualTo("Déclaration explicite à corriger.");
        assertThat(tree(get(owner.browser(),path+"/status")).path("state").asText()).isEqualTo("NEEDS_REVISION");
        assertThat(tree(get(owner.browser(),path)).path("fields").path("externalText").asText()).isEqualTo("Texte libre contenant volontairement un montant non analysé.");
    }

    @Test void savingNewTextPreservesHistoricalProductionAndAssessmentAndPagesContainOnlySummaries() throws Exception {
        var editor=account(true);var owner=account(false);var source=fixture(editor,"BR01","EXPLICIT",16,true);
        var created=createProject(owner,source,"Ancienne version",PRIVATE_TEXT);String path=projectPath(created);String oldRevision=text(created,"currentRevisionId");
        var declaration=assessment(created,UUID.randomUUID(),20,false,"Historique inchangé.");
        var assessed=mutate(owner,"POST",path+"/self-assessments",declaration,etag(created));
        var updated=mutate(owner,"PATCH",path,Map.of("fields",fields("Nouvelle version","Nouveau travail autonome"),"stage","DRAFT"),etag(created));assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(etag(updated)).isNotEqualTo(etag(created));assertThat(text(updated,"currentRevisionId")).isNotEqualTo(oldRevision);
        var status=tree(get(owner.browser(),path+"/status"));assertThat(status.path("state").asText()).isEqualTo("DRAFT");
        assertThat(status.path("latestAssessment").isNull()).isTrue();
        var old=get(owner.browser(),path+"/revisions/"+oldRevision);assertPrivate(old);assertThat(tree(old).path("fields").path("externalText").asText()).isEqualTo(PRIVATE_TEXT);
        assertThat(tree(get(owner.browser(),path+"/self-assessments/"+text(assessed,"id")))).isEqualTo(tree(assessed));
        var historicalReplay=mutate(owner,"POST",path+"/self-assessments",declaration,etag(created));
        assertThat(historicalReplay.statusCode()).isEqualTo(201);assertThat(tree(historicalReplay)).isEqualTo(tree(assessed));
        assertThat(tree(get(owner.browser(),path+"/status")).path("state").asText()).isEqualTo("DRAFT");
        var revisions=get(owner.browser(),path+"/revisions?page=0&pageSize=1");assertThat(tree(revisions).path("total").asInt()).isEqualTo(2);assertThat(tree(revisions).path("items").get(0).path("id").asText()).isEqualTo(text(updated,"currentRevisionId"));
        assertThat(revisions.body()).doesNotContain("\"fields\"",PRIVATE_TEXT);
        var assessments=get(owner.browser(),path+"/self-assessments?pageSize=1");assertThat(tree(assessments).path("total").asInt()).isEqualTo(1);assertThat(assessments.body()).doesNotContain("\"answers\"","\"comment\"","Historique inchangé.");
        var context=get(owner.browser(),path+"/context?locale=en");assertThat(context.statusCode()).isEqualTo(200);assertThat(tree(context).path("resource").path("locale").asText()).isEqualTo("en");
        assertThat(tree(get(owner.browser(),path)).path("fields").path("locale").asText()).isEqualTo("fr");
    }

    @Test void actualOwnerCsrfAccountContextAndStrictDtoProtectEveryPrivateProjectRepresentation() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","EXPLICIT",16,false);var owner=account(false);var other=account(false);
        var created=createProject(owner,source,"Privé",PRIVATE_TEXT);String path=projectPath(created);var assessed=mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),20,false,"Privé"),etag(created));
        for(String suffix:List.of("","/status","/context?locale=fr","/revisions","/revisions/"+text(created,"currentRevisionId"),"/self-assessments","/self-assessments/"+text(assessed,"id")))assertProblem(get(other.browser(),path+suffix),404,"RESOURCE_NOT_FOUND");
        var save=Map.of("fields",fields("Révision","Autre texte"),"stage","DRAFT");
        assertProblem(mutate(other,"PATCH",path,save,etag(created)),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(other,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),20,false,""),etag(created)),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(other,"POST",revealPath(source),revealCommand(created,source),null),404,"RESOURCE_NOT_FOUND");
        assertProblem(send(owner.browser(),"PATCH",path,save,null,owner.id().toString(),etag(created)),403,"CSRF_INVALID");
        assertProblem(send(owner.browser(),"PATCH",path,save,csrf(owner.browser()),null,etag(created)),428,"ACCOUNT_CONTEXT_REQUIRED");
        assertProblem(send(owner.browser(),"PATCH",path,save,csrf(owner.browser()),other.id().toString(),etag(created)),409,"ACCOUNT_CONTEXT_CHANGED");
        assertProblem(send(owner.browser(),"PATCH",path,save,csrf(owner.browser()),"not-a-uuid",etag(created)),400,"VALIDATION_FAILED");
        var injected=new LinkedHashMap<String,Object>(save);injected.put("ownerId",other.id());assertProblem(mutate(owner,"PATCH",path,injected,etag(created)),400,"INVALID_REQUEST");
        var forged=new LinkedHashMap<String,Object>(assessment(created,UUID.randomUUID(),20,false,""));forged.put("scorePoints",20);assertProblem(mutate(owner,"POST",path+"/self-assessments",forged,etag(created)),400,"INVALID_REQUEST");
        assertThat(tree(get(other.browser(),"/api/v1/me/projects?q="+PRIVATE_TEXT)).path("total").asInt()).isZero();
        assertThat(jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),updated_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),revision=revision+1 WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code='LEARNER') AND revoked_at IS NULL",owner.id())).isEqualTo(1);
        assertProblem(mutate(owner,"PATCH",path,save,etag(created)),403,"ACCESS_DENIED");
    }

    @Test void explicitRevisionPreconditionsAndRealConcurrentSavesPreventLostProduction() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","EXPLICIT",16,false);var owner=account(false);var second=browser();login(second,owner.email(),owner.password());
        var created=createProject(owner,source,"Original",PRIVATE_TEXT);String path=projectPath(created),tag=etag(created);
        var save=Map.of("fields",fields("Concurrent","Candidate one"),"stage","READY_FOR_SELF_ASSESSMENT");
        assertProblem(mutate(owner,"PATCH",path,save,null),428,"PRECONDITION_REQUIRED");
        String aToken=csrf(owner.browser()),bToken=csrf(second);
        var a=owner.browser().http().sendAsync(request("PATCH",path,save,aToken,owner.id().toString(),tag),HttpResponse.BodyHandlers.ofString());
        var b=second.http().sendAsync(request("PATCH",path,Map.of("fields",fields("Concurrent","Candidate two"),"stage","READY_FOR_SELF_ASSESSMENT"),bToken,owner.id().toString(),tag),HttpResponse.BodyHandlers.ofString());
        var responses=List.of(a.get(),b.get());assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200,412);
        var winner=responses.stream().filter(r->r.statusCode()==200).findFirst().orElseThrow();
        assertThat(tree(get(second,path))).isEqualTo(tree(winner));
        assertProblem(mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),20,false,"Ancienne révision"),tag),412,"REVISION_CONFLICT");
        var wrongRevision=new LinkedHashMap<String,Object>(assessment(winner,UUID.randomUUID(),20,false,""));wrongRevision.put("projectRevisionId",UUID.randomUUID());assertProblem(mutate(owner,"POST",path+"/self-assessments",wrongRevision,etag(winner)),412,"REVISION_CONFLICT");
        var empty=mutate(owner,"PATCH",path,Map.of("fields",fields("Sans production",""),"stage","READY_FOR_SELF_ASSESSMENT"),etag(winner));assertProblem(empty,409,"PROJECT_NOT_READY");
        assertProblem(get(owner.browser(),"/api/v1/me/projects?pageSize=101"),400,"VALIDATION_FAILED");
    }

    @Test void withdrawnSourceDeniesNewAndReplayedCorrectionButPreservesOwnerProductionAndDeclaredHistory() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","EXPLICIT",16,false);var owner=account(false);
        var create=createCommand(source,UUID.randomUUID(),fields("Conservé",PRIVATE_TEXT),"READY_FOR_SELF_ASSESSMENT");var created=mutate(owner,"POST","/api/v1/me/projects",create,null);String path=projectPath(created);
        var assessed=mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),20,false,"À conserver"),etag(created));
        var reveal=mutate(owner,"POST",revealPath(source),revealCommand(created,source),null);assertThat(reveal.statusCode()).isEqualTo(200);assertThat(tree(reveal).path("correction").asText()).isEqualTo(CORRECTION);
        var repeat=mutate(owner,"POST",revealPath(source),revealCommand(created,source),null);assertThat(tree(repeat)).isEqualTo(tree(reveal));assertThat(etag(get(owner.browser(),path))).isEqualTo(etag(created));
        archive(editor,source);
        assertProblem(mutate(owner,"POST",revealPath(source),revealCommand(created,source),null),404,"RESOURCE_NOT_FOUND");
        assertProblem(mutate(owner,"POST","/api/v1/me/projects",createCommand(source,UUID.randomUUID(),fields("Nouveau",PRIVATE_TEXT),"DRAFT"),null),404,"RESOURCE_NOT_FOUND");
        assertThat(mutate(owner,"POST","/api/v1/me/projects",create,null).statusCode()).isEqualTo(200);
        var retained=get(owner.browser(),path);assertThat(tree(retained).path("fields").path("externalText").asText()).isEqualTo(PRIVATE_TEXT);assertThat(tree(retained).path("rubric").path("criteria").size()).isEqualTo(20);
        assertThat(tree(get(owner.browser(),path+"/self-assessments/"+text(assessed,"id")))).isEqualTo(tree(assessed));
        var context=get(owner.browser(),path+"/context?locale=fr");assertThat(tree(context).path("resource").isNull()).isTrue();assertThat(context.body()).doesNotContain(CORRECTION);
        var updated=mutate(owner,"PATCH",path,Map.of("fields",fields("Toujours personnel","Mon travail reste disponible."),"stage","DRAFT"),etag(retained));assertThat(updated.statusCode()).isEqualTo(200);
    }

    @Test void afterSubmissionCorrectionRequiresTheExactPersonalRevisionAndDoesNotCompleteOrAssessIt() throws Exception {
        var editor=account(true);var source=fixture(editor,"BR01","AFTER_SUBMISSION",16,false);var owner=account(false);
        var created=createProject(owner,source,"Préparer","Un premier travail à vérifier.");String path=projectPath(created);
        assertProblem(mutate(owner,"POST",revealPath(source),revealCommand(created,source),null),409,"SOLUTION_REVEAL_REQUIRES_ASSESSMENT");
        var assessed=mutate(owner,"POST",path+"/self-assessments",assessment(created,UUID.randomUUID(),0,false,"Je déclare mes limites."),etag(created));assertThat(assessed.statusCode()).isEqualTo(201);
        var before=tree(get(owner.browser(),path+"/status"));var reveal=mutate(owner,"POST",revealPath(source),revealCommand(created,source),null);assertThat(reveal.statusCode()).isEqualTo(200);
        assertThat(tree(get(owner.browser(),path+"/status"))).isEqualTo(before);assertThat(etag(get(owner.browser(),path))).isEqualTo(etag(created));
        var updated=mutate(owner,"PATCH",path,Map.of("fields",fields("Autre révision","Ma propre correction."),"stage","READY_FOR_SELF_ASSESSMENT"),etag(created));
        assertProblem(mutate(owner,"POST",revealPath(source),revealCommand(updated,source),null),409,"SOLUTION_REVEAL_REQUIRES_ASSESSMENT");
        assertThat(tree(get(owner.browser(),path+"/self-assessments/"+text(assessed,"id"))).path("scorePoints").asInt()).isZero();
    }

    @Test void serverPresetsArePermissionProtectedLocalizedAndContainTwentyRealOnePointCriteria() throws Exception {
        var editor=account(true);var learner=account(false);var anonymous=browser();
        assertProblem(get(anonymous,"/api/v1/admin/project-presets/BR01?locale=fr"),401,"AUTHENTICATION_REQUIRED");
        assertProblem(get(learner.browser(),"/api/v1/admin/project-presets/BR01?locale=fr"),403,"ACCESS_DENIED");
        for(String code:List.of("BR01","BR02"))for(String locale:List.of("fr","en")){
            var result=get(editor.browser(),"/api/v1/admin/project-presets/"+code+"?locale="+locale);assertThat(result.statusCode()).isEqualTo(200);assertPrivate(result);
            var value=tree(result);assertThat(value.path("caseCode").asText()).isEqualTo(code);assertThat(value.path("locale").asText()).isEqualTo(locale);
            assertThat(value.path("rubric").size()).isEqualTo(20);assertThat(value.path("policy").path("blockingIssues").size()).isEqualTo(4);
            var keys=new java.util.HashSet<String>();for(var criterion:value.path("rubric")){assertThat(criterion.path("points").asInt()).isEqualTo(1);assertThat(criterion.path("label").asText()).isNotBlank();keys.add(criterion.path("key").asText());}assertThat(keys).hasSize(20);
            if(code.equals("BR02"))assertThat(result.body().replace(" ","").replace(",","")).contains("1400","1180","1200");
        }
        assertProblem(get(editor.browser(),"/api/v1/admin/project-presets/BR03?locale=fr"),400,"VALIDATION_FAILED");
    }

    private ContentView fixture(Account editor,String code,String reveal,int threshold,boolean bilingual)throws Exception {
        var source=publish(editor,createContent(editor,code,reveal,threshold,"FREE"));
        if(bilingual){var current=editorial.get(editor.id(),source.id());publish(editor,editorial.translate(editor.id(),current.id(),tag(current),new CreateTranslation("en",unique(),"English project workshop","Explicit fictional source",document(editor,code,reveal,threshold,"FREE","en"),"Equivalent English reference")));}
        return editorial.get(editor.id(),source.id());
    }
    private ContentView createContent(Account editor,String code,String reveal,int threshold,String access)throws Exception {
        return editorial.create(editor.id(),new CreateContent(ResourceKind.ACTIVITY,"fr",unique(),"Atelier "+code,"Dossier fictif pédagogique, sans offre commerciale","Rédiger une proposition fidèle au brief","Vingt contrôles déclaratifs et quatre erreurs explicites",document(editor,code,reveal,threshold,access,"fr"),List.of(),"Isolated P09 HTTP fixture"));
    }
    private ContentDocument document(Account editor,String code,String reveal,int threshold,String access,String locale)throws Exception {
        var preset=tree(get(editor.browser(),"/api/v1/admin/project-presets/"+code+"?locale="+locale));
        var rubric=new ArrayList<RubricCriterion>();for(var criterion:preset.path("rubric"))rubric.add(new RubricCriterion(criterion.path("key").asText(),criterion.path("label").asText(),1,false));
        var original=mapper.treeToValue(preset.path("policy"),ProjectPolicy.class);var policy=new ProjectPolicy(code,threshold,reveal,original.blockingIssues());
        return new ContentDocument(locale.equals("fr")?"Préparer une proposition à partir des faits fournis.":"Prepare a proposal using only supplied facts.",locale.equals("fr")?"Une proposition prête à vérifier.":"A proposal ready for checking.",List.of(),List.of(new ContentBlock("PARAGRAPH",locale.equals("fr")?"Lire le dossier et distinguer les informations confirmées des questions ouvertes.":"Read the brief and distinguish confirmed facts from open questions.",null)),null,new Exercise(locale.equals("fr")?"Rédiger puis renseigner la grille déclarative.":"Write your proposal, then complete the declared checklist.",CORRECTION),List.of(),rubric,access,List.of(),List.of(),null,null,policy);
    }
    private ContentView publish(Account editor,ContentView input) {
        var current=editorial.get(editor.id(),input.id());if(current.state()==EditorialState.DRAFT||current.state()==EditorialState.STALE)current=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));
        UUID source=current.sourceTranslationId()==null?null:editorial.get(editor.id(),current.sourceTranslationId()).currentRevisionId();
        var ready=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.READY,"Review exact source",source));return editorial.publish(editor.id(),ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Explicit fixture publication"));
    }
    private void archive(Account editor,ContentView source){var current=editorial.get(editor.id(),source.id());editorial.archive(editor.id(),current.id(),tag(current),new ArchiveContent("Withdraw pedagogical fixture, preserve personal work"));}
    private HttpResponse<String> createProject(Account owner,ContentView source,String title,String text)throws Exception {var response=mutate(owner,"POST","/api/v1/me/projects",createCommand(source,UUID.randomUUID(),fields(title,text),"READY_FOR_SELF_ASSESSMENT"),null);assertThat(response.statusCode()).isEqualTo(201);return response;}
    private static Map<String,Object> fields(String title,String text){return Map.of("title",title,"locale","fr","objective","","scope","","method","","timeline","","budget","","clarifications","","nextStep","","externalText",text);}
    private static Map<String,Object> createCommand(ContentView source,UUID creation,Map<String,Object> fields,String stage){var command=new LinkedHashMap<String,Object>();command.put("creationId",creation);command.put("activityId",source.resourceId());command.put("activityVersionId",source.versionId());command.put("revisionId",source.currentRevisionId());command.put("sourceLocale","fr");command.put("enrollmentId",null);command.put("fields",fields);command.put("stage",stage);return command;}
    private Map<String,Object> assessment(HttpResponse<String> project,UUID submission,int satisfied,boolean blocking,String comment)throws Exception {
        var value=tree(project);var answers=new ArrayList<Map<String,Object>>();int index=0;for(var criterion:value.path("rubric").path("criteria"))answers.add(Map.of("key",criterion.path("key").asText(),"satisfied",index++<satisfied,"comment",""));
        var declarations=new ArrayList<Map<String,Object>>();for(var issue:value.path("rubric").path("blockingIssues"))declarations.add(Map.of("key",issue.path("key").asText(),"present",blocking&&issue.path("key").asText().equals("invented-claims"),"comment",blocking?"Déclaration explicite à corriger.":""));
        return Map.of("submissionId",submission,"projectRevisionId",value.path("currentRevisionId").asText(),"rubricVersionId",value.path("rubric").path("id").asText(),"answers",answers,"blockingDeclarations",declarations,"comment",comment);
    }
    private Map<String,Object> revealCommand(HttpResponse<String> project,ContentView source)throws Exception{return Map.of("projectId",text(project,"id"),"projectRevisionId",text(project,"currentRevisionId"),"activityVersionId",source.versionId(),"revisionId",source.currentRevisionId(),"locale","fr");}
    private static String templatePath(ContentView source,String locale){return "/api/v1/project-templates/"+source.resourceId()+"/versions/"+source.versionId()+"?locale="+locale;}
    private static String revealPath(ContentView source){return "/api/v1/activities/"+source.resourceId()+"/solution-reveals";}
    private String projectPath(HttpResponse<String> response)throws Exception{return "/api/v1/me/projects/"+text(response,"id");}
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
    private static String unique(){return "p09-"+UUID.randomUUID();}
    private void assertPrivate(HttpResponse<String> response){assertThat(response.headers().firstValue("Cache-Control")).hasValue("private, no-store");assertThat(response.body()).doesNotContain("\"ownerId\"","\"passwordHash\"");}
    private void assertProblem(HttpResponse<String> response,int status,String code)throws Exception{assertThat(response.statusCode()).isEqualTo(status);assertPrivate(response);var value=tree(response);assertThat(value.path("type").asText()).isEqualTo("about:blank");assertThat(value.path("code").asText()).isEqualTo(code);assertThat(value.path("status").asInt()).isEqualTo(status);assertThat(response.body()).doesNotContain(PRIVATE_TEXT,CORRECTION,"rejectedValue");assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(v->assertThat(v).startsWith("application/problem+json"));}
    private static Browser browser(){return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build());}
    private record Browser(HttpClient http){}
    private record Account(Browser browser,UUID id,String email,String password){@Override public String toString(){return "Account[redacted]";}}
}
