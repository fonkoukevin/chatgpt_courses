package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.catalog.service.CatalogTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.context.ActiveProfiles;
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
class PublicCatalogueIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);
        r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
    }
    @Autowired EditorialService editorial;
    @Autowired PublicCatalogueService catalogue;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test void combinedSearchUsesPublishedSnapshotsWithStablePagingAndActuallyCoveredFacets() {
        UUID actor=actor();String marker="Search-"+UUID.randomUUID();
        var a=withMetadata(actor,create(actor,ResourceKind.ACTIVITY,"fr","FREE",marker+" same",List.of()),metadata("understand-brief","BEGINNER","Audience A"));
        a=publish(actor,a);var b=publish(actor,withMetadata(actor,create(actor,ResourceKind.ACTIVITY,"fr","FREE",marker+" same",List.of()),metadata("understand-brief","BEGINNER","Audience B")));
        publish(actor,withMetadata(actor,create(actor,ResourceKind.GUIDE,"fr","PROTECTED",marker+" premium",List.of()),metadata("check-output","ADVANCED","Audience C")));
        create(actor,ResourceKind.ACTIVITY,"fr","FREE",marker+" private draft",List.of());
        var first=catalogue.search(query(marker,ResourceKind.ACTIVITY,"understand-brief","BEGINNER","fr","FREE",0,1));
        var second=catalogue.search(query(marker,ResourceKind.ACTIVITY,"understand-brief","BEGINNER","fr","FREE",1,1));
        assertThat(first.total()).isEqualTo(2);assertThat(first.items()).hasSize(1);assertThat(second.items()).hasSize(1);
        var expected=java.util.stream.Stream.of(a.resourceId(),b.resourceId()).sorted().toList();
        // PostgreSQL UUID ordering is unsigned bytes, compare its stable string representation here.
        assertThat(List.of(first.items().getFirst().resourceId().toString(),second.items().getFirst().resourceId().toString())).isSorted();
        assertThat(first.items().getFirst().resourceId()).isIn(expected);
        // A differing review date must not masquerade as a new publication in RECENT ordering.
        jdbc.update("UPDATE content_translations SET published_verified_at=created_at+interval '1 day' WHERE id=?",a.id());
        var recent=catalogue.search(new CatalogueQuery(marker,ResourceKind.ACTIVITY,"understand-brief","BEGINNER","fr","FREE",0,20,"RECENT"));
        assertThat(recent.items().getFirst().resourceId()).isEqualTo(b.resourceId());
        assertThat(catalogue.search(query(marker,null,null,null,"en",null,0,20)).total()).isZero();
        assertThat(catalogue.search(query("%",null,null,null,"fr",null,0,20)).total()).isZero();
        var facets=catalogue.facets("fr");
        assertThat(facets.goals()).extracting(FacetOption::code).contains("understand-brief","check-output").doesNotContain("reuse-method");
        assertThat(facets.types()).extracting(FacetOption::code).doesNotContain("MODULE");
        assertThat(facets.goals().stream().filter(x->x.code().equals("understand-brief")).findFirst().orElseThrow().count()).isGreaterThanOrEqualTo(2);
    }

    @Test void metadataIsRevisionOwnedRetainedByCorrectionsAndConcurrentEditsNeverOverwritePublication() throws Exception {
        UUID actor=actor();var original=publish(actor,withMetadata(actor,create(actor,ResourceKind.GUIDE,"fr","FREE","Snapshot "+UUID.randomUUID(),List.of()),metadata("understand-brief","BEGINNER","Original audience")));
        Instant publishedReview=catalogue.detail(original.resourceId(),"fr").reviewedAt();
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return attempt(()->withMetadata(actor,original,metadata("check-output","ADVANCED","New audience A")));});
            var b=pool.submit(()->{start.await();return attempt(()->withMetadata(actor,original,metadata("define-scope","INTERMEDIATE","New audience B")));});
            start.countDown();assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","REVISION_CONFLICT");
        }
        var current=editorial.get(actor,original.id());
        var corrected=editorial.revise(actor,current.id(),tag(current),new SaveRevision(current.title()+" corrected",current.summary(),current.document(),"Correct wording while preserving metadata"));
        assertThat(corrected.metadata()).isEqualTo(current.metadata());
        assertThat(catalogue.detail(original.resourceId(),"fr").metadata().audience()).containsExactly("Original audience");
        var reviewing=editorial.transition(actor,corrected.id(),tag(corrected),new TransitionContent(EditorialState.TO_REVIEW,"Request new review",null));
        var ready=editorial.transition(actor,reviewing.id(),tag(reviewing),new TransitionContent(EditorialState.READY,"Review unpublished revision",null));
        assertThat(catalogue.detail(original.resourceId(),"fr").reviewedAt()).isEqualTo(publishedReview);
        assertThat(catalogue.detail(original.resourceId(),"fr").revisionId()).isEqualTo(original.publishedRevisionId());
        var published=editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish exact reviewed snapshot"));
        assertThat(catalogue.detail(original.resourceId(),"fr").metadata()).isEqualTo(published.metadata());
        var duplicate=editorial.duplicate(actor,published.id(),tag(published),new DuplicateContent("copy-"+UUID.randomUUID(),"Duplicate","Explicit duplicate"));
        assertThat(duplicate.metadata()).isEqualTo(published.metadata());
        var v2=editorial.newVersion(actor,published.id(),tag(published),new NewVersion("New objective","New assessment",published.title(),published.summary(),published.document(),List.of(),"New pedagogy"));
        assertThat(v2.metadata()).isEqualTo(published.metadata());
        assertThat(catchThrowable(()->jdbc.update("UPDATE editorial_public_metadata SET metadata_json='{}'::jsonb WHERE revision_id=?",original.currentRevisionId()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        expect(ApiError.VALIDATION_FAILED,()->withMetadata(actor,editorial.get(actor,published.id()),new PublicMetadata(List.of("unknown-task"),null,List.of(),List.of(),List.of(),List.of(),null)));
    }

    @Test void curriculumAndActivityReadStayPinnedWhenTheGlobalChildPublishesANewVersionOrIsWithdrawn() {
        UUID actor=actor();var activity=publish(actor,create(actor,ResourceKind.ACTIVITY,"fr","FREE","Pinned activity v1",List.of()));
        var module=publish(actor,create(actor,ResourceKind.MODULE,"fr","FREE","Pinned module v1",List.of(activity.versionId())));
        var course=publish(actor,create(actor,ResourceKind.COURSE,"fr","PROTECTED","Pinned course",List.of(module.versionId())));
        var activity2=publish(actor,editorial.newVersion(actor,activity.id(),tag(activity),new NewVersion("Different objective","Different assessment","Activity v2","New public summary",document("FREE"),List.of(),"New activity pedagogy")));
        assertThat(catalogue.detail(activity.resourceId(),"fr").versionId()).isEqualTo(activity2.versionId());
        var courseDetail=catalogue.detail(course.resourceId(),"fr");var node=courseDetail.curriculum().getFirst().children().getFirst();
        assertThat(node.versionId()).isEqualTo(activity.versionId());assertThat(node.title()).isEqualTo("Pinned activity v1");
        assertThat(catalogue.version(activity.resourceId(),node.versionId(),"fr").versionId()).isEqualTo(activity.versionId());
        editorial.archive(actor,activity.id(),tag(editorial.get(actor,activity.id())),new ArchiveContent("Withdraw pinned old activity"));
        var withdrawn=catalogue.detail(course.resourceId(),"fr").curriculum().getFirst().children().getFirst();
        assertThat(withdrawn.availability()).isEqualTo("WITHDRAWN");assertThat(withdrawn.versionId()).isEqualTo(activity.versionId());assertThat(withdrawn.title()).isNull();
        assertThat(catalogue.detail(activity.resourceId(),"fr").versionId()).isEqualTo(activity2.versionId());
    }

    @Test void reviewAloneNeverRepublishesAStaleTranslationAndNewVersionsHaveExplicitLanguageAvailability() {
        UUID actor=actor();var fr=publish(actor,create(actor,ResourceKind.GUIDE,"fr","FREE","Source "+UUID.randomUUID(),List.of()));
        var en=editorial.translate(actor,fr.id(),tag(fr),new CreateTranslation("en","translated-"+UUID.randomUUID(),"Translated guide","Translated summary",document("FREE"),"Explicit translation"));
        assertThat(en.metadata().goalCodes()).isEmpty();en=publish(actor,en);
        var source=editorial.get(actor,fr.id());var changed=editorial.revise(actor,source.id(),tag(source),new SaveRevision("Updated source",source.summary(),source.document(),"Correct source text"));
        assertThat(catalogue.detail(fr.resourceId(),"en").availability()).isEqualTo("STALE");
        var stale=editorial.get(actor,en.id());var review=editorial.transition(actor,stale.id(),tag(stale),new TransitionContent(EditorialState.TO_REVIEW,"Review changed source",null));
        var ready=editorial.transition(actor,review.id(),tag(review),new TransitionContent(EditorialState.READY,"Examine exact source",changed.currentRevisionId()));
        assertThat(catalogue.detail(fr.resourceId(),"en").availability()).isEqualTo("STALE");
        assertThat(catalogue.detail(fr.resourceId(),"en").document()).isNull();assertThat(editorial.publicContent(fr.resourceId(),"en").document()).isNull();
        editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish checked translation"));
        assertThat(catalogue.detail(fr.resourceId(),"en").availability()).isEqualTo("PUBLISHED");
        var newSource=editorial.get(actor,fr.id());var fr2=publish(actor,editorial.newVersion(actor,newSource.id(),tag(newSource),new NewVersion("New objective","New assessment","New source version","Summary",document("FREE"),List.of(),"Evolve pedagogy")));
        var missing=catalogue.detail(fr.resourceId(),"en");assertThat(missing.availability()).isEqualTo("MISSING_TRANSLATION");assertThat(missing.title()).isNull();assertThat(missing.document()).isNull();
        assertThat(missing.languages()).anySatisfy(x->{assertThat(x.locale()).isEqualTo("fr");assertThat(x.status()).isEqualTo("PUBLISHED");});
        assertThat(catalogue.bySlug(ResourceKind.GUIDE,en.slug(),"en").availability()).isEqualTo("MISSING_TRANSLATION");
        editorial.archive(actor,fr2.id(),tag(fr2),new ArchiveContent("Withdraw latest source version"));
        assertThat(catalogue.detail(fr.resourceId(),"fr").availability()).isEqualTo("WITHDRAWN");
        assertThat(catalogue.search(query("New source version",null,null,null,"fr",null,0,20)).items()).isEmpty();
    }

    @Test void publicProjectionExposesOnlyExplicitDescriptionAndNoPremiumOrQuizSolution() {
        UUID actor=actor();var protectedContent=publish(actor,create(actor,ResourceKind.ACTIVITY,"fr","PROTECTED","Protected description",List.of()));
        var detail=catalogue.detail(protectedContent.resourceId(),"fr");String json=mapper.writeValueAsString(detail);
        assertThat(detail.document()).isNull();assertThat(detail.objective()).isEqualTo("Distinguish stated facts");
        assertThat(json).doesNotContain("PRIVATE_BODY_MARKER","PRIVATE_SOLUTION_MARKER","PRIVATE_ASSESSMENT_MARKER","\"correctOption\":","\"correction\":","\"explanation\":");
        var free=publish(actor,create(actor,ResourceKind.ACTIVITY,"fr","FREE","Free description",List.of()));
        String freeJson=mapper.writeValueAsString(catalogue.detail(free.resourceId(),"fr"));
        assertThat(freeJson).contains("PRIVATE_BODY_MARKER").doesNotContain("PRIVATE_SOLUTION_MARKER","\"correctOption\":","\"correction\":","\"explanation\":");
        var draft=create(actor,ResourceKind.GUIDE,"fr","FREE","Unpublished private title",List.of());
        expect(ApiError.RESOURCE_NOT_FOUND,()->catalogue.detail(draft.resourceId(),"fr"));
        expect(ApiError.RESOURCE_NOT_FOUND,()->catalogue.bySlug(ResourceKind.ACTIVITY,free.slug(),"en"));
        expect(ApiError.VALIDATION_FAILED,()->catalogue.search(query(null,ResourceKind.MODULE,null,null,"fr",null,0,20)));
    }

    @Test void upgradeV004PreservesPublishedRevisionLegacyBodyAndSessionWithoutInventingMetadata() throws Exception {
        String schema="p06_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("CREATE SCHEMA "+schema);
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("004").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            connection.setSchema(schema);var isolated=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
            isolated.execute(new String(getClass().getResourceAsStream("/devdata/p03-demo.sql").readAllBytes(),StandardCharsets.UTF_8));
            UUID resource=UUID.randomUUID(),version=UUID.randomUUID(),translation=UUID.randomUUID(),revision=UUID.randomUUID(),actor=UUID.randomUUID();
            isolated.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",actor,actor+"@example.test");
            isolated.update("INSERT INTO learning_resources(id,kind) VALUES(?,'GUIDE')",resource);
            isolated.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition,frozen_at) VALUES(?,?,1,'Objective','Assessment',CURRENT_TIMESTAMP)",version,resource);
            isolated.update("INSERT INTO resource_slugs(id,resource_id,resource_kind,locale,slug) VALUES(?,?,'GUIDE','fr',?)",UUID.randomUUID(),resource,"preserved-"+UUID.randomUUID());
            isolated.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state) VALUES(?,?,'fr','DRAFT')",translation,version);
            isolated.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,author_id,document_json,reason) VALUES(?,?,1,'Published before V005','Summary','Legacy text preserved',?,?::jsonb,'Review fixture')",revision,translation,actor,mapper.writeValueAsString(document("FREE")));
            isolated.update("UPDATE content_translations SET current_revision_id=?,published_revision_id=?,reviewed_revision_id=?,verified_at=greatest(created_at,CURRENT_TIMESTAMP),editorial_state='PUBLISHED' WHERE id=?",revision,revision,revision,translation);
            String session=UUID.randomUUID().toString();isolated.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(isolated.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);
            assertThat(isolated.queryForObject("SELECT count(*) FROM editorial_revisions",Integer.class)).isEqualTo(7);
            assertThat(isolated.queryForObject("SELECT body FROM editorial_revisions WHERE id=?",String.class,revision)).isEqualTo("Legacy text preserved");
            assertThat(isolated.queryForObject("SELECT published_verified_at=verified_at FROM content_translations WHERE id=?",Boolean.class,translation)).isTrue();
            var upgraded=new PublicCatalogueService(isolated,mapper).detail(resource,"fr");assertThat(upgraded.metadata().goalCodes()).isEmpty();assertThat(upgraded.metadata().level()).isNull();assertThat(upgraded.reviewedAt()).isNotNull();
            assertThat(isolated.queryForObject("SELECT count(*) FROM user_accounts",Integer.class)).isEqualTo(1);
        }
    }

    private UUID actor(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),id);return id;}
    private ContentView create(UUID actor,ResourceKind kind,String locale,String access,String title,List<UUID> children){return editorial.create(actor,new CreateContent(kind,locale,"catalog-"+UUID.randomUUID(),title,"Published summary","Observable objective","PRIVATE_ASSESSMENT_MARKER",document(access),children,"Explicit catalogue test fixture"));}
    private static ContentDocument document(String access){return new ContentDocument("Distinguish stated facts","A factual proposal",List.of("Read the client brief"),List.of(new ContentBlock("PARAGRAPH","PRIVATE_BODY_MARKER",null)),null,new Exercise("Write a factual proposal","PRIVATE_SOLUTION_MARKER"),List.of(new QuizQuestion("q1","Was a price supplied?",List.of("Yes","No"),1,"PRIVATE_SOLUTION_MARKER",1)),List.of(new RubricCriterion("facts","No invented claims",1,true)),access,List.of(),List.of());}
    private static PublicMetadata metadata(String goal,String level,String audience){return new PublicMetadata(List.of(goal),level,List.of(audience),List.of(new Tool("ChatGPT",null)),List.of(new Source("Editorial source","https://example.invalid/reference")),List.of(new Faq("What is produced?","A factual proposal.")),"Declared self-assessment with the supplied checklist.");}
    private ContentView withMetadata(UUID actor,ContentView view,PublicMetadata metadata){return editorial.metadata(actor,view.id(),tag(view),new SaveMetadata(metadata,"Describe public catalogue fields"));}
    private ContentView publish(UUID actor,ContentView input){var v=editorial.get(actor,input.id());if(v.state()==EditorialState.DRAFT||v.state()==EditorialState.STALE)v=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));UUID source=v.sourceTranslationId()==null?null:editorial.get(actor,v.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.READY,"Review exact revision",source));return editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish reviewed revision"));}
    private static CatalogueQuery query(String q,ResourceKind type,String goal,String level,String locale,String access,int page,int size){return new CatalogueQuery(q,type,goal,level,locale,access,page,size,"TITLE");}
    private static String tag(ContentView view){return EntityTags.forRevision("content",view.id(),view.revision());}
    private static void expect(ApiError error,Runnable work){var failure=catchThrowable(work::run);assertThat(failure).isInstanceOf(ApiException.class);assertThat(((ApiException)failure).error()).isEqualTo(error);}
    private static String attempt(Runnable work){try{work.run();return "OK";}catch(ApiException error){return error.error().name();}}
}
