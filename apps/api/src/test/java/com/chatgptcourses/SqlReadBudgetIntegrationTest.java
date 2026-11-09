package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.learning.service.LearningTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.CatalogueQuery;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.catalog.service.PublicRouteService;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.shared.http.EntityTags;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

/** Real PostgreSQL and real service calls; the spy only counts the terminal JDBC query overloads. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","STRIPE_ENABLED=false","PAYMENT_INBOX_ENABLED=false","REFUND_WORKER_ENABLED=false","NOTIFICATION_OUTBOX_ENABLED=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class SqlReadBudgetIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void configuration(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);}
    @MockitoSpyBean JdbcTemplate jdbc;
    @Autowired PublicRouteService routes;
    @Autowired PublicCatalogueService catalogue;
    @Autowired EditorialService editorial;
    @Autowired LearningService learning;
    @Autowired ObjectMapper mapper;

    @Test void realPublicationPagesCatalogueAndLearningResumeHaveMeasuredQueryBudgets()throws Exception{
        String phase=System.getProperty("p17.sql.phase","after");assertThat(phase).isIn("before","after");
        UUID editor=actor("EDITOR"),owner=actor("LEARNER"),other=actor("LEARNER");
        for(int index=0;index<100;index++){
            var fr=publish(editor,create(editor,ResourceKind.GUIDE,List.of()));
            var source=editorial.get(editor,fr.id());
            publish(editor,editorial.translate(editor,source.id(),tag(source),new CreateTranslation("en",slug(),"Synthetic English guide "+index,"Measurement only",source.document(),"Explicit equivalent fixture")));
        }
        var observations=new ArrayList<Observation>();
        for(int size:List.of(1,10,100)){
            var page=measure(observations,"publications",size,()->routes.publications("fr",0,size));
            assertThat(page.items()).hasSize(size);assertThat(page.total()).isEqualTo(100);
            assertThat(page.items()).allSatisfy(p->{assertThat(p.locale()).isEqualTo("fr");assertThat(p.languages()).extracting(l->l.locale()).containsExactly("en","fr");assertThat(p.publishedAt()).isNotNull();});
            assertThat(observations.getLast().sqlQueries()).isEqualTo("before".equals(phase)?size+2:3);
            var cataloguePage=measure(observations,"catalogue",size,()->catalogue.search(new CatalogueQuery(null,ResourceKind.GUIDE,null,null,"fr",null,0,size,"TITLE")));
            assertThat(cataloguePage.items()).hasSize(size);assertThat(observations.getLast().sqlQueries()).isEqualTo(2);
        }
        var activities=new ArrayList<ContentView>();for(int i=0;i<100;i++)activities.add(publish(editor,create(editor,ResourceKind.ACTIVITY,List.of())));
        for(int size:List.of(1,10,100)){
            var module=publish(editor,create(editor,ResourceKind.MODULE,activities.subList(0,size).stream().map(ContentView::versionId).toList()));
            var course=publish(editor,create(editor,ResourceKind.COURSE,List.of(module.versionId())));
            var enrollment=learning.enroll(owner,owner,new EnrollCourse(course.resourceId(),course.versionId(),"fr")).value();
            var view=measure(observations,"enrollment",size,()->learning.enrollment(owner,enrollment.summary().id(),"fr"));
            assertThat(view.activities()).hasSize(size);assertThat(view.summary().progress().totalActivities()).isEqualTo(size);
            assertThat(view.activities()).allSatisfy(a->assertThat(a.accessStatus()).isEqualTo("ACTIVE"));
            assertThat(observations.getLast().sqlQueries()).isLessThanOrEqualTo("before".equals(phase)?size+11L:11L);
            var detail=measure(observations,"courseDetail",size,()->catalogue.version(course.resourceId(),course.versionId(),"fr"));
            assertThat(detail.curriculum().getFirst().children()).hasSize(size);assertThat(observations.getLast().sqlQueries()).isEqualTo(5);
        }
        var dashboard=measure(observations,"dashboard",3,()->learning.dashboard(owner,"fr"));
        assertThat(dashboard.enrollments()).hasSize(3);assertThat(dashboard.resume()).isNotNull();
        assertThat(observations.getLast().sqlQueries()).isLessThanOrEqualTo("before".equals(phase)?144L:31L);
        var empty=measure(observations,"secondOwnerDashboard",0,()->learning.dashboard(other,"fr"));
        assertThat(empty.enrollments()).isEmpty();assertThat(empty.resume()).isNull();
        var report=new LinkedHashMap<String,Object>();report.put("phase",phase);report.put("measuredAt",Instant.now().toString());report.put("postgresql",POSTGRES.getDockerImageName());report.put("java",System.getProperty("java.version"));report.put("os",System.getProperty("os.name"));report.put("cpus",Runtime.getRuntime().availableProcessors());report.put("queryCounting","Mockito spy on real JdbcTemplate terminal query(PreparedStatementCreator,PreparedStatementSetter,ResultSetExtractor) and query(String,ResultSetExtractor); no result stubs, overloads not counted twice");report.put("observations",observations);report.put("limits",List.of("Single local warm process and isolated PostgreSQL; elapsed times are observations, not visitor percentiles or performance guarantees.","Fixtures, authentication setup and serialization are outside SQL/elapsed count; responseBytes is measured separately after the service call.","No private body, identifier, SQL parameter, credential or query text is exported."));
        Path output=Path.of("../../.runtime/p17-sql-"+phase+".json").toAbsolutePath().normalize();Files.createDirectories(output.getParent());Files.writeString(output,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }
    private <T>T measure(List<Observation> observations,String operation,int size,Supplier<T> action)throws Exception{
        clearInvocations(jdbc);long started=System.nanoTime();T value=action.get();long elapsed=System.nanoTime()-started;
        long queries=mockingDetails(jdbc).getInvocations().stream().filter(i->{var method=i.getMethod();return method.getName().equals("query")&&(Arrays.equals(method.getParameterTypes(),new Class<?>[]{PreparedStatementCreator.class,PreparedStatementSetter.class,ResultSetExtractor.class})||Arrays.equals(method.getParameterTypes(),new Class<?>[]{String.class,ResultSetExtractor.class}));}).count();
        int bytes=mapper.writeValueAsBytes(value).length;observations.add(new Observation(operation,size,queries,elapsed/1_000_000.0,bytes));return value;
    }
    private UUID actor(String role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable-test-hash','ACTIVE')",id,id+"@fixture.invalid");jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES(?,?,'fr','UTC')",UUID.randomUUID(),id);jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code=?",UUID.randomUUID(),id,role);return id;}
    private ContentView create(UUID actor,ResourceKind kind,List<UUID> children){var d=new ContentDocument("Use supplied facts","A practical output",List.of(),List.of(new ContentBlock("PARAGRAPH","Synthetic SQL measurement fixture",null)),null,new Exercise("Use the supplied facts","Check the supplied facts"),List.of(),List.of(new RubricCriterion("facts","Use supplied facts",1,true)),"FREE",List.of(),List.of());return editorial.create(actor,new CreateContent(kind,"fr",slug(),"Synthetic SQL fixture "+kind,"Measurement only",d.objective(),d.expectedResult(),d,children,"Isolated P17 fixture"));}
    private ContentView publish(UUID actor,ContentView source){var v=editorial.get(actor,source.id());v=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.TO_REVIEW,"Request fixture review",null));var revision=v.sourceTranslationId()==null?null:editorial.get(actor,v.sourceTranslationId()).currentRevisionId();v=editorial.transition(actor,v.id(),tag(v),new TransitionContent(EditorialState.READY,"Review fixture",revision));return editorial.publish(actor,v.id(),tag(v),new PublishContent(v.currentRevisionId(),"Publish fixture"));}
    private static String slug(){return "p17-"+UUID.randomUUID();}
    private static String tag(ContentView v){return EntityTags.forRevision("content",v.id(),v.revision());}
    private record Observation(String operation,int size,long sqlQueries,double elapsedMs,int responseBytes) { }
}
