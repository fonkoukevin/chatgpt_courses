package com.chatgptcourses;

import static org.junit.jupiter.api.Assertions.*;
import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.storage.ObjectStorage.Location;
import com.chatgptcourses.assets.storage.S3ObjectStorage;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import tools.jackson.databind.ObjectMapper;

/** Explicitly selected storage observation: timing is not a deterministic CI acceptance criterion.
 * No Spring, PostgreSQL, account, purchase or external provider. */
@Testcontainers
class S3PresignedExpiryObservation {
    private static final String ACCESS=UUID.randomUUID().toString().replace("-","");
    private static final String SECRET=UUID.randomUUID().toString()+UUID.randomUUID();
    private static final String AUTH="{\"identities\":[{\"name\":\"isolated-diagnostic\",\"credentials\":[{\"accessKey\":\""+ACCESS+"\",\"secretKey\":\""+SECRET+"\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Write\"]}]}";
    @Container static final GenericContainer<?> S3=new GenericContainer<>(DockerImageName.parse("chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59"))
        .withExposedPorts(8333).withTmpFs(Map.of("/data","rw"))
        .withCopyToContainer(Transferable.of(AUTH.getBytes(StandardCharsets.UTF_8),0444),"/run/secrets/s3.local.json")
        .withCommand("server","-dir=/data","-ip=127.0.0.1","-ip.bind=0.0.0.0","-master.volumeSizeLimitMB=64","-master.telemetry=false","-volume.max=24","-filer","-s3","-s3.port=8333","-s3.port.iceberg=0","-s3.port.lance=0","-s3.config=/run/secrets/s3.local.json")
        .waitingFor(Wait.forHttp("/healthz").forPort(8333).forStatusCode(200).withStartupTimeout(Duration.ofSeconds(90)));

    @Test void aSingleImmediateReadPrecedesAnExplicitExpiredReadWithoutRetry()throws Exception{
        var runtime=Path.of("../../.runtime").toAbsolutePath().normalize();Files.createDirectories(runtime);
        var output=Files.createTempDirectory(runtime,"access02-s3-");
        var endpoint=URI.create("http://"+S3.getHost()+":"+S3.getMappedPort(8333));
        var policy=new AssetStorageProperties(true,endpoint,endpoint,"us-east-1",ACCESS,SECRET,"isolated-editorial","isolated-private",true,
            4096,4096,1,4096,300,2,16_000_000,4096,0);
        try(var storage=new S3ObjectStorage(policy);var http=HttpClient.newHttpClient()){
            var location=new Location("isolated-private","private/"+UUID.randomUUID());
            try(var bootstrap=S3Client.builder().region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS,SECRET)))
                .endpointOverride(endpoint).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .httpClientBuilder(UrlConnectionHttpClient.builder()).build()){
                bootstrap.createBucket(b->b.bucket(location.bucket()));
                storage.put(location,"Isolated diagnostic fixture".getBytes(StandardCharsets.UTF_8),"text/plain","attachment");
            }catch(Exception unavailable){throw new AssertionError("Isolated storage preparation unavailable; provider details withheld");}
            var presignStartedAt=Instant.now();long presignStartedNanos=System.nanoTime();
            var signed=storage.presignGet(location,"text/plain","attachment",Duration.ofSeconds(2));
            long presignElapsedNanos=System.nanoTime()-presignStartedNanos;
            var linkReceivedAt=Instant.now();long linkReceivedNanos=System.nanoTime();
            var uri=URI.create(signed.url());
            var immediate=readOnce(http,uri,linkReceivedAt,linkReceivedNanos);
            var first=writeObservation(output,"01-immediate-read.json","IMMEDIATE_READ",200,immediate,uri,presignStartedAt,presignElapsedNanos);
            // Attempt persistence before assertion/cleanup; an unexpected status remains the first failure.
            assertEquals(200,immediate.status(),"Single immediate GET; no later success may replace a refusal");
            assertTrue(first.written(),"Safe immediate observation must be persisted for a passing result");
            assertTrue(Boolean.TRUE.equals(first.metadata().get("signatureTimesAvailable")),"Signing dates available as safe instants");
            var signedAt=Instant.parse((String)first.metadata().get("signedAt"));var expiresAt=Instant.parse((String)first.metadata().get("signedExpiresAt"));
            assertTrue(expiresAt.equals(signedAt.plusSeconds(2)),"Diagnostic retains the two-second TTL");
            long waitMillis=Math.max(0,Duration.between(Instant.now(),expiresAt.plusSeconds(1)).toMillis()+1);
            assertTrue(waitMillis<=5000,"Intentional expiry wait remains bounded");Thread.sleep(waitMillis);
            var expired=readOnce(http,uri,linkReceivedAt,linkReceivedNanos);
            var second=writeObservation(output,"02-intentional-expiry.json","INTENTIONAL_EXPIRY_PROBE",403,expired,uri,presignStartedAt,presignElapsedNanos);
            assertEquals(403,expired.status(),"One explicit read after expiry; never a retry of an immediate refusal");
            assertTrue(second.written(),"Safe expiry observation must be persisted for a passing result");
            assertTrue(Boolean.TRUE.equals(second.metadata().get("s3ExpiryIndicated")),"Only the exact known expiry code/message indicates expiration");
        }
    }

    private static Read readOnce(HttpClient client,URI signed,Instant linkReceivedAt,long linkReceivedNanos){
        var startedAt=Instant.now();long startedNanos=System.nanoTime();int status=0;String date=null;byte[] body=new byte[0];
        try{
            var response=client.send(HttpRequest.newBuilder(signed).timeout(Duration.ofSeconds(15)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
            status=response.statusCode();date=response.headers().firstValue("Date").orElse(null);body=response.body();
        }catch(Exception unavailable){/* A failed transport is status zero; never retain its URL or message. */}
        long finishedNanos=System.nanoTime();var finishedAt=Instant.now();
        return new Read(status,date,body,new PresignedDownloadDiagnostics.Timing(linkReceivedAt,startedAt,finishedAt,startedNanos-linkReceivedNanos,finishedNanos-startedNanos));
    }
    private static Observation writeObservation(Path output,String filename,String role,int expected,Read read,URI signed,Instant presignStartedAt,long presignElapsedNanos){
        var metadata=new LinkedHashMap<>(PresignedDownloadDiagnostics.collectObservation(read.status(),read.date(),read.body(),signed,read.timing()));
        metadata.put("captureContext","ISOLATED_STORAGE_DIAGNOSTIC");metadata.put("readRole",role);
        metadata.put("expectedHttpStatus",expected);metadata.put("statusExpected",read.status()==expected);
        metadata.put("presignStartedAt",presignStartedAt.toString());metadata.put("presignElapsedNanos",presignElapsedNanos);
        boolean written=false;
        try{Files.write(output.resolve(filename),new ObjectMapper().writeValueAsBytes(metadata),StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE);written=true;}
        catch(Exception unavailable){/* Preserve the status assertion; a success additionally requires durable metadata. */}
        return new Observation(Map.copyOf(metadata),written);
    }
    private record Observation(Map<String,Object> metadata,boolean written){}
    private record Read(int status,String date,byte[] body,PresignedDownloadDiagnostics.Timing timing){
        @Override public String toString(){return "IsolatedStorageRead[redacted]";}
    }
}
