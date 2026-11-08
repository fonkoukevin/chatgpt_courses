package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.methods.service.MethodTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.methods.service.MethodService;
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

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MethodServiceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Autowired MethodService methods;
    @Autowired EditorialService editorial;
    @Autowired PublicCatalogueService catalogue;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test void ownerCrudSearchAndDuplicationOperateOnIndependentRowsAndNeverExposeAnotherOwner(){
        UUID a=actor(false),b=actor(false);var original=methods.create(a,a,new CreateMethod(fields("Personal proposal","My private notes")));
        expect(ApiError.RESOURCE_NOT_FOUND,()->methods.get(b,original.id()));
        expect(ApiError.RESOURCE_NOT_FOUND,()->methods.update(b,b,original.id(),null,new UpdateMethod(fields("Forged","Other owner"))));
        expect(ApiError.RESOURCE_NOT_FOUND,()->methods.duplicate(b,b,original.id(),tag(original)));
        expect(ApiError.RESOURCE_NOT_FOUND,()->methods.delete(b,b,original.id(),tag(original)));
        var edited=methods.update(a,a,original.id(),tag(original),new UpdateMethod(fields("My checked proposal","Unpriced logo remains a question")));
        assertThat(edited.locale()).isEqualTo("fr");assertThat(edited.generatedFrom()).isEqualTo(parameters());
        assertThat(methods.list(a,new MethodQuery("logo","Client proposals",0,1)).items()).extracting(MethodSummary::id).containsExactly(original.id());
        assertThat(methods.list(b,new MethodQuery(null,null,0,20)).items()).isEmpty();
        var copy=methods.duplicate(a,a,edited.id(),tag(edited));assertThat(copy.id()).isNotEqualTo(edited.id());assertThat(copy.text()).isEqualTo(edited.text());
        methods.delete(a,a,edited.id(),tag(edited));expect(ApiError.RESOURCE_NOT_FOUND,()->methods.get(a,edited.id()));
        assertThat(methods.get(a,copy.id()).notes()).isEqualTo(edited.notes());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM personal_methods WHERE id=?",Integer.class,edited.id())).isZero();
    }

    @Test void staleAccountContextCannotCreateImportUpdateDuplicateOrDeleteUnderTheNewAccount(){
        UUID a=actor(false),b=actor(false);var existing=methods.create(b,b,new CreateMethod(fields("B method","Only B")));
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->methods.create(b,null,new CreateMethod(fields("No context","Not stored"))));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->methods.create(b,a,new CreateMethod(fields("Old A form","Not stored under B"))));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->methods.fromTemplate(b,a,new FromTemplate(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"fr",fields("Old A import","Not stored"))));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->methods.update(b,a,existing.id(),tag(existing),new UpdateMethod(fields("Old A update","Not stored"))));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->methods.duplicate(b,a,existing.id(),tag(existing)));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->methods.delete(b,a,existing.id(),tag(existing)));
        assertThat(methods.list(b,new MethodQuery(null,null,0,20)).total()).isEqualTo(1);
        assertThat(methods.get(b,existing.id()).title()).isEqualTo("B method");
    }

    @Test void optimisticPreconditionsSerializeConcurrentEditsWithoutDiscardingTheWinner()throws Exception{
        UUID actor=actor(false);var method=methods.create(actor,actor,new CreateMethod(fields("Concurrent method","Original notes")));
        expect(ApiError.PRECONDITION_REQUIRED,()->methods.update(actor,actor,method.id(),null,new UpdateMethod(fields("Missing precondition","Not stored"))));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->{start.await();return attempt(()->methods.update(actor,actor,method.id(),tag(method),new UpdateMethod(fields("Revision A","Notes A"))));});
            var b=pool.submit(()->{start.await();return attempt(()->methods.update(actor,actor,method.id(),tag(method),new UpdateMethod(fields("Revision B","Notes B"))));});
            start.countDown();assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        var current=methods.get(actor,method.id());assertThat(current.revision()).isEqualTo(method.revision()+1);assertThat(current.title()).isIn("Revision A","Revision B");
        expect(ApiError.REVISION_CONFLICT,()->methods.delete(actor,actor,method.id(),tag(method)));
    }

    @Test void copiedTextAndSourceSnapshotSurviveRevisionWithdrawalAndDuplicateWithoutSourceRights(){
        UUID actor=actor(true);var source=publish(actor,createSource(actor,"FREE",definition("Use only supplied facts")));
        var own=methods.fromTemplate(actor,actor,new FromTemplate(source.resourceId(),source.versionId(),source.publishedRevisionId(),"fr",fields("Independent copy","My personal note")));
        assertThat(own.origin().revisionId()).isEqualTo(source.publishedRevisionId());assertThat(methods.sourceUpdate(actor,own.id()).status()).isEqualTo("CURRENT");
        var originalDocument=source.document();var changedDocument=new ContentDocument(originalDocument.objective(),originalDocument.expectedResult(),originalDocument.prerequisites(),originalDocument.blocks(),null,originalDocument.exercise(),originalDocument.quiz(),originalDocument.rubric(),"FREE",List.of(),List.of(),definition("A clarified starter instruction"));
        var edited=editorial.revise(actor,source.id(),contentTag(source),new SaveRevision("Corrected source",source.summary(),changedDocument,"Clarify editorial instruction"));
        assertThat(methods.sourceUpdate(actor,own.id()).status()).isEqualTo("CURRENT");
        var republished=publish(actor,edited);assertThat(methods.sourceUpdate(actor,own.id()).status()).isEqualTo("UPDATE_AVAILABLE");
        assertThat(methods.sourceUpdate(actor,own.id()).candidate().revisionId()).isEqualTo(republished.publishedRevisionId());
        assertThat(methods.get(actor,own.id())).isEqualTo(own);
        editorial.archive(actor,republished.id(),contentTag(republished),new ArchiveContent("Withdraw source without touching personal work"));
        assertThat(methods.sourceUpdate(actor,own.id()).status()).isEqualTo("UNAVAILABLE");
        var duplicate=methods.duplicate(actor,actor,own.id(),tag(own));assertThat(duplicate.text()).isEqualTo(own.text());assertThat(duplicate.notes()).isEqualTo(own.notes());assertThat(duplicate.origin()).isEqualTo(own.origin());
        assertThat(catchThrowable(()->jdbc.update("UPDATE personal_methods SET owner_id=? WHERE id=?",actor(false),own.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(catchThrowable(()->jdbc.update("INSERT INTO personal_methods(id,owner_id,title,locale,body,parameters,generated_from,notes,category,source_resource_id,source_version_id,source_translation_id,source_revision_id,source_locale,source_title,source_slug) SELECT ?,owner_id,title,locale,body,parameters,generated_from,notes,category,source_resource_id,source_version_id,source_translation_id,source_revision_id,'en',source_title,source_slug FROM personal_methods WHERE id=?",UUID.randomUUID(),own.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        var second=publish(actor,createSource(actor,"FREE",definition("Another source instruction")));
        var en=publish(actor,editorial.translate(actor,second.id(),contentTag(second),new CreateTranslation("en","method-en-"+UUID.randomUUID(),"English source","English summary",document("FREE",definition("English source instruction")),"Explicit translation")));
        var englishFields=new MethodFields("English personal copy","en","My English personal text",parameters(),parameters(),"My English notes",null);
        var english=methods.fromTemplate(actor,actor,new FromTemplate(en.resourceId(),en.versionId(),en.publishedRevisionId(),"en",englishFields));
        var currentFrench=editorial.get(actor,second.id());
        publish(actor,editorial.newVersion(actor,currentFrench.id(),contentTag(currentFrench),new NewVersion("Different source objective","Different source assessment","French version two","French summary",currentFrench.document(),List.of(),"New version has no English translation")));
        assertThat(methods.sourceUpdate(actor,english.id()).status()).isEqualTo("UNAVAILABLE");
        assertThat(methods.get(actor,english.id())).isEqualTo(english);
        assertThat(methods.template(en.resourceId(),en.versionId(),"en").availability()).isEqualTo("PUBLISHED");
    }

    @Test void missingDefinitionBlocksPublicationAndProtectedSourceIsNeverCopiedEvenByAnEditor(){
        UUID actor=actor(true);var incomplete=createSource(actor,"FREE",null);
        assertThat(editorial.readiness(actor,incomplete.id()).blockingIssues()).extracting(Issue::code).contains("METHOD_DEFINITION_REQUIRED");
        var review=editorial.transition(actor,incomplete.id(),contentTag(incomplete),new TransitionContent(EditorialState.TO_REVIEW,"Review missing method definition",null));
        expect(ApiError.CONTENT_NOT_READY,()->editorial.transition(actor,review.id(),contentTag(review),new TransitionContent(EditorialState.READY,"Not complete",null)));
        var protectedSource=publish(actor,createSource(actor,"PROTECTED",definition("PRIVATE_STARTER_INSTRUCTION")));
        var projection=methods.template(protectedSource.resourceId(),protectedSource.versionId(),"fr");assertThat(projection.availability()).isEqualTo("PROTECTED");assertThat(projection.definition()).isNull();
        assertThat(catalogue.detail(protectedSource.resourceId(),"fr").document()).isNull();
        assertThat(catchThrowable(()->methods.fromTemplate(actor,actor,new FromTemplate(protectedSource.resourceId(),protectedSource.versionId(),protectedSource.publishedRevisionId(),"fr",fields("Forbidden copy","No paid rights"))))).isInstanceOf(AccessDeniedException.class);
        var free=publish(actor,createSource(actor,"FREE",definition("Public instruction")));
        expect(ApiError.REVISION_CONFLICT,()->methods.fromTemplate(actor,actor,new FromTemplate(free.resourceId(),free.versionId(),UUID.randomUUID(),"fr",fields("Forged revision","Not saved"))));
        var tooLarge=new MethodParameters("x".repeat(4000),"x".repeat(4000),"x".repeat(4000),"x".repeat(4000),"x".repeat(4000),"x".repeat(4000),"x".repeat(4000));
        expect(ApiError.VALIDATION_FAILED,()->methods.create(actor,actor,new CreateMethod(new MethodFields("Too large","fr","Text",tooLarge,tooLarge,"",null))));
        assertThat(methods.list(actor,new MethodQuery(null,null,0,20)).items()).isEmpty();
    }

    @Test void upgradeV005PreservesPublishedLegacyTemplateAndSessionsWithoutInventingADefinition()throws Exception{
        String schema="p07_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("CREATE SCHEMA "+schema);
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("005").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())){
            connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
            UUID resource=UUID.randomUUID(),version=UUID.randomUUID(),translation=UUID.randomUUID(),revision=UUID.randomUUID();
            isolated.update("INSERT INTO learning_resources(id,kind) VALUES(?,'METHOD_TEMPLATE')",resource);
            isolated.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition,frozen_at) VALUES(?,?,1,'Existing objective','Existing criteria',CURRENT_TIMESTAMP)",version,resource);
            isolated.update("INSERT INTO resource_slugs(id,resource_id,resource_kind,locale,slug) VALUES(?,?,'METHOD_TEMPLATE','fr',?)",UUID.randomUUID(),resource,"existing-"+UUID.randomUUID());
            isolated.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state) VALUES(?,?,'fr','DRAFT')",translation,version);
            String legacy=mapper.writeValueAsString(document("FREE",null)).replace(",\"methodDefinition\":null","");
            isolated.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,document_json,reason) VALUES(?,?,1,'Existing template article','Existing summary','Existing text',?::jsonb,'P06 historical publication')",revision,translation,legacy);
            isolated.update("UPDATE content_translations SET current_revision_id=?,published_revision_id=?,editorial_state='PUBLISHED' WHERE id=?",revision,revision,translation);
            String session=UUID.randomUUID().toString();isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            var catalogue=new PublicCatalogueService(isolated,mapper);var service=new MethodService(isolated,mapper,catalogue);
            assertThat(service.template(resource,version,"fr").availability()).isEqualTo("MISSING_DEFINITION");
            assertThat(catalogue.detail(resource,"fr").document().blocks().getFirst().text()).isEqualTo("Existing method explanation");
            assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);
            assertThat(isolated.queryForObject("SELECT body FROM editorial_revisions WHERE id=?",String.class,revision)).isEqualTo("Existing text");
            assertThat(isolated.queryForObject("SELECT count(*) FROM personal_methods",Integer.class)).isZero();
            assertThat(isolated.queryForObject("SELECT count(*) FROM user_accounts",Integer.class)).isZero();
        }
    }

    private UUID actor(boolean editor){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='LEARNER' OR (? AND code='EDITOR')",id,editor);return id;}
    private ContentView createSource(UUID actor,String access,MethodDefinition definition){return editorial.create(actor,new CreateContent(ResourceKind.METHOD_TEMPLATE,"fr","method-"+UUID.randomUUID(),"Source method","Editorial source summary","Observe stated facts","Check declared criteria",document(access,definition),List.of(),"P07 method fixture"));}
    private static ContentDocument document(String access,MethodDefinition definition){return new ContentDocument("Observe stated facts","A scoped proposal",List.of(),List.of(new ContentBlock("PARAGRAPH","Existing method explanation",null)),null,null,List.of(),List.of(),access,List.of(),List.of(),definition);}
    private static MethodDefinition definition(String instruction){return new MethodDefinition(List.of("Prepare a client proposal"),List.of("Client brief"),List.of("Separate facts and unknowns"),instruction,"BR01 requests four French pages. Logo and integration need clarification.",List.of("Do not invent a price"),List.of("No AI execution is performed"),parameters());}
    private static MethodParameters parameters(){return new MethodParameters("Prepare a proposal","Client R","BR01 and TR01","Client R","Two pages","Use only supplied facts","Logo and integration");}
    private static MethodFields fields(String title,String notes){return new MethodFields(title,"fr","My edited independent prompt",parameters(),parameters(),notes,"Client proposals");}
    private ContentView publish(UUID actor,ContentView input){var v=editorial.get(actor,input.id());if(v.state()==EditorialState.DRAFT||v.state()==EditorialState.STALE)v=editorial.transition(actor,v.id(),contentTag(v),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));UUID source=v.sourceTranslationId()==null?null:editorial.get(actor,v.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(actor,v.id(),contentTag(v),new TransitionContent(EditorialState.READY,"Review exact revision",source));return editorial.publish(actor,ready.id(),contentTag(ready),new PublishContent(ready.currentRevisionId(),"Publish checked method"));}
    private static String tag(MethodView method){return EntityTags.forRevision("personal-method",method.id(),method.revision());}
    private static String contentTag(ContentView view){return EntityTags.forRevision("content",view.id(),view.revision());}
    private static void expect(ApiError error,Runnable work){var failed=catchThrowable(work::run);assertThat(failed).isInstanceOf(ApiException.class);assertThat(((ApiException)failed).error()).isEqualTo(error);}
    private static String attempt(Runnable work){try{work.run();return "OK";}catch(ApiException error){return error.error().name();}}
}
