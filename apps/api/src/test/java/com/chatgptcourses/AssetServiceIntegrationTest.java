package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
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
class AssetServiceIntegrationTest {
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
        r.add("courses.assets.enabled",()->true);r.add("courses.assets.internal-endpoint",AssetServiceIntegrationTest::internalEndpoint);r.add("courses.assets.external-endpoint",AssetServiceIntegrationTest::externalEndpoint);
        r.add("courses.assets.access-key",()->ACCESS);r.add("courses.assets.secret-key",()->SECRET);r.add("courses.assets.editorial-bucket",()->"editorial-test");r.add("courses.assets.private-bucket",()->"private-test");
        r.add("courses.assets.region",()->"us-east-1");r.add("courses.assets.path-style",()->true);
        r.add("courses.assets.max-file-bytes",()->4096);r.add("courses.assets.max-image-bytes",()->65536);r.add("courses.assets.max-files-per-project",()->2);r.add("courses.assets.max-bytes-per-project",()->6000);
        r.add("courses.assets.upload-ttl-seconds",()->3);r.add("courses.assets.download-ttl-seconds",()->2);
        r.add("courses.assets.staging-cleanup-grace-seconds",()->0);
        r.add("courses.assets.staging-cleanup-worker-enabled",()->false);
    }
    @BeforeAll static void buckets(){try(var client=s3Client()){for(String bucket:List.of("editorial-test","private-test")){client.createBucket(b->b.bucket(bucket));client.putBucketCors(b->b.bucket(bucket).corsConfiguration(c->c.corsRules(rule->rule.allowedOrigins("http://127.0.0.1:3000").allowedMethods("GET","PUT","HEAD").allowedHeaders("Content-Type").exposeHeaders("ETag").maxAgeSeconds(0))));}}}
    @Autowired AssetService assets;@Autowired AssetStagingCleanup cleanup;@Autowired ObjectStorage storage;@Autowired EditorialService editorial;@Autowired ProjectService projects;@Autowired LearningService learning;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;

    @Test void projectTextRoundTripsPrivatelyAndSurvivesSourceWithdrawalWithoutSharingOwnership(CapturedOutput output){
        UUID editor=actor(true),owner=actor(false),other=actor(false);var source=publish(editor,source(editor));var project=project(owner,source);byte[] bytes="A personal production.\nA second line. é".getBytes(StandardCharsets.UTF_8);
        assertThat(assets.projectPolicy(owner,project.id()).formats().stream().filter(f->f.contentType().equals("application/pdf")).allMatch(f->!f.available())).isTrue();
        var diagnostic=new S3CiDiagnostic.Tracker(jdbc,null,S3CiDiagnostic.Phase.INTENT);
        try{
        var intent=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("proposition.txt","text/plain",bytes.length));diagnostic.asset(intent.asset().id());diagnostic.phase(S3CiDiagnostic.Phase.PUT);assertThat(URI.create(intent.uploadUrl()).getHost().equals("localhost")).isTrue();put(intent,bytes);
        diagnostic.phase(S3CiDiagnostic.Phase.CONFIRM);
        var ready=assets.confirmProject(owner,owner,project.id(),intent.asset().id());assertThat(ready.state()).isEqualTo("READY");assertThat(ready.validationStatus()).isEqualTo("FORMAT_VERIFIED");
        diagnostic.phase(S3CiDiagnostic.Phase.AFTER_CONFIRM);
        var link=assets.download(owner,owner,ready.id(),null);assertThat(Arrays.equals(http("GET",link.url(),null,Map.of()).body(),bytes)).isTrue();assertThat(link.disposition()).isEqualTo("attachment");
        assertThat(http("GET",unsigned(link.url()),null,Map.of()).statusCode()).isEqualTo(403);
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.download(other,other,ready.id(),null));expect(ApiError.RESOURCE_NOT_FOUND,()->assets.listProject(other,project.id(),0,20));
        expect(ApiError.ACCOUNT_CONTEXT_REQUIRED,()->assets.createProjectIntent(owner,null,project.id(),new UploadRequest("missing.txt","text/plain",1)));
        expect(ApiError.ACCOUNT_CONTEXT_CHANGED,()->assets.download(owner,other,ready.id(),null));
        var current=editorial.get(editor,source.id());editorial.archive(editor,current.id(),tag(current),new ArchiveContent("Withdraw source, retain personal work"));
        assertThat(Arrays.equals(http("GET",assets.download(owner,owner,ready.id(),null).url(),null,Map.of()).body(),bytes)).isTrue();assertThat(assets.listProject(owner,project.id(),0,20).total()).isEqualTo(1);
        assertThat(catchThrowable(()->assets.preview(editor,editor,ready.id()))).isInstanceOf(ApiException.class);
        String logs=output.getAll();assertThat(!logs.contains(SECRET)&&!logs.contains(ACCESS)&&!logs.contains("X-Amz-Signature")&&!logs.contains(new String(bytes,StandardCharsets.UTF_8))).isTrue();
        }catch(RuntimeException|AssertionError failure){diagnostic.attach(failure);throw failure;}
    }

    @Test void actualObjectValidationRejectsMissingWrongSizeMimeAndInvalidUtf8WithoutPretendingToScan(){
        UUID editor=actor(true),owner=actor(false);var project=project(owner,publish(editor,source(editor)));
        var missing=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("missing.txt","text/plain",1));expect(ApiError.UPLOAD_OBJECT_MISSING,()->assets.confirmProject(owner,owner,project.id(),missing.asset().id()));
        overwriteStaging(missing.asset().id(),new byte[]{1,2},"text/plain");assertThat(assets.confirmProject(owner,owner,project.id(),missing.asset().id()).rejectionCode()).isEqualTo("SIZE_MISMATCH");
        var mime=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("mime.txt","text/plain",1));overwriteStaging(mime.asset().id(),new byte[]{65},"text/html");assertThat(assets.confirmProject(owner,owner,project.id(),mime.asset().id()).rejectionCode()).isEqualTo("CONTENT_TYPE_MISMATCH");
        var invalid=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("invalid.txt","text/plain",2));put(invalid,new byte[]{(byte)0xc3,0x28});assertThat(assets.confirmProject(owner,owner,project.id(),invalid.asset().id()).rejectionCode()).isEqualTo("INVALID_UTF8");
        expect(ApiError.VALIDATION_FAILED,()->assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("unsafe.html","text/html",1)));
        expect(ApiError.VALIDATION_FAILED,()->assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("../unsafe.txt","text/plain",1)));
        expect(ApiError.VALIDATION_FAILED,()->assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("too-large.txt","text/plain",4097)));
        expect(ApiError.VALIDATION_FAILED,()->assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("unscanned.pdf","application/pdf",8)));
    }

    @Test void projectReservationQuotaIsAtomicForConcurrentUploadIntents()throws Exception{
        UUID editor=actor(true),owner=actor(false);var source=publish(editor,source(editor));var project=project(owner,source);var blockedProject=project(owner,source);
        try(var pool=Executors.newSingleThreadExecutor();var lock=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())){
            lock.setAutoCommit(false);try(var statement=lock.prepareStatement("SELECT id FROM projects WHERE id=? FOR NO KEY UPDATE")){statement.setObject(1,blockedProject.id());statement.executeQuery();}
            var pending=pool.submit(()->assets.createProjectIntent(owner,owner,blockedProject.id(),new UploadRequest("after-lock.txt","text/plain",1)));
            long limit=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);boolean waiting=false;
            while(!waiting&&System.nanoTime()<limit){waiting=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id,owner_id FROM projects WHERE id=%')",Boolean.class));if(!waiting)Thread.sleep(20);}
            var releasedAt=jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();lock.commit();assertThat(waiting).isTrue();var issued=pending.get(15,TimeUnit.SECONDS);
            assertThat(!issued.asset().createdAt().isBefore(releasedAt)).isTrue();assertThat(issued.expiresAt().isAfter(releasedAt.plusSeconds(2))).isTrue();
        }
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(3)){var futures=java.util.stream.IntStream.range(0,3).mapToObj(i->pool.submit(()->{start.await();return attempt(()->assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("file-"+i+".txt","text/plain",1)));})).toList();start.countDown();var outcomes=new java.util.ArrayList<String>();for(var future:futures)outcomes.add(future.get(15,TimeUnit.SECONDS));assertThat(outcomes).containsExactlyInAnyOrder("OK","OK","ASSET_QUOTA_EXCEEDED");}
        assertThat(assets.listProject(owner,project.id(),0,20).total()).isEqualTo(2);
    }

    @Test void editorialImagesAreDecodedReencodedBoundedAndPublicationControlsEveryPublicLink()throws Exception{
        UUID editor=actor(true);var source=source(editor);byte[] image=png();byte[] trailer="<script>not retained</script>".getBytes(StandardCharsets.UTF_8);byte[] original=new byte[image.length+trailer.length];System.arraycopy(image,0,original,0,image.length);System.arraycopy(trailer,0,original,image.length,trailer.length);
        var upload=assets.createEditorialIntent(editor,editor,new EditorialUploadRequest(source.resourceId(),source.versionId(),"fr","illustration.png","image/png",original.length));put(upload,original);var ready=assets.confirmEditorial(editor,editor,upload.asset().id());assertThat(ready.state()).isEqualTo("READY");
        byte[] sanitized=http("GET",assets.preview(editor,editor,ready.id()).url(),null,Map.of()).body();assertThat(Arrays.equals(sanitized,original)).isFalse();assertThat(sanitized.length<=65536).isTrue();assertThat(ImageIO.read(new java.io.ByteArrayInputStream(sanitized))).isNotNull();
        var ctx=new AssetAccessContext("fr",source.resourceId(),source.versionId(),null);expect(ApiError.RESOURCE_NOT_FOUND,()->assets.download(null,null,ready.id(),ctx));
        source=editorial.revise(editor,source.id(),tag(source),new SaveRevision(source.title(),source.summary(),withMedia(source.document(),List.of(new MediaReference(ready.id(),"IMAGE",true,"Controlled image"))),"Reference validated image"));source=publish(editor,source);
        assertThat(http("GET",assets.download(null,null,ready.id(),ctx).url(),null,Map.of()).statusCode()).isEqualTo(200);
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.download(null,null,ready.id(),new AssetAccessContext("en",ctx.resourceId(),ctx.versionId(),null)));
        var protectedSource=editorial.revise(editor,source.id(),tag(source),new SaveRevision(source.title(),source.summary(),withAccess(source.document(),"PROTECTED"),"Protect resource"));publish(editor,protectedSource);
        assertThat(catchThrowable(()->assets.download(null,null,ready.id(),ctx))).isInstanceOf(AccessDeniedException.class);
        assertThat(assets.readyEditorial(ready.id(),"IMAGE","fr")).isTrue();assertThat(assets.readyEditorial(ready.id(),"FILE","fr")).isFalse();
        // Exercise the second advertised image codec against the real object store as well.
        var jpegBytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(3,2,BufferedImage.TYPE_INT_RGB),"jpeg",jpegBytes);byte[] jpegSource=jpegBytes.toByteArray();
        var jpegIntent=assets.createEditorialIntent(editor,editor,new EditorialUploadRequest(ctx.resourceId(),ctx.versionId(),"fr","illustration.jpg","image/jpeg",jpegSource.length));put(jpegIntent,jpegSource);
        var jpegReady=assets.confirmEditorial(editor,editor,jpegIntent.asset().id());assertThat(jpegReady.state()).isEqualTo("READY");var jpegAccess=assets.preview(editor,editor,jpegReady.id());var jpegResponse=http("GET",jpegAccess.url(),null,Map.of());
        assertThat(jpegResponse.statusCode()).isEqualTo(200);assertThat(jpegAccess.contentType()).isEqualTo("image/jpeg");assertThat(jpegResponse.body().length==jpegAccess.sizeBytes()&&jpegResponse.body().length<=65536).isTrue();
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(jpegResponse.body())).getWidth()).isEqualTo(3);
        assertThat(java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(jpegResponse.body())).equals(jpegAccess.sha256())).isTrue();
    }

    @Test void concurrentConfirmationAndReplayedStagingPutCannotModifyReadyBytes()throws Exception{
        UUID editor=actor(true),owner=actor(false);var project=project(owner,publish(editor,source(editor)));byte[] original="first".getBytes(StandardCharsets.UTF_8);var intent=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("stable.txt","text/plain",original.length));put(intent,original);var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->{start.await();return assets.confirmProject(owner,owner,project.id(),intent.asset().id());});var b=pool.submit(()->{start.await();return assets.confirmProject(owner,owner,project.id(),intent.asset().id());});start.countDown();assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));}
        put(intent,"other".getBytes(StandardCharsets.UTF_8));var repeated=assets.confirmProject(owner,owner,project.id(),intent.asset().id());assertThat(repeated.revision()).isEqualTo(1);
        assertThat(Arrays.equals(http("GET",assets.download(owner,owner,repeated.id(),null).url(),null,Map.of()).body(),original)).isTrue();
        assertThat(catchThrowable(()->jdbc.update("UPDATE assets SET filename='changed.txt' WHERE id=?",repeated.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(catchThrowable(()->jdbc.update("DELETE FROM assets WHERE id=?",repeated.id()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void pendingUploadsAndSignedDownloadsActuallyExpireWithoutIssuingPermanentObjectAccess()throws Exception{
        UUID editor=actor(true),owner=actor(false);var project=project(owner,publish(editor,source(editor)));var pending=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("expires.txt","text/plain",1));
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(!databaseExpired(pending.expiresAt())&&System.nanoTime()<end)Thread.sleep(50);assertThat(databaseExpired(pending.expiresAt())).isTrue();
        assertThat(assets.confirmProject(owner,owner,project.id(),pending.asset().id()).state()).isEqualTo("EXPIRED");
        var intent=assets.createProjectIntent(owner,owner,project.id(),new UploadRequest("download.txt","text/plain",1));put(intent,new byte[]{65});var ready=assets.confirmProject(owner,owner,project.id(),intent.asset().id());var link=assets.download(owner,owner,ready.id(),null);assertThat(http("GET",link.url(),null,Map.of()).statusCode()).isEqualTo(200);
        end=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);int status=200;while(status==200&&System.nanoTime()<end){Thread.sleep(150);status=http("GET",link.url(),null,Map.of()).statusCode();}assertThat(status).isEqualTo(403);
        assertThat(http("GET",assets.download(owner,owner,ready.id(),null).url(),null,Map.of()).statusCode()).isEqualTo(200);
        end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(!databaseExpired(intent.expiresAt())&&System.nanoTime()<end)Thread.sleep(50);assertThat(databaseExpired(intent.expiresAt())).isTrue();
        var cleanupResult=cleanup.cleanBatch(25);assertThat(cleanupResult.cleaned()>=1&&cleanupResult.failed()==0).isTrue();assertThat(jdbc.queryForObject("SELECT staging_cleaned_at IS NOT NULL FROM assets WHERE id=?",Boolean.class,ready.id())).isTrue();
        assertThat(http("GET",assets.download(owner,owner,ready.id(),null).url(),null,Map.of()).statusCode()).isEqualTo(200);assertThat(cleanup.cleanBatch(25).cleaned()).isZero();
    }

    @Test void enrolledEditorialDownloadRechecksWithdrawnParentWhileStandaloneFreeResourceRemainsAvailable(){
        UUID editor=actor(true),owner=actor(false);var source=source(editor);byte[] bytes="An editorial text resource.".getBytes(StandardCharsets.UTF_8);var intent=assets.createEditorialIntent(editor,editor,new EditorialUploadRequest(source.resourceId(),source.versionId(),"fr","resource.txt","text/plain",bytes.length));put(intent,bytes);var ready=assets.confirmEditorial(editor,editor,intent.asset().id());
        source=publish(editor,editorial.revise(editor,source.id(),tag(source),new SaveRevision(source.title(),source.summary(),withMedia(source.document(),List.of(new MediaReference(ready.id(),"FILE",true,"Downloadable reference"))),"Add validated text resource")));
        var module=parent(editor,ResourceKind.MODULE,source.versionId(),"FREE");var course=parent(editor,ResourceKind.COURSE,module.versionId(),"PROTECTED");var enrollment=learning.enroll(owner,owner,new EnrollCourse(course.resourceId(),course.versionId(),"fr")).value();
        var ctx=new AssetAccessContext("fr",source.resourceId(),source.versionId(),enrollment.summary().id());assertThat(http("GET",assets.download(owner,owner,ready.id(),ctx).url(),null,Map.of()).statusCode()).isEqualTo(200);
        var current=editorial.get(editor,module.id());editorial.archive(editor,current.id(),tag(current),new ArchiveContent("Withdraw parent, do not expose enrolled resource"));
        expect(ApiError.RESOURCE_NOT_FOUND,()->assets.download(owner,owner,ready.id(),ctx));assertThat(http("GET",assets.download(null,null,ready.id(),new AssetAccessContext("fr",ctx.resourceId(),ctx.versionId(),null)).url(),null,Map.of()).statusCode()).isEqualTo(200);
    }

    @Test void upgradeV008PreservesExistingProjectRevisionAndSessionWithoutCreatingFiles()throws Exception{
        String schema="p10_upgrade_"+UUID.randomUUID().toString().replace("-","");jdbc.execute("CREATE SCHEMA "+schema);Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).target("008").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())){connection.setSchema(schema);var db=new JdbcTemplate(new SingleConnectionDataSource(connection,true));UUID owner=UUID.randomUUID(),resource=UUID.randomUUID(),version=UUID.randomUUID(),translation=UUID.randomUUID(),source=UUID.randomUUID(),project=UUID.randomUUID(),revision=UUID.randomUUID();String session=UUID.randomUUID().toString();
            db.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable','ACTIVE')",owner,owner+"@example.test");db.update("INSERT INTO learning_resources(id,kind) VALUES(?,'ACTIVITY')",resource);db.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition) VALUES(?,?,1,'Objective','Declared checks')",version,resource);
            db.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state) VALUES(?,?,'fr','DRAFT')",translation,version);db.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,author_id,reason) VALUES(?,?,1,'Legacy source','Summary','Body',?,'Isolated migration fixture')",source,translation,owner);
            db.update("INSERT INTO projects(id,owner_id,creation_id,creation_fingerprint,source_activity_id,source_version_id,source_translation_id,source_revision_id,source_locale,source_title,source_slug) VALUES(?,?,?,? ,?,?,?,?,'fr','Legacy source','legacy-source')",project,owner,UUID.randomUUID(),new byte[32],resource,version,translation,source);
            String fields=mapper.writeValueAsString(new ProjectTypes.ProjectFields("Retained project","fr","","","","","","","","Retained original text"));db.update("INSERT INTO project_revisions(id,project_id,revision_number,fields_json,stage,author_id) VALUES(?,?,1,?::jsonb,'DRAFT',?)",revision,project,fields,owner);db.update("UPDATE projects SET current_revision_id=? WHERE id=?",revision,project);
            db.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time) VALUES(?,?,1,1,1800,9999999999999)",session,session);
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(db.queryForObject("SELECT fields_json->>'externalText'='Retained original text' FROM project_revisions WHERE id=?",Boolean.class,revision)).isTrue();assertThat(db.queryForObject("SELECT current_revision_id=? FROM projects WHERE id=?",Boolean.class,revision,project)).isTrue();assertThat(db.queryForObject("SELECT count(*) FROM spring_session WHERE primary_id=?",Integer.class,session)).isEqualTo(1);assertThat(db.queryForObject("SELECT count(*) FROM assets",Integer.class)).isZero();
        }
    }

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
