import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Local P20 fixture transport only. Never reads environment credentials or starts Spring. */
public final class P20S3Fixture {
    private static final byte[] EDITORIAL = "# P20 — fixture éditoriale\nOctets fictifs, sans donnée privée.\n".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PRIVATE = new byte[]{0, 1, 2, 3, 10, 13, 31, 32, 64, 65, 90, 127, -128, -127, -2, -1};
    private P20S3Fixture() { }

    public static void main(String[] args) {
        // Fixed, public configuration suppresses SDK request/header logging before SDK initialization.
        Path logging = Path.of("scripts/container/cli-logback.xml").toAbsolutePath();
        if (!Files.isRegularFile(logging, LinkOption.NOFOLLOW_LINKS) || !Files.isReadable(logging)) {
            System.err.println("{\"code\":\"P20_S3_FIXTURE_FAILED\"}"); System.exit(1); return;
        }
        System.setProperty("logback.configurationFile", logging.toString());
        try {
            Path file = null; String mode = null;
            for (int i=0; i<args.length; i++) {
                if (args[i].equals("--config") && file == null && ++i < args.length) file = Path.of(args[i]);
                else if (args[i].equals("--mode") && mode == null && ++i < args.length) mode = args[i];
                else throw new IllegalArgumentException();
            }
            if (file == null || mode == null || !Set.of("seed", "prepare", "verify", "empty").contains(mode)) throw new IllegalArgumentException();
            file = file.toAbsolutePath().normalize();
            Path workspace = Path.of(".runtime").toAbsolutePath().normalize();
            if (!file.startsWith(workspace) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > 8192) throw new IllegalArgumentException();
            var mapper = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
            var config = mapper.readValue(Files.readAllBytes(file), Config.class); validate(config);
            var fixtures = List.of(
                    new Fixture("EDITORIAL", config.buckets().get(0), "p20/fixtures/editorial.md", EDITORIAL, "text/plain", "attachment; filename=\"p20-editorial.md\""),
                    new Fixture("PRIVATE", config.buckets().get(1), "p20/fixtures/private.bin", PRIVATE, "application/octet-stream", "attachment; filename=\"p20-private.bin\""));
            try (var client = S3Client.builder().endpointOverride(URI.create(config.endpoint())).region(Region.US_EAST_1)
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(config.accessKey(), config.secretKey())))
                    .forcePathStyle(true).httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(5)))
                    .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(20)).apiCallAttemptTimeout(Duration.ofSeconds(8))).build()) {
                if (mode.equals("seed") || mode.equals("prepare")) {
                    for (String bucket : config.buckets()) {
                        try { client.headBucket(b -> b.bucket(bucket)); }
                        catch (S3Exception missing) { if (missing.statusCode() != 404) throw missing; client.createBucket(b -> b.bucket(bucket)); }
                    }
                    for (String bucket : config.buckets()) requireEmpty(client, bucket);
                    if (mode.equals("seed")) for (var fixture : fixtures) client.putObject(PutObjectRequest.builder().bucket(fixture.bucket()).key(fixture.key())
                            .contentType(fixture.type()).contentDisposition(fixture.disposition()).contentLength((long) fixture.bytes().length).ifNoneMatch("*").build(), RequestBody.fromBytes(fixture.bytes()));
                }
                if (mode.equals("empty") || mode.equals("prepare")) {
                    for (String bucket : config.buckets()) requireEmpty(client, bucket);
                    System.out.println(mapper.writeValueAsString(Map.of("mode",mode,"objects",0,"bytes",0,"empty",true)));
                } else {
                    long total = 0; var hashes = new LinkedHashMap<String,String>();
                    for (var fixture : fixtures) {
                        var listed = client.listObjectsV2(b -> b.bucket(fixture.bucket()).maxKeys(3));
                        if (Boolean.TRUE.equals(listed.isTruncated()) || listed.contents().size()!=1 || !fixture.key().equals(listed.contents().getFirst().key())) throw new IllegalStateException();
                        try (var input = client.getObject(b -> b.bucket(fixture.bucket()).key(fixture.key()))) {
                            byte[] actual = input.readNBytes(fixture.bytes().length + 1);
                            if (!java.util.Arrays.equals(actual, fixture.bytes()) || input.response().contentLength() != actual.length
                                    || !fixture.type().equals(input.response().contentType()) || !fixture.disposition().equals(input.response().contentDisposition())) throw new IllegalStateException();
                            hashes.put(fixture.role(), HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(actual))); total += actual.length;
                        }
                    }
                    System.out.println(mapper.writeValueAsString(Map.of("mode",mode,"objects",2,"bytes",total,"sha256ByRole",hashes,"metadataVerified",true)));
                }
            }
        } catch (S3Exception unavailable) {
            int status = unavailable.statusCode();
            System.err.println("{\"code\":\"P20_S3_FIXTURE_FAILED\",\"httpStatus\":"+(status >= 100 && status <= 599 ? status : 0)+"}"); System.exit(1);
        } catch (Exception invalid) {
            System.err.println("{\"code\":\"P20_S3_FIXTURE_FAILED\"}"); System.exit(1);
        }
    }
    private static void validate(Config config) {
        if (config == null || config.endpoint()==null || config.accessKey()==null || config.accessKey().isBlank() || config.secretKey()==null || config.secretKey().isBlank()
                || config.buckets()==null || config.buckets().size()!=2 || config.buckets().get(0).equals(config.buckets().get(1))) throw new IllegalArgumentException();
        URI endpoint = URI.create(config.endpoint());
        if (!"http".equals(endpoint.getScheme()) || !"127.0.0.1".equals(endpoint.getHost()) || endpoint.getPort()<1 || endpoint.getPort()>65535
                || endpoint.getUserInfo()!=null || endpoint.getQuery()!=null || endpoint.getFragment()!=null || (endpoint.getPath()!=null && !endpoint.getPath().isEmpty() && !endpoint.getPath().equals("/"))) throw new IllegalArgumentException();
        for (String bucket : config.buckets()) if (bucket == null || !bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")) throw new IllegalArgumentException();
    }
    private static void requireEmpty(S3Client client, String bucket) {
        client.headBucket(b -> b.bucket(bucket));
        if (!client.listObjectsV2(b -> b.bucket(bucket).maxKeys(1)).contents().isEmpty()) throw new IllegalStateException();
    }
    private record Config(String endpoint, String accessKey, String secretKey, List<String> buckets) { @Override public String toString() { return "P20S3Config[redacted]"; } }
    private record Fixture(String role, String bucket, String key, byte[] bytes, String type, String disposition) { @Override public String toString() { return "P20S3Fixture[private]"; } }
}
