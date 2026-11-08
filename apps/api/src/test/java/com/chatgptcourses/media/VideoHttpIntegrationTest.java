package com.chatgptcourses.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import com.chatgptcourses.NotificationTestKeys;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.learning.service.LearningTypes.EnrollCourse;
import com.chatgptcourses.media.config.MediaProperties;
import com.chatgptcourses.media.provider.LocalVideoPlaybackProvider;
import com.chatgptcourses.media.provider.Mp4Probe;
import com.chatgptcourses.media.service.LocalVideoRegistry;
import com.chatgptcourses.media.service.MediaService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real HTTP and PostgreSQL, genuine MDN CC0 clip. This fixture is not a produced training video. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"APP_ENV=test","APP_PUBLIC_ORIGIN=http://localhost:3000","SESSION_COOKIE_SECURE=false","MAIL_MODE=disabled","debug=false"})
@ActiveProfiles("test") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class VideoHttpIntegrationTest {
    static final Path ROOT=temporary();
    static final Path CLIP=Path.of("../../tests/fixtures/media/flower.mp4").toAbsolutePath().normalize();
    static final String HASH="0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451";
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("POSTGRES_HOST",POSTGRES::getHost);r.add("POSTGRES_PORT",()->POSTGRES.getMappedPort(5432));r.add("POSTGRES_DB",POSTGRES::getDatabaseName);r.add("POSTGRES_USER",POSTGRES::getUsername);r.add("POSTGRES_PASSWORD",POSTGRES::getPassword);r.add("NOTIFICATION_OUTBOX_KEY",NotificationTestKeys::randomKey);r.add("courses.media.enabled",()->true);r.add("courses.media.provider",()->"local-test");r.add("courses.media.local-root",()->ROOT.toString());r.add("courses.media.link-ttl-seconds",()->2);}
    @Value("${local.server.port}")int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired EditorialService editorial;
    @Autowired LocalVideoRegistry registry;
    @Autowired LearningService learning;
    @Autowired MediaService service;

    @Test void actualMp4MetadataMatchesFixtureAndMalformedOrPublicStorageFailsClosed()throws Exception{
        var metadata=Mp4Probe.inspect(CLIP,134217728);assertThat(metadata.sizeBytes()).isEqualTo(1128375);assertThat(metadata.sha256()).isEqualTo(HASH);assertThat(metadata.durationSeconds()).isEqualTo(5.055);
        var editor=account(true);var source=fixture(editor,"FREE",true);assertThat(registry.ready(source.content().resourceId(),source.content().versionId(),"fr",source.mediaId(),"VIDEO")).isTrue();
        var original=registry.find(source.mediaId()).orElseThrow();Path stored=ROOT.resolve(source.mediaId()+".mp4");Files.delete(stored);byte[] raw=Files.readAllBytes(CLIP);Path alternate=ROOT.resolve("alternate.mp4");var alternateBytes=ByteBuffer.allocate(raw.length+8).put(raw).putInt(8).put("free".getBytes(StandardCharsets.US_ASCII));Files.write(alternate,alternateBytes.array());var rejected=catchThrowable(()->registry.register(editor.id(),source.mediaId(),source.content().resourceId(),source.content().versionId(),"fr",alternate,original.transcript(),original.captionsVtt()));assertThat(rejected).isInstanceOf(ApiException.class);assertThat(((ApiException)rejected).error()).isEqualTo(ApiError.CONFLICT);assertThat(Files.exists(stored)).isFalse();registry.register(editor.id(),source.mediaId(),source.content().resourceId(),source.content().versionId(),"fr",CLIP,original.transcript(),original.captionsVtt());assertThat(registry.ready(source.content().resourceId(),source.content().versionId(),"fr",source.mediaId(),"VIDEO")).isTrue();
        assertThat(catchThrowable(()->new LocalVideoPlaybackProvider(new MediaProperties(true,"local-test",ROOT.resolve("public"),null,60,20971520),"test"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.exists(ROOT.resolve("public"))).isFalse();
        assertThat(catchThrowable(()->new LocalVideoPlaybackProvider(new MediaProperties(true,"local-test",ROOT,null,60,20971520),"production"))).isInstanceOf(IllegalArgumentException.class);
        var disabled=new LocalVideoPlaybackProvider(new MediaProperties(false,null,null,null,60,20971520),"production");assertThat(disabled.available()).isFalse();assertThat(disabled.resolve(source.mediaId(),1128375,HASH)).isEmpty();
        Path malformed=ROOT.resolve("empty-mvhd.mp4");var buffer=ByteBuffer.allocate(32);buffer.putInt(16).put("ftypisom".getBytes(StandardCharsets.US_ASCII)).putInt(0).putInt(16).put("moov".getBytes(StandardCharsets.US_ASCII)).putInt(8).put("mvhd".getBytes(StandardCharsets.US_ASCII));Files.write(malformed,buffer.array());assertThat(catchThrowable(()->Mp4Probe.inspect(malformed,20971520))).isInstanceOf(java.io.IOException.class);
        assertProblem(get(browser(),"/api/v1/media/"+UUID.randomUUID()+query(source,"fr",null)),404,"RESOURCE_NOT_FOUND");
    }

    @Test void anonymousPlaybackRequiresCsrfAndStreamsVerifiedRangesWithoutLeakingTheGrant()throws Exception{
        var editor=account(true);var source=fixture(editor,"FREE",true);var anonymous=browser();
        var metadata=get(anonymous,metadataPath(source,"fr",null));assertThat(metadata.statusCode()).isEqualTo(200);assertThat(tree(metadata).path("playbackAvailable").asBoolean()).isTrue();assertThat(tree(metadata).path("durationSeconds").asDouble()).isEqualTo(5.055);
        assertProblem(send(anonymous,"POST",playbackPath(source),context(source,"fr",null),null,null,null),403,"CSRF_INVALID");
        var grant=send(anonymous,"POST",playbackPath(source),context(source,"fr",null),csrf(anonymous),null,null);assertThat(grant.statusCode()).isEqualTo(200);String url=text(grant,"url");assertThat(url.matches("/api/v1/media/"+source.mediaId()+"/stream\\?grant=[A-Za-z0-9_-]{43}")).isTrue();
        var bytes=stream(url,"bytes=0-31","GET");assertThat(bytes.statusCode()).isEqualTo(206);assertThat(bytes.headers().firstValue("Content-Range")).hasValue("bytes 0-31/1128375");assertThat(bytes.headers().firstValue("Content-Type")).hasValue("video/mp4");assertThat(bytes.headers().firstValue("Accept-Ranges")).hasValue("bytes");assertThat(Arrays.equals(bytes.body(),Arrays.copyOf(Files.readAllBytes(CLIP),32))).isTrue();
        var suffix=stream(url,"bytes=-16","GET");assertThat(suffix.statusCode()).isEqualTo(206);assertThat(suffix.body().length).isEqualTo(16);
        var head=stream(url,null,"HEAD");assertThat(head.statusCode()).isEqualTo(200);assertThat(head.body().length).isZero();assertThat(head.headers().firstValue("Content-Length")).hasValue("1128375");
        var invalid=stream(url,"bytes=99999999-","GET");assertThat(invalid.statusCode()).isEqualTo(416);var problem=mapper.readTree(invalid.body());assertThat(problem.path("instance").asText().contains("?")).isFalse();
        var full=stream(url,null,"GET");assertThat(full.statusCode()).isEqualTo(200);assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(full.body()))).isEqualTo(HASH);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM video_playback_grants WHERE media_id=? AND octet_length(token_hash)=32",Integer.class,source.mediaId())).isEqualTo(1);
    }

    @Test void expiredGrantAndNewRequestAfterWithdrawalAreRefusedButAnIssuedLinkHasItsResidualTtl()throws Exception{
        var editor=account(true);var source=fixture(editor,"FREE",true);var owner=account(false);var grant=mutate(owner,"POST",playbackPath(source),context(source,"fr",null),null);String url=text(grant,"url");archive(editor,source.content());
        assertProblem(mutate(owner,"POST",playbackPath(source),context(source,"fr",null),null),404,"RESOURCE_NOT_FOUND");assertThat(stream(url,"bytes=0-7","GET").statusCode()).isEqualTo(206);
        Thread.sleep(2200);var expired=stream(url,null,"GET");assertThat(expired.statusCode()).isEqualTo(404);var problem=mapper.readTree(expired.body());assertThat(problem.path("instance").asText().contains("?")).isFalse();
    }

    @Test void positionsAreOwnerOnlyAndStrictlyBoundedByTheMeasuredMediaAndRevision()throws Exception{
        var editor=account(true);var source=fixture(editor,"FREE",true);var owner=account(false);var other=account(false);String path=progressPath(source);
        var initial=get(owner.browser(),path+query(source,"fr",null));assertThat(initial.statusCode()).isEqualTo(200);assertThat(tree(initial).path("revision").asLong()).isZero();assertThat(tree(initial).path("updatedAt").isNull()).isTrue();assertThat(jdbc.queryForObject("SELECT count(*) FROM media_progress WHERE owner_id=?",Integer.class,owner.id())).isZero();
        var command=position(source,"fr",1.25,null);assertProblem(mutate(owner,"PUT",path,command,null),428,"PRECONDITION_REQUIRED");assertProblem(send(owner.browser(),"PUT",path,command,null,owner.id().toString(),etag(initial)),403,"CSRF_INVALID");
        assertProblem(send(owner.browser(),"PUT",path,command,csrf(owner.browser()),other.id().toString(),etag(initial)),409,"ACCOUNT_CONTEXT_CHANGED");
        assertProblem(mutate(owner,"PUT",path,position(source,"fr",5.056,null),etag(initial)),400,"VALIDATION_FAILED");
        long projects=jdbc.queryForObject("SELECT count(*) FROM projects",Long.class);var saved=mutate(owner,"PUT",path,command,etag(initial));assertThat(saved.statusCode()).isEqualTo(200);assertThat(tree(saved).path("revision").asLong()).isEqualTo(1);assertThat(tree(saved).path("positionSeconds").asDouble()).isEqualTo(1.25);assertThat(tree(saved).path("updatedAt").isNull()).isFalse();
        var unchanged=mutate(owner,"PUT",path,command,etag(saved));assertThat(etag(unchanged)).isEqualTo(etag(saved));var theirs=get(other.browser(),path+query(source,"fr",null));assertThat(tree(theirs).path("positionSeconds").asDouble()).isZero();assertThat(tree(theirs).path("revision").asLong()).isZero();
        assertProblem(mutate(other,"PUT",path,command,etag(saved)),412,"REVISION_CONFLICT");assertProblem(get(browser(),path+query(source,"fr",null)),401,"AUTHENTICATION_REQUIRED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM projects",Long.class)).isEqualTo(projects);
        jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,clock_timestamp()),updated_at=greatest(created_at,updated_at,clock_timestamp()),revision=revision+1 WHERE user_id=? AND revoked_at IS NULL",owner.id());assertProblem(mutate(owner,"PUT",path,command,etag(saved)),403,"ACCESS_DENIED");
    }

    @Test void simultaneousFirstPositionsRecheckTheirEtagUnderTheOwnerLock()throws Exception{
        var editor=account(true);var source=fixture(editor,"FREE",true);var owner=account(false);var second=browser();login(second,owner.email(),owner.password());String path=progressPath(source),tag=etag(get(owner.browser(),path+query(source,"fr",null)));String firstToken=csrf(owner.browser()),secondToken=csrf(second);
        var a=owner.browser().http().sendAsync(request("PUT",path,position(source,"fr",1,null),firstToken,owner.id().toString(),tag),HttpResponse.BodyHandlers.ofString());var b=second.http().sendAsync(request("PUT",path,position(source,"fr",2,null),secondToken,owner.id().toString(),tag),HttpResponse.BodyHandlers.ofString());var responses=List.of(a.get(),b.get());assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200,412);var winner=responses.stream().filter(r->r.statusCode()==200).findFirst().orElseThrow();assertThat(tree(get(second,path+query(source,"fr",null)))).isEqualTo(tree(winner));
    }

    @Test void distinctFrenchAndEnglishMediaNeverTransposeTheirPositions()throws Exception{
        var editor=account(true);var fr=fixture(editor,"FREE",true);var current=editorial.get(editor.id(),fr.content().id());UUID englishId=UUID.randomUUID();var english=editorial.translate(editor.id(),current.id(),tag(current),new CreateTranslation("en",unique(),"English technical media fixture","Not a produced course video",document(ResourceKind.ACTIVITY,"FREE",englishId,true),"Equivalent media test"));registry.register(editor.id(),englishId,english.resourceId(),english.versionId(),"en",CLIP,"Technical MDN video description","WEBVTT\n\n00:00.000 --> 00:05.000\nMDN technical video fixture.\n");english=publish(editor,english);var en=new Fixture(english,englishId);var owner=account(false);
        var start=get(owner.browser(),progressPath(fr)+query(fr,"fr",null));assertThat(mutate(owner,"PUT",progressPath(fr),position(fr,"fr",2,null),etag(start)).statusCode()).isEqualTo(200);var separate=get(owner.browser(),progressPath(en)+query(en,"en",null));assertThat(tree(separate).path("positionSeconds").asDouble()).isZero();assertThat(tree(separate).path("locale").asText()).isEqualTo("en");assertProblem(get(owner.browser(),metadataPath(fr,"en",null)),404,"RESOURCE_NOT_FOUND");
    }

    @Test void enrollmentParentsAndProtectedContentUseTheCanonicalAccessPolicy()throws Exception{
        var editor=account(true);var source=fixture(editor,"FREE",true);var owner=account(false);var module=publish(editor,create(editor,ResourceKind.MODULE,"PROTECTED",null,List.of(source.content().versionId())));var course=publish(editor,create(editor,ResourceKind.COURSE,"PROTECTED",null,List.of(module.versionId())));UUID enrollment=learning.enroll(owner.id(),owner.id(),new EnrollCourse(course.resourceId(),course.versionId(),"fr")).value().summary().id();
        var allowed=mutate(owner,"POST",playbackPath(source),context(source,"fr",enrollment),null);assertThat(allowed.statusCode()).isEqualTo(200);archive(editor,module);assertProblem(mutate(owner,"POST",playbackPath(source),context(source,"fr",enrollment),null),404,"RESOURCE_NOT_FOUND");
        var protectedVideo=fixture(editor,"PROTECTED",true);assertProblem(mutate(owner,"POST",playbackPath(protectedVideo),context(protectedVideo,"fr",null),null),403,"ACCESS_DENIED");
        var optional=create(editor,ResourceKind.ACTIVITY,"FREE",UUID.randomUUID(),List.of());assertThat(editorial.readiness(editor.id(),optional.id()).ready()).isTrue();
    }

    @Test void explicitJdbcCliImportsAfterCmsCreationAndReexecutionPreservesTheRegisteredMedia()throws Exception{
        var editor=account(true);UUID id=UUID.randomUUID();var draft=create(editor,ResourceKind.ACTIVITY,"FREE",id,List.of(),true);assertThat(editorial.readiness(editor.id(),draft.id()).ready()).isFalse();Path directory=Files.createTempDirectory(ROOT,"manifest-");Files.copy(CLIP,directory.resolve("flower.mp4"));Path manifest=directory.resolve("manifest.json");
        var entry=Map.of("id",id,"resourceId",draft.resourceId(),"versionId",draft.versionId(),"locale","fr","file","flower.mp4");Files.writeString(manifest,mapper.writeValueAsString(Map.of("actorId",editor.id(),"items",List.of(entry))));
        assertThat(importCli(manifest)).isZero();assertThat(importCli(manifest)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM video_media WHERE id=?",Integer.class,id)).isEqualTo(1);assertThat(registry.find(id).orElseThrow().sha256()).isEqualTo(HASH);assertThat(publish(editor,draft).state()).isEqualTo(EditorialState.PUBLISHED);
        var forbidden=Map.of("id",UUID.randomUUID(),"resourceId",draft.resourceId(),"versionId",draft.versionId(),"locale","fr","file","../flower.mp4");Files.writeString(manifest,mapper.writeValueAsString(Map.of("actorId",editor.id(),"items",List.of(forbidden))));assertThat(importCli(manifest)).isEqualTo(2);
    }

    private Fixture fixture(Account editor,String access,boolean required)throws Exception{UUID id=UUID.randomUUID();var source=create(editor,ResourceKind.ACTIVITY,access,id,List.of(),required);registry.register(editor.id(),id,source.resourceId(),source.versionId(),"fr",CLIP,"Description de la fixture technique MDN, pas un cours produit.","WEBVTT\n\n00:00.000 --> 00:05.000\nFixture vidéo technique MDN.\n");return new Fixture(publish(editor,source),id);}
    private ContentView create(Account editor,ResourceKind kind,String access,UUID media,List<UUID> children){return create(editor,kind,access,media,children,false);}
    private ContentView create(Account editor,ResourceKind kind,String access,UUID media,List<UUID> children,boolean required){return editorial.create(editor.id(),new CreateContent(kind,"fr",unique(),"Fixture vidéo technique","Données de test isolées, sans offre commerciale","Comprendre le dossier","Contrôles déclaratifs",document(kind,access,media,required),children,"Fixture vidéo P10"));}
    private static ContentDocument document(ResourceKind kind,String access,UUID media,boolean required){boolean activity=kind==ResourceKind.ACTIVITY;return new ContentDocument("Comprendre le dossier fourni.","Une proposition à vérifier.",List.of(),List.of(new ContentBlock("PARAGRAPH","Texte utile même sans vidéo. Fixture technique uniquement.",null)),null,activity?new Exercise("Distinguer faits et inconnues.","Corrigé textuel de test."):null,List.of(),activity?List.of(new RubricCriterion("facts","Aucun fait inventé",1,false)):List.of(),access,media==null?List.of():List.of(new MediaReference(media,"VIDEO",required,"Clip technique MDN, pas une vidéo de cours")),List.of());}
    private ContentView publish(Account editor,ContentView input){var current=editorial.get(editor.id(),input.id());if(current.state()==EditorialState.DRAFT||current.state()==EditorialState.STALE)current=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.TO_REVIEW,"Review fixture",null));UUID source=current.sourceTranslationId()==null?null:editorial.get(editor.id(),current.sourceTranslationId()).currentRevisionId();var ready=editorial.transition(editor.id(),current.id(),tag(current),new TransitionContent(EditorialState.READY,"Review exact source",source));return editorial.publish(editor.id(),ready.id(),tag(ready),new PublishContent(ready.currentRevisionId(),"Explicit fixture publication"));}
    private void archive(Account editor,ContentView source){var current=editorial.get(editor.id(),source.id());editorial.archive(editor.id(),current.id(),tag(current),new ArchiveContent("Withdraw fixture"));}
    private int importCli(Path manifest)throws Exception{Path java=Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").toLowerCase().contains("win")?"java.exe":"java");var builder=new ProcessBuilder(java.toString(),"-cp",System.getProperty("java.class.path"),"com.chatgptcourses.media.importing.LocalVideoImportMain",manifest.toString()).redirectErrorStream(true);var env=builder.environment();env.put("APP_ENV","test");env.put("VIDEO_ENABLED","true");env.put("VIDEO_PROVIDER","local-test");env.put("VIDEO_LOCAL_ROOT",ROOT.toString());env.put("POSTGRES_HOST",POSTGRES.getHost());env.put("POSTGRES_PORT",POSTGRES.getMappedPort(5432).toString());env.put("POSTGRES_DB",POSTGRES.getDatabaseName());env.put("POSTGRES_USER",POSTGRES.getUsername());env.put("POSTGRES_PASSWORD",POSTGRES.getPassword());var process=builder.start();assertThat(process.waitFor(15,TimeUnit.SECONDS)).as("local JDBC import terminates without an application server").isTrue();String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertThat(output.contains(POSTGRES.getPassword())).as("CLI output excludes DB secret").isFalse();return process.exitValue();}
    private static Map<String,Object> context(Fixture source,String locale,UUID enrollment){var value=new java.util.LinkedHashMap<String,Object>();value.put("resourceId",source.content().resourceId());value.put("versionId",source.content().versionId());value.put("locale",locale);value.put("enrollmentId",enrollment);return value;}
    private static Map<String,Object> position(Fixture source,String locale,double seconds,UUID enrollment){return Map.of("context",context(source,locale,enrollment),"positionSeconds",seconds);}
    private static String query(Fixture source,String locale,UUID enrollment){return "?resourceId="+source.content().resourceId()+"&versionId="+source.content().versionId()+"&locale="+locale+(enrollment==null?"":"&enrollmentId="+enrollment);}
    private static String metadataPath(Fixture source,String locale,UUID enrollment){return "/api/v1/media/"+source.mediaId()+query(source,locale,enrollment);}
    private static String playbackPath(Fixture source){return "/api/v1/media/"+source.mediaId()+"/playback-access";}
    private static String progressPath(Fixture source){return "/api/v1/me/media-progress/"+source.mediaId();}
    private Account account(boolean editor)throws Exception{var browser=browser();String email=unique()+"@courses.invalid",password=unique()+"-test-password";var created=send(browser,"POST","/api/v1/auth/register",Map.of("email",email,"password",password,"locale","fr"),csrf(browser),null,null);assertThat(created.statusCode()).isEqualTo(201);UUID id=UUID.fromString(text(created,"id"));if(editor)jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'",UUID.randomUUID(),id);login(browser,email,password);return new Account(browser,id,email,password);}
    private void login(Browser browser,String email,String password)throws Exception{var request=HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf(browser)).POST(HttpRequest.BodyPublishers.ofString("email="+URLEncoder.encode(email,StandardCharsets.UTF_8)+"&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build();assertThat(browser.http().send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);}
    private String csrf(Browser browser)throws Exception{return text(get(browser,"/api/v1/auth/csrf"),"token");}
    private HttpResponse<String> mutate(Account account,String method,String path,Object body,String tag)throws Exception{return send(account.browser(),method,path,body,csrf(account.browser()),account.id().toString(),tag);}
    private HttpResponse<String> send(Browser browser,String method,String path,Object body,String token,String actor,String tag)throws Exception{return browser.http().send(request(method,path,body,token,actor,tag),HttpResponse.BodyHandlers.ofString());}
    private HttpRequest request(String method,String path,Object body,String token,String actor,String tag)throws Exception{var request=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));if(body!=null)request.header("Content-Type","application/json");if(token!=null)request.header("X-CSRF-TOKEN",token);if(actor!=null)request.header("X-Account-Context",actor);if(tag!=null)request.header("If-Match",tag);return request.build();}
    private HttpResponse<String> get(Browser browser,String path)throws Exception{return browser.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    private HttpResponse<byte[]> stream(String path,String range,String method)throws Exception{var request=HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).method(method,HttpRequest.BodyPublishers.noBody());if(range!=null)request.header("Range",range);return HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofByteArray());}
    private JsonNode tree(HttpResponse<String> response)throws Exception{return mapper.readTree(response.body());}
    private String text(HttpResponse<String> response,String key)throws Exception{return tree(response).path(key).asText();}
    private void assertProblem(HttpResponse<String> response,int status,String code)throws Exception{assertThat(response.statusCode()).isEqualTo(status);assertThat(tree(response).path("code").asText()).isEqualTo(code);assertThat(tree(response).path("type").asText()).isEqualTo("about:blank");assertThat(response.headers().firstValue("Cache-Control")).hasValue("private, no-store");assertThat(tree(response).path("instance").asText().contains("?")).isFalse();}
    private URI uri(String path){return URI.create("http://127.0.0.1:"+port+path);}
    private static String etag(HttpResponse<?> response){return response.headers().firstValue("ETag").orElseThrow();}
    private static String tag(ContentView content){return EntityTags.forRevision("content",content.id(),content.revision());}
    private static String unique(){return "p10-video-"+UUID.randomUUID();}
    private static Browser browser(){return new Browser(HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build());}
    private static Path temporary(){try{return Files.createTempDirectory("courses-media-test-").toRealPath();}catch(java.io.IOException failure){throw new IllegalStateException("Cannot create isolated media test directory");}}
    @AfterAll static void clean()throws Exception{Path actual=ROOT.toRealPath(),temporary=Path.of(System.getProperty("java.io.tmpdir")).toRealPath();if(!actual.startsWith(temporary)||!actual.getFileName().toString().startsWith("courses-media-test-"))throw new IllegalStateException("Unsafe media fixture cleanup target");try(var paths=Files.walk(actual)){for(Path file:paths.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(file);}}
    private record Browser(HttpClient http){ }
    private record Account(Browser browser,UUID id,String email,String password){@Override public String toString(){return "Account[redacted]";}}
    private record Fixture(ContentView content,UUID mediaId){ }
}
