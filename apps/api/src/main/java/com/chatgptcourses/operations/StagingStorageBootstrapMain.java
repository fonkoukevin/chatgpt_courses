package com.chatgptcourses.operations;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CORSRule;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Explicit operator command for the isolated shared-staging store. No Spring, SQL or application seed. */
public final class StagingStorageBootstrapMain {
    static final List<String> BUCKETS = List.of("courses-editorial-staging", "courses-private-staging");
    private static final byte[] PROBE = "Synthetic staging access probe\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    private StagingStorageBootstrapMain() { }
    public static void main(String[] args) {
        try {
            if (args.length != 0) throw failure("STAGING_STORAGE_CONFIGURATION_INVALID");
            initialize(System.getenv());
            System.out.println("{\"result\":\"ready\",\"buckets\":2,\"corsVerified\":true,\"unsignedInternalGetDenied\":true,\"externalHttpsProbed\":false}");
        } catch (Exception error) {
            System.err.println(error instanceof BootstrapFailure known ? known.code : "STAGING_STORAGE_BOOTSTRAP_FAILED");
            System.exit(1);
        }
    }
    public static void initialize(Map<String, String> environment) {
        var settings = settings(environment);
        try (var client = S3Client.builder().endpointOverride(settings.internal()).region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.access(), settings.secret())))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10)))
                .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(15))).build();
             var anonymous = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build()) {
            apply(settings, client, (bucket, key) -> {
                try {
                    var request = HttpRequest.newBuilder(settings.internal().resolve("/" + bucket + "/" + key)).timeout(Duration.ofSeconds(5)).GET().build();
                    return anonymous.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt(); throw failure("STAGING_STORAGE_PROBE_FAILED");
                } catch (java.io.IOException unavailable) { throw failure("STAGING_STORAGE_PROBE_FAILED"); }
            });
        }
    }
    static Settings settings(Map<String, String> values) {
        check("staging".equals(values.get("APP_ENV")) && "mailpit-s3".equals(values.get("STAGING_INTEGRATIONS")));
        check("http://s3:8333".equals(values.get("S3_ENDPOINT")) && "us-east-1".equals(values.get("S3_REGION")) && "true".equals(values.get("S3_PATH_STYLE")));
        check(BUCKETS.get(0).equals(values.get("S3_PUBLIC_BUCKET")) && BUCKETS.get(1).equals(values.get("S3_PRIVATE_BUCKET")));
        URI origin = https(values.get("APP_PUBLIC_ORIGIN")), files = https(values.get("S3_EXTERNAL_ENDPOINT"));
        check(origin.getHost().startsWith("staging.") && !origin.getHost().equals(files.getHost()) && files.getHost().equals("files-staging." + origin.getHost().substring(origin.getHost().indexOf('.') + 1)));
        String access = credential(values.get("S3_ACCESS_KEY")), secret = credential(values.get("S3_SECRET_KEY"));
        return new Settings(URI.create("http://s3:8333"), origin.toString(), access, secret);
    }
    static void apply(Settings settings, S3Client client, AnonymousGet anonymous) {
        var desired = List.of(CORSRule.builder().allowedOrigins(settings.origin()).allowedMethods("GET", "PUT", "HEAD")
                .allowedHeaders("Content-Type").exposeHeaders("ETag").maxAgeSeconds(0).build());
        var changed = new ArrayList<CorsChange>(); var probes = new ArrayList<Probe>();
        RuntimeException problem = null;
        try {
            for (String bucket : BUCKETS) {
                try { client.headBucket(b -> b.bucket(bucket)); }
                catch (S3Exception missing) {
                    if (missing.statusCode() != 404) throw missing;
                    try { client.createBucket(b -> b.bucket(bucket)); }
                    catch (S3Exception race) { if (race.statusCode() != 409) throw race; }
                    client.headBucket(b -> b.bucket(bucket));
                }
                List<CORSRule> previous = cors(client, bucket);
                if (!sameCors(previous, desired)) {
                    changed.add(new CorsChange(bucket, previous));
                    client.putBucketCors(b -> b.bucket(bucket).corsConfiguration(c -> c.corsRules(desired)));
                }
                if (!sameCors(cors(client, bucket), desired)) throw failure("STAGING_STORAGE_CORS_NOT_VERIFIED");
                String marker = UUID.randomUUID().toString(), key = "bootstrap-check/" + marker;
                probes.add(new Probe(bucket, key, marker));
                client.putObject(b -> b.bucket(bucket).key(key).ifNoneMatch("*").contentType("application/octet-stream").contentDisposition("attachment").metadata(Map.of("staging-bootstrap", marker)), RequestBody.fromBytes(PROBE));
                var metadata = client.headObject(b -> b.bucket(bucket).key(key));
                if (!Objects.equals(metadata.contentLength(), (long) PROBE.length) || !marker.equals(metadata.metadata().get("staging-bootstrap"))) throw failure("STAGING_STORAGE_PROBE_FAILED");
                int status = anonymous.status(bucket, key);
                if (status != 401 && status != 403) throw failure("STAGING_STORAGE_ANONYMOUS_ACCESS_NOT_DENIED");
            }
        } catch (RuntimeException failed) { problem = failed; }
        boolean cleaned = true;
        for (var probe : probes) try {
            var metadata = client.headObject(b -> b.bucket(probe.bucket()).key(probe.key()));
            if (probe.marker().equals(metadata.metadata().get("staging-bootstrap"))) client.deleteObject(b -> b.bucket(probe.bucket()).key(probe.key()));
            else cleaned = false;
        } catch (S3Exception absent) { if (absent.statusCode() != 404) cleaned = false; }
        catch (RuntimeException failed) { cleaned = false; }
        if (problem != null || !cleaned) {
            boolean restored = true;
            for (int i = changed.size() - 1; i >= 0; i--) {
                var change = changed.get(i);
                try {
                    // Do not overwrite a different operator's intervening CORS change.
                    var current = cors(client, change.bucket());
                    if (sameCors(current, change.previous())) continue;
                    if (!sameCors(current, desired)) { restored = false; continue; }
                    if (change.previous().isEmpty()) client.deleteBucketCors(b -> b.bucket(change.bucket()));
                    else client.putBucketCors(b -> b.bucket(change.bucket()).corsConfiguration(c -> c.corsRules(change.previous())));
                    if (!sameCors(cors(client, change.bucket()), change.previous())) restored = false;
                } catch (RuntimeException failed) { restored = false; }
            }
            // Empty newly created private buckets are retained; no bucket or pre-existing object is deleted.
            if (!restored) throw failure("STAGING_STORAGE_ROLLBACK_INCOMPLETE");
            if (problem instanceof BootstrapFailure known) throw known;
            throw failure(cleaned ? "STAGING_STORAGE_PROVIDER_FAILED" : "STAGING_STORAGE_PROBE_CLEANUP_FAILED");
        }
    }
    private static List<CORSRule> cors(S3Client client, String bucket) {
        try { return client.getBucketCors(b -> b.bucket(bucket)).corsRules(); }
        catch (S3Exception absent) { if (absent.statusCode() == 404) return List.of(); throw absent; }
    }
    private static boolean sameCors(List<CORSRule> first, List<CORSRule> second) {
        return shapes(first).equals(shapes(second));
    }
    private static List<CorsShape> shapes(List<CORSRule> rules) {
        return rules.stream().map(r -> new CorsShape(sorted(r.allowedOrigins()), sorted(r.allowedMethods()), sorted(r.allowedHeaders()), sorted(r.exposeHeaders()), r.maxAgeSeconds()))
                .sorted(Comparator.comparing(CorsShape::toString)).toList();
    }
    private static List<String> sorted(List<String> values) { return values.stream().sorted().toList(); }
    private static URI https(String value) {
        try {
            var uri = URI.create(value);
            check("https".equals(uri.getScheme()) && uri.getHost() != null && uri.getHost().contains(".") && uri.getPort() == -1 && uri.getRawUserInfo() == null
                    && uri.getRawQuery() == null && uri.getRawFragment() == null && uri.getRawPath().isEmpty() && value.equals("https://" + uri.getHost())
                    && !uri.getHost().matches(".*\\.(invalid|example|localhost|test)$"));
            return uri;
        } catch (RuntimeException invalid) { throw failure("STAGING_STORAGE_CONFIGURATION_INVALID"); }
    }
    private static String credential(String value) { check(value != null && value.length() >= 24 && value.length() <= 512 && !value.contains("\n") && !value.contains("\r") && !value.contains("\0")); return value; }
    private static void check(boolean valid) { if (!valid) throw failure("STAGING_STORAGE_CONFIGURATION_INVALID"); }
    private static BootstrapFailure failure(String code) { return new BootstrapFailure(code); }
    record Settings(URI internal, String origin, String access, String secret) { @Override public String toString() { return "StagingStorageSettings[redacted]"; } }
    record CorsShape(List<String> origins, List<String> methods, List<String> headers, List<String> exposed, Integer maxAge) { }
    record CorsChange(String bucket, List<CORSRule> previous) { }
    record Probe(String bucket, String key, String marker) { @Override public String toString() { return "StagingStorageProbe[redacted]"; } }
    interface AnonymousGet { int status(String bucket, String key); }
    static final class BootstrapFailure extends RuntimeException {
        final String code;
        BootstrapFailure(String code) { super(code, null, false, false); this.code = code; }
    }
}
