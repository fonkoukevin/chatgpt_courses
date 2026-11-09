package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import com.chatgptcourses.editorial.service.EditorialImportService;
import com.chatgptcourses.editorial.service.EditorialImportService.*;
import com.chatgptcourses.assets.config.AssetStorageProperties;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.ArrayList;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.catchThrowable;
import static com.chatgptcourses.assets.service.AssetTypes.*;
import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.service.AssetStagingCleanup;
import com.chatgptcourses.assets.storage.ObjectStorage;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.learning.service.LearningTypes.EnrollCourse;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.projects.service.ProjectTypes;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS) @ExtendWith(OutputCaptureExtension.class)
class ContentImportIntegrationTest {
    private static final String ACCESS=UUID.randomUUID().toString().replace("-","");
    private static final String SECRET=UUID.randomUUID().toString()+UUID.randomUUID();
    private static final String AUTH="{\"identities\":[{\"name\":\"test-app\",\"credentials\":[{\"accessKey\":\""+ACCESS+"\",\"secretKey\":\""+SECRET+"\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Tagging\",\"Write\"]}]}";
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @Container static final GenericContainer<?> S3=new GenericContainer<>(DockerImageName.parse("chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59"))
        .withExposedPorts(8333).withTmpFs(Map.of("/data","rw")).withCopyToContainer(Transferable.of(AUTH.getBytes(StandardCharsets.UTF_8),0444),"/run/secrets/s3.local.json")
        .withCommand("server","-dir=/data","-ip=127.0.0.1","-ip.bind=0.0.0.0","-master.volumeSizeLimitMB=64","-master.telemetry=false","-volume.max=24","-filer","-s3","-s3.port=8333","-s3.port.iceberg=0","-s3.port.lance=0","-s3.config=/run/secrets/s3.local.json")
        .waitingFor(Wait.forHttp("/healthz").forPort(8333).forStatusCode(200).withStartupTimeout(Duration.ofSeconds(90)));
    @DynamicPropertySource static void configuration(DynamicPropertyRegistry r){
        r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);
        r.add("courses.assets.enabled",()->true);r.add("courses.assets.internal-endpoint",ContentImportIntegrationTest::internalEndpoint);r.add("courses.assets.external-endpoint",ContentImportIntegrationTest::externalEndpoint);
        r.add("courses.assets.access-key",()->ACCESS);r.add("courses.assets.secret-key",()->SECRET);r.add("courses.assets.editorial-bucket",()->"editorial-test");r.add("courses.assets.private-bucket",()->"private-test");
        r.add("courses.assets.region",()->"us-east-1");r.add("courses.assets.path-style",()->true);
        r.add("courses.assets.max-file-bytes",()->4096);r.add("courses.assets.max-image-bytes",()->65536);r.add("courses.assets.max-files-per-project",()->2);r.add("courses.assets.max-bytes-per-project",()->6000);
        r.add("courses.assets.upload-ttl-seconds",()->3);r.add("courses.assets.download-ttl-seconds",()->2);
        r.add("courses.assets.staging-cleanup-grace-seconds",()->0);
        r.add("courses.assets.staging-cleanup-worker-enabled",()->false);
    }
    @BeforeAll static void buckets(){try(var client=s3Client()){for(String bucket:List.of("editorial-test","private-test")){client.createBucket(b->b.bucket(bucket));client.putBucketCors(b->b.bucket(bucket).corsConfiguration(c->c.corsRules(rule->rule.allowedOrigins("http://127.0.0.1:3000").allowedMethods("GET","PUT","HEAD").allowedHeaders("Content-Type").exposeHeaders("ETag").maxAgeSeconds(0))));}}}
    @Autowired AssetService assets;@Autowired AssetStagingCleanup cleanup;@Autowired ObjectStorage storage;@Autowired EditorialService editorial;@Autowired ProjectService projects;@Autowired LearningService learning;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;


    @Autowired PlatformTransactionManager transactionManager;
    @Autowired AssetStorageProperties storageProperties;
    @TempDir Path directory;

    @Test void planAndReplayKeepStableBilingualIdentitiesAndOnlyCreateDrafts()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(true);long before=jdbc.queryForObject("SELECT count(*) FROM learning_resources",Long.class);
        var plan=importer(storage).run(manifest,editor,false);assertThat(plan.items()).hasSize(2);assertThat(jdbc.queryForObject("SELECT count(*) FROM learning_resources",Long.class)).isEqualTo(before);
        var first=importer(storage).run(manifest,editor,true);assertThat(first.files()).hasSize(4);assertThat(first.files().stream().allMatch(f->f.state().equals("READY"))).isTrue();
        var fr=first.items().stream().filter(i->i.locale().equals("fr")).findFirst().orElseThrow();var en=first.items().stream().filter(i->i.locale().equals("en")).findFirst().orElseThrow();assertThat(fr.resourceId()).isEqualTo(en.resourceId());assertThat(fr.versionId()).isEqualTo(en.versionId());
        var english=editorial.get(editor,en.translationId());assertThat(english.sourceTranslationId()).isEqualTo(fr.translationId());
        var second=importer(storage).run(manifest,editor,true);assertThat(second.items().stream().allMatch(i->i.state().equals("UNCHANGED"))).isTrue();assertThat(second.items().stream().map(ItemResult::revisionId).toList()).isEqualTo(first.items().stream().map(ItemResult::revisionId).toList());assertThat(second.files()).isEqualTo(first.files());
        for(var item:second.items()){var content=editorial.get(editor,item.translationId());assertThat(content.state()).isEqualTo(EditorialState.DRAFT);assertThat(content.publishedRevisionId()).isNull();assertThat(content.verifiedAt()).isNull();assertThat(content.frozenAt()).isNull();}
        assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_events WHERE translation_id IN(?,?) AND event_type IN('READY','PUBLISH')",Integer.class,fr.translationId(),en.translationId())).isZero();
    }
    @Test void concurrentImportSerializesBindingsWithoutDuplicatingContentOrFiles()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(false);var start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->{start.await();return importer(storage).run(manifest,editor,true);});var b=pool.submit(()->{start.await();return importer(storage).run(manifest,editor,true);});start.countDown();var first=a.get(30,TimeUnit.SECONDS);var second=b.get(30,TimeUnit.SECONDS);assertThat(first.items().getFirst().translationId()).isEqualTo(second.items().getFirst().translationId());assertThat(first.files()).isEqualTo(second.files());assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_resources WHERE namespace=?",Integer.class,first.namespace())).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_files WHERE namespace=?",Integer.class,first.namespace())).isEqualTo(2);}
    }
    @Test void interruptedRemotePutResumesCommittedIntentWithoutCreatingAnotherAsset()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(false);var once=new java.util.concurrent.atomic.AtomicBoolean(true);
        ObjectStorage interrupted=new ObjectStorage(){public java.util.Optional<Metadata> head(Location l){return storage.head(l);}public byte[] read(Location l,long max){return storage.read(l,max);}public void put(Location l,byte[] b,String t,String d){storage.put(l,b,t,d);if(once.getAndSet(false))throw new com.chatgptcourses.assets.storage.StorageUnavailableException();}public SignedRequest presignPut(Location l,String t,long s,Duration ttl){return storage.presignPut(l,t,s,ttl);}public SignedRequest presignGet(Location l,String t,String d,Duration ttl){return storage.presignGet(l,t,d,ttl);}public void deleteStaging(Location l){storage.deleteStaging(l);}};
        assertThat(catchThrowable(()->importer(interrupted).run(manifest,editor,true))).isInstanceOf(com.chatgptcourses.assets.storage.StorageUnavailableException.class);
        var pending=jdbc.queryForObject("SELECT asset_id FROM editorial_import_files WHERE namespace=?",UUID.class,namespace);var partial=jdbc.queryForObject("SELECT translation_id FROM editorial_import_translations WHERE namespace=?",UUID.class,namespace);assertThat(editorial.readiness(editor,partial).ready()).isFalse();
        var completed=importer(storage).run(manifest,editor,true);assertThat(completed.files().stream().anyMatch(f->f.assetId().equals(pending))).isTrue();assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_files WHERE namespace=?",Integer.class,namespace)).isEqualTo(2);assertThat(editorial.get(editor,partial).state()).isEqualTo(EditorialState.DRAFT);
    }
    @Test void humanRevisionIsNeverOverwrittenAndImporterCannotReviewPublishOrProvisionRoles()throws Exception{
        UUID editor=actor(true),learner=actor(false);Path manifest=bundle(false);assertThat(catchThrowable(()->importer(storage).run(manifest,learner,true))).isInstanceOf(AccessDeniedException.class);
        var report=importer(storage).run(manifest,editor,true);var current=editorial.get(editor,report.items().getFirst().translationId());var changed=editorial.revise(editor,current.id(),tag(current),new SaveRevision("A human edited this draft",current.summary(),current.document(),"Independent human correction"));
        expect(ApiError.CONFLICT,()->runUnchecked(manifest,editor));assertThat(editorial.get(editor,current.id()).currentRevisionId()).isEqualTo(changed.currentRevisionId());assertThat(editorial.get(editor,current.id()).title()).isEqualTo("A human edited this draft");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_roles WHERE user_id=?",Integer.class,learner)).isEqualTo(1);
    }
    @Test void changedSourceAppendsDraftRevisionButKeepsLogicalIdentityAndReadyFileBytes()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(false);var diagnostic=new S3CiDiagnostic.Tracker(jdbc,namespace,S3CiDiagnostic.Phase.FIRST_IMPORT);
        try{
        var first=importer(storage).run(manifest,editor,true);diagnostic.phase(S3CiDiagnostic.Phase.SOURCE_READ);Path sourceFile=directory.resolve("source-fr.json");var source=mapper.readValue(Files.readAllBytes(sourceFile),Source.class);diagnostic.phase(S3CiDiagnostic.Phase.SOURCE_WRITE);Files.write(sourceFile,mapper.writeValueAsBytes(new Source(source.slug(),"A new authored title",source.summary(),source.objectives(),source.evaluationDefinition(),source.document())));
        diagnostic.phase(S3CiDiagnostic.Phase.SECOND_IMPORT);var updated=importer(storage).run(manifest,editor,true);diagnostic.phase(S3CiDiagnostic.Phase.ASSERTIONS);assertThat(updated.items().getFirst().resourceId()).isEqualTo(first.items().getFirst().resourceId());assertThat(updated.items().getFirst().revisionId()).isNotEqualTo(first.items().getFirst().revisionId());assertThat(updated.files()).isEqualTo(first.files());assertThat(editorial.get(editor,updated.items().getFirst().translationId()).state()).isEqualTo(EditorialState.DRAFT);
        }catch(Exception|AssertionError failure){diagnostic.attach(failure);throw failure;}
    }
    @Test void privateSolutionFilesRequireOwnerDisclosureAndCurrentPedagogicalAccess()throws Exception{
        UUID editor=actor(true),owner=actor(false),other=actor(false);var report=importer(storage).run(bundle(false),editor,true);var source=publish(editor,editorial.get(editor,report.items().getFirst().translationId()));var solution=report.files().stream().filter(f->f.purpose().equals("SOLUTION")).findFirst().orElseThrow();var project=project(owner,source);
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.download(owner,owner,solution.assetId(),new AssetAccessContext("fr",source.resourceId(),source.versionId(),null)));
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.solutionDownload(owner,owner,project.id(),UUID.randomUUID(),solution.assetId()));
        var reveal=projects.reveal(owner,owner,source.resourceId(),new ProjectTypes.RevealSolution(project.id(),project.currentRevisionId(),source.versionId(),source.publishedRevisionId(),"fr"));assertThat(reveal.files()).hasSize(1);assertThat(reveal.files().getFirst().assetId()).isEqualTo(solution.assetId());
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.solutionDownload(other,other,project.id(),reveal.id(),solution.assetId()));expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->assets.solutionDownload(owner,other,project.id(),reveal.id(),solution.assetId()));
        var link=assets.solutionDownload(owner,owner,project.id(),reveal.id(),solution.assetId());assertThat(Arrays.equals(http("GET",link.url(),null,Map.of()).body(),solutionBytes)).isTrue();
        var publicDocument=new com.chatgptcourses.catalog.service.PublicCatalogueService(jdbc,mapper).version(source.resourceId(),source.versionId(),"fr").document();assertThat(!mapper.writeValueAsString(publicDocument).contains(solution.assetId().toString())&&!mapper.writeValueAsString(publicDocument).contains("Review the supplied facts")).isTrue();
        var current=editorial.get(editor,source.id());editorial.archive(editor,current.id(),tag(current),new ArchiveContent("Explicit fixture withdrawal"));expect(ApiError.RESOURCE_NOT_FOUND,()->assets.solutionDownload(owner,owner,project.id(),reveal.id(),solution.assetId()));assertThat(projects.get(owner,project.id()).currentRevisionId()).isEqualTo(project.currentRevisionId());assertThat(jdbc.queryForObject("SELECT count(*) FROM project_solution_reveals WHERE id=?",Integer.class,reveal.id())).isEqualTo(1);
    }
    @Test void solutionClassificationIsImmutableCannotBePublishedAsOrdinaryFileAndFreezesWithPedagogy()throws Exception{
        UUID editor=actor(true);var report=importer(storage).run(bundle(false),editor,true);var source=editorial.get(editor,report.items().getFirst().translationId());UUID solution=report.files().stream().filter(f->f.purpose().equals("SOLUTION")).findFirst().orElseThrow().assetId();
        var ordinary=withMedia(document(),List.of(new MediaReference(solution,"FILE",false,"Incorrect ordinary reference")));expect(ApiError.VALIDATION_FAILED,()->editorial.create(editor,new CreateContent(ResourceKind.GUIDE,"fr","no-solution-leak-"+UUID.randomUUID(),"Isolated guide","Isolated","Objective","Assessment",ordinary,List.of(),"Do not leak a private solution")));
        assertThat(catchThrowable(()->jdbc.update("UPDATE assets SET content_role='RESOURCE',revision=revision+1 WHERE id=?",solution))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        var published=publish(editor,source);var old=published.document();var without=new ContentDocument(old.objective(),old.expectedResult(),old.prerequisites(),old.blocks(),old.estimatedMinutes(),new Exercise(old.exercise().instructions(),old.exercise().correction()),old.quiz(),old.rubric(),old.access(),old.media(),old.relatedResourceIds(),old.methodDefinition(),old.quizPolicy(),old.projectPolicy());expect(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED,()->editorial.revise(editor,published.id(),tag(published),new SaveRevision(published.title(),published.summary(),without,"Cannot silently remove frozen solution")));
    }
    @Test void invalidPathsHashesAndUtf8FailClosedWithoutInventingAReadyDocument()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(false);var m=mapper.readValue(Files.readAllBytes(manifest),Manifest.class);var first=m.files().getFirst();var bad=new FileEntry(first.key(),first.locale(),"../outside.md",first.purpose(),first.sha256());Files.write(manifest,mapper.writeValueAsBytes(new Manifest(1,m.namespace(),m.items(),List.of(bad,m.files().get(1)))));assertThat(catchThrowable(()->importer(storage).run(manifest,editor,true))).isNotNull();assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_resources WHERE namespace=?",Integer.class,namespace)).isZero();
        Files.write(manifest,mapper.writeValueAsBytes(m));Files.write(directory.resolve(first.path()),new byte[]{(byte)0xc3,0x28});expect(ApiError.VALIDATION_FAILED,()->runUnchecked(manifest,editor));
        var invalid=new byte[]{(byte)0xc3,0x28};var invalidFile=new FileEntry(first.key(),first.locale(),first.path(),first.purpose(),digest(invalid));Files.write(manifest,mapper.writeValueAsBytes(new Manifest(1,m.namespace(),m.items(),List.of(invalidFile,m.files().get(1)))));expect(ApiError.ASSET_NOT_READY,()->runUnchecked(manifest,editor));assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_files f JOIN assets a ON a.id=f.asset_id WHERE f.namespace=? AND a.state='READY'",Integer.class,namespace)).isZero();
    }
    @Test void revokedPaidOriginBlocksNewSolutionLinksWhilePersonalWorkAndDisclosureHistoryRemain()throws Exception{
        UUID editor=actor(true),owner=actor(false);Path manifest=bundle(false);Path sourceFile=directory.resolve("source-fr.json");var input=mapper.readValue(Files.readAllBytes(sourceFile),Source.class);Files.write(sourceFile,mapper.writeValueAsBytes(new Source(input.slug(),input.title(),input.summary(),input.objectives(),input.evaluationDefinition(),withAccess(input.document(),"PROTECTED"))));
        var report=importer(storage).run(manifest,editor,true);var activity=publish(editor,editorial.get(editor,report.items().getFirst().translationId()));var module=parent(editor,ResourceKind.MODULE,activity.versionId(),"PROTECTED");var course=parent(editor,ResourceKind.COURSE,module.versionId(),"PROTECTED");UUID grant=UUID.randomUUID();jdbc.update("INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at) VALUES(?,?,?,?,'MANUAL_TEST',?,'[\"fr\"]'::jsonb,'PINNED',clock_timestamp())",grant,owner,course.resourceId(),course.versionId(),UUID.randomUUID());
        var project=project(owner,activity);var reveal=projects.reveal(owner,owner,activity.resourceId(),new ProjectTypes.RevealSolution(project.id(),project.currentRevisionId(),activity.versionId(),activity.publishedRevisionId(),"fr"));UUID solution=reveal.files().getFirst().assetId();assertThat(assets.solutionDownload(owner,owner,project.id(),reveal.id(),solution).assetId()).isEqualTo(solution);
        jdbc.update("UPDATE access_grants SET revoked_at=greatest(starts_at,created_at,clock_timestamp()) WHERE id=?",grant);assertThat(catchThrowable(()->assets.solutionDownload(owner,owner,project.id(),reveal.id(),solution))).isInstanceOf(AccessDeniedException.class);assertThat(projects.get(owner,project.id()).fields()).isEqualTo(project.fields());assertThat(jdbc.queryForObject("SELECT count(*) FROM project_solution_reveals WHERE id=?",Integer.class,reveal.id())).isEqualTo(1);
    }
    @Test void realCommandLinePlanApplyAndReplayUseOnlyTheExplicitTestActorAndNeverStartTheApplication()throws Exception{
        UUID editor=actor(true);Path manifest=bundle(false);var plan=cli(manifest,editor,"--plan");assertThat(plan.path("mode").asText()).isEqualTo("PLAN");assertThat(jdbc.queryForObject("SELECT count(*) FROM editorial_import_resources WHERE namespace=?",Integer.class,namespace)).isZero();var applied=cli(manifest,editor,"--apply");var replay=cli(manifest,editor,"--apply");assertThat(replay.path("items").get(0).path("state").asText()).isEqualTo("UNCHANGED");assertThat(replay.path("items").get(0).path("translationId").asText()).isEqualTo(applied.path("items").get(0).path("translationId").asText());assertThat(replay.path("files").size()).isEqualTo(2);
    }
    @Test void additiveUpgradeKeepsLegacyAssetAndEditorialRowsAndDefaultsTheirRoleToResource()throws Exception{
        String schema="upgrade_p18_"+UUID.randomUUID().toString().replace("-","");Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("18").load().migrate();try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())){connection.setSchema(schema);var db=new JdbcTemplate(new SingleConnectionDataSource(connection,true));UUID owner=UUID.randomUUID(),resource=UUID.randomUUID(),version=UUID.randomUUID(),asset=UUID.randomUUID();db.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable','ACTIVE')",owner,owner+"@example.test");db.update("INSERT INTO learning_resources(id,kind) VALUES(?,'ACTIVITY')",resource);db.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition) VALUES(?,?,1,'Existing objective','Existing definition')",version,resource);db.update("INSERT INTO assets(id,owner_id,scope,kind,origin_resource_id,origin_version_id,locale,bucket_name,staging_key,ready_key,filename,declared_content_type,declared_size,expires_at) VALUES(?,?,'EDITORIAL','FILE',?,?,'fr','old-private-bucket',?,?,'existing.txt','text/plain',1,CURRENT_TIMESTAMP+interval '5 minutes')",asset,owner,resource,version,"staging/"+asset+"/"+UUID.randomUUID(),"ready/"+asset+"/"+UUID.randomUUID());String before=db.queryForObject("SELECT row_to_json(a)::text FROM assets a WHERE id=?",String.class,asset);Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();assertThat(db.queryForObject("SELECT (to_jsonb(a)-'content_role')=?::jsonb FROM assets a WHERE id=?",Boolean.class,before,asset)).isTrue();assertThat(db.queryForObject("SELECT content_role FROM assets WHERE id=?",String.class,asset)).isEqualTo("RESOURCE");for(String table:List.of("editorial_import_resources","editorial_import_translations","editorial_import_files"))assertThat(db.queryForObject("SELECT count(*) FROM "+table,Integer.class)).isZero();}
    }

    private String namespace;private final byte[] solutionBytes="# Private worked example\nA verified and editable solution.\n".getBytes(StandardCharsets.UTF_8);
    private Path bundle(boolean bilingual)throws Exception{
        namespace="test-"+UUID.randomUUID();var items=new ArrayList<Item>();var files=new ArrayList<FileEntry>();for(String locale:bilingual?List.of("fr","en"):List.of("fr")){
            var source=new Source("import-"+UUID.randomUUID(),"Fictional authored source","Explicit isolated fixture","Respect exact supplied facts","Declared assessment",document());Files.write(directory.resolve("source-"+locale+".json"),mapper.writeValueAsBytes(source));byte[] resource="# Editable exercise\nWork from the supplied facts.\n".getBytes(StandardCharsets.UTF_8);Files.write(directory.resolve("resource-"+locale+".md"),resource);Files.write(directory.resolve("solution-"+locale+".md"),solutionBytes);
            files.add(new FileEntry("resource",locale,"resource-"+locale+".md","RESOURCE",digest(resource)));files.add(new FileEntry("solution",locale,"solution-"+locale+".md","SOLUTION",digest(solutionBytes)));items.add(new Item("activity",ResourceKind.ACTIVITY,locale,"source-"+locale+".json",List.of(),null,List.of("resource"),List.of("solution")));
        }Path manifest=directory.resolve("manifest.json");Files.write(manifest,mapper.writeValueAsBytes(new Manifest(1,namespace,items,files)));return manifest;
    }
    private EditorialImportService importer(ObjectStorage remote){return new EditorialImportService(jdbc,mapper,editorial,assets,remote,new TransactionTemplate(transactionManager),storageProperties.maxFileBytes(),"test");}
    private tools.jackson.databind.JsonNode cli(Path manifest,UUID actor,String mode)throws Exception{
        var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").startsWith("Windows")?"java.exe":"java").toString(),"-cp",System.getProperty("java.class.path"),"com.chatgptcourses.editorial.importing.ContentImportMain",mode,"--actor",actor.toString(),"--manifest",manifest.toString()).redirectErrorStream(true);var env=process.environment();env.keySet().removeIf(k->k.startsWith("STRIPE_")||k.startsWith("SMTP_"));env.putAll(Map.of("APP_ENV","test","POSTGRES_HOST",POSTGRES.getHost(),"POSTGRES_PORT",POSTGRES.getMappedPort(5432).toString(),"POSTGRES_DB",POSTGRES.getDatabaseName(),"POSTGRES_USER",POSTGRES.getUsername(),"POSTGRES_PASSWORD",POSTGRES.getPassword(),"STORAGE_ENABLED","true","S3_ENDPOINT",internalEndpoint(),"S3_EXTERNAL_ENDPOINT",externalEndpoint()));env.put("APP_PUBLIC_ORIGIN","http://localhost:3000");env.put("SESSION_COOKIE_SECURE","false");env.putAll(Map.of("S3_REGION","us-east-1","S3_ACCESS_KEY",ACCESS,"S3_SECRET_KEY",SECRET,"S3_PUBLIC_BUCKET","editorial-test","S3_PRIVATE_BUCKET","private-test"));var child=process.start();boolean done=child.waitFor(30,TimeUnit.SECONDS);if(!done){child.destroyForcibly();throw new IllegalStateException("CLI deadline exceeded");}byte[] output=child.getInputStream().readNBytes(65536);String safeClass=new String(output,StandardCharsets.UTF_8).lines().filter(v->v.matches("Content import failed: [A-Za-z0-9_ (),]+.*")).map(v->v.replaceAll("[^A-Za-z0-9_ (),:]", "")).findFirst().orElse("No safe failure class available");assertThat(child.exitValue()==0).as("CLI exited successfully: %s",safeClass).isTrue();var lines=new String(output,StandardCharsets.UTF_8).lines().filter(s->s.startsWith("{\"mode\":")).toList();assertThat(lines).hasSize(1);return mapper.readTree(lines.getFirst());
    }
    private void runUnchecked(Path manifest,UUID actor){try{importer(storage).run(manifest,actor,true);}catch(java.io.IOException e){throw new IllegalStateException("Source unavailable");}}
    private static String digest(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}

    private UUID actor(boolean editor){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable','ACTIVE')",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),?,id FROM roles WHERE code='LEARNER' OR(? AND code='EDITOR')",id,editor);return id;}
    private ContentView source(UUID actor){return editorial.create(actor,new CreateContent(ResourceKind.ACTIVITY,"fr","asset-"+UUID.randomUUID(),"Asset fixture source","Fictional exercise","Prepare a proposal","Declared assessment",document(),List.of(),"P10 isolated source"));}
    private ContentDocument document(){try(var input=new ClassPathResource("editorial/project-presets.json").getInputStream()){for(var preset:mapper.readTree(input))if(preset.path("caseCode").asText().equals("BR01")&&preset.path("locale").asText().equals("fr")){var policy=mapper.treeToValue(preset.path("policy"),ProjectTypes.ProjectPolicy.class);var rubric=Arrays.asList(mapper.treeToValue(preset.path("rubric"),RubricCriterion[].class));return new ContentDocument("Respect supplied facts","A personal proposal",List.of(),List.of(new ContentBlock("PARAGRAPH","Fictional brief",null)),null,new Exercise("Prepare text","Review the supplied facts"),List.of(),rubric,"FREE",List.of(),List.of(),null,null,policy);}throw new IllegalStateException("Preset missing");}catch(java.io.IOException e){throw new IllegalStateException("Preset unavailable");}}
    private ProjectTypes.ProjectView project(UUID owner,ContentView source){return projects.create(owner,owner,new ProjectTypes.CreateProject(UUID.randomUUID(),source.resourceId(),source.versionId(),source.publishedRevisionId(),"fr",null,new ProjectTypes.ProjectFields("Personal project","fr","","","","","","","","My own text"),"DRAFT")).value();}
    private ContentView parent(UUID actor,ResourceKind kind,UUID child,String access){var doc=new ContentDocument("Follow pinned programme","A declared result",List.of(),List.of(new ContentBlock("PARAGRAPH","Test programme",null)),null,null,List.of(),List.of(),access,List.of(),List.of());return publish(actor,editorial.create(actor,new CreateContent(kind,"fr","parent-"+UUID.randomUUID(),"Pinned programme","Isolated test","Follow exact versions","Declared facts",doc,List.of(child),"P10 parent fixture")));}
    private ContentView publish(UUID actor,ContentView view){var current=editorial.get(actor,view.id());if(current.state()==EditorialState.DRAFT||current.state()==EditorialState.STALE)current=editorial.transition(actor,current.id(),tag(current),new TransitionContent(EditorialState.TO_REVIEW,"Request review",null));var ready=editorial.transition(actor,current.id(),tag(current),new TransitionContent(EditorialState.READY,"Review exact revision",null));return editorial.publish(actor,ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Publish reviewed test content"));}
    private static ContentDocument withMedia(ContentDocument d,List<MediaReference> media){return new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),d.access(),media,d.relatedResourceIds(),d.methodDefinition(),d.quizPolicy(),d.projectPolicy());}
    private static ContentDocument withAccess(ContentDocument d,String access){return new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise(),d.quiz(),d.rubric(),access,d.media(),d.relatedResourceIds(),d.methodDefinition(),d.quizPolicy(),d.projectPolicy());}
    private void overwriteStaging(UUID id,byte[] bytes,String type){var location=jdbc.queryForMap("SELECT bucket_name,staging_key FROM assets WHERE id=?",id);storage.put(new ObjectStorage.Location((String)location.get("bucket_name"),(String)location.get("staging_key")),bytes,type,"attachment");}
    private static void put(UploadIntent intent,byte[] bytes){assertThat(http("PUT",intent.uploadUrl(),bytes,intent.headers()).statusCode()).isBetween(200,299);}
    private static HttpResponse<byte[]> http(String method,String url,byte[] body,Map<String,String> headers){try(var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build()){var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15));headers.forEach(request::header);return client.send(request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofByteArray(body)).build(),HttpResponse.BodyHandlers.ofByteArray());}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new IllegalStateException("S3 test request failed; sensitive URL omitted");}}
    private static String unsigned(String value){URI url=URI.create(value);return url.getScheme()+"://"+url.getRawAuthority()+url.getRawPath();}
    private boolean databaseExpired(java.time.Instant expiry){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT clock_timestamp()>=?::timestamptz",Boolean.class,java.sql.Timestamp.from(expiry)));}
    private static byte[] png()throws Exception{var image=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB);var bytes=new ByteArrayOutputStream();ImageIO.write(image,"png",bytes);return bytes.toByteArray();}
    private static S3Client s3Client(){return S3Client.builder().region(Region.US_EAST_1).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS,SECRET))).endpointOverride(URI.create(internalEndpoint())).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).httpClientBuilder(UrlConnectionHttpClient.builder()).build();}
    private static String internalEndpoint(){return "http://127.0.0.1:"+S3.getMappedPort(8333);}
    private static String externalEndpoint(){return "http://localhost:"+S3.getMappedPort(8333);}
    private static String tag(ContentView view){return EntityTags.forRevision("content",view.id(),view.revision());}
    private static void expect(ApiError expected,Runnable action){var failure=catchThrowable(action::run);assertThat(failure instanceof ApiException&&((ApiException)failure).error()==expected).isTrue();}
    private static String attempt(Runnable action){try{action.run();return "OK";}catch(ApiException e){return e.error().name();}}
}
