package com.chatgptcourses.operations;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/** Offline operation-state tests. These do not claim an observed SeaweedFS integration. */
class StagingStorageBootstrapTest {
    @Test void rejectsProductionLocalAndForeignOriginsBeforeOpeningAProvider() {
        var valid = environment();
        StagingStorageBootstrapMain.settings(valid);
        for (var change : List.of(Map.of("APP_ENV", "production"), Map.of("APP_ENV", "test"), Map.of("STAGING_INTEGRATIONS", "none"),
                Map.of("APP_PUBLIC_ORIGIN", "https://courses.example.org"), Map.of("S3_ENDPOINT", "https://foreign.example.org"),
                Map.of("S3_EXTERNAL_ENDPOINT", "http://files-staging.example.org"), Map.of("S3_EXTERNAL_ENDPOINT", "https://files-staging.foreign.org"),
                Map.of("S3_PRIVATE_BUCKET", "production-data"), Map.of("S3_PATH_STYLE", "false"), Map.of("S3_ACCESS_KEY", ""))) {
            var values = new HashMap<>(valid); values.putAll(change);
            expectFailure(() -> StagingStorageBootstrapMain.settings(values), "STAGING_STORAGE_CONFIGURATION_INVALID");
        }
    }
    @Test void replayKeepsPrivateCorsAndExistingObjectsWithoutDuplicatingBuckets() {
        var remote = new Remote(); String editorial = StagingStorageBootstrapMain.BUCKETS.getFirst();
        remote.buckets.add(editorial); remote.objects.put(editorial + "/existing", new Stored(new byte[]{1, 2, 3}, Map.of()));
        var settings = StagingStorageBootstrapMain.settings(environment());
        int[] anonymous = {0};
        StagingStorageBootstrapMain.AnonymousGet denied = (bucket, key) -> {
            check(remote.objects.containsKey(bucket + "/" + key), "PROBE_MUST_EXIST_BEFORE_UNSIGNED_GET"); anonymous[0]++; return 403;
        };
        StagingStorageBootstrapMain.apply(settings, remote.client(), denied);
        StagingStorageBootstrapMain.apply(settings, remote.client(), denied);
        check(remote.created == 1 && remote.buckets.size() == 2, "REPLAY_MUST_NOT_DUPLICATE_BUCKETS");
        check(remote.corsWrites == 2 && anonymous[0] == 4, "REPLAY_MUST_REVERIFY_WITHOUT_REWRITING_CORS");
        check(remote.objects.size() == 1 && Arrays.equals(remote.objects.get(editorial + "/existing").bytes(), new byte[]{1, 2, 3}), "EXISTING_OBJECT_MUST_REMAIN_UNCHANGED");
        for (var rules : remote.cors.values()) check(rules.size() == 1 && rules.getFirst().allowedOrigins().equals(List.of("https://staging.example.org")), "CORS_MUST_ONLY_ALLOW_THE_STAGING_APP");
    }
    @Test void publicProbeOrAmbiguousProviderFailureRestoresCorsAndNeverDeletesExistingObjects() {
        for (boolean providerFailure : List.of(false, true)) {
            var remote = new Remote(); var previous = List.of(CORSRule.builder().allowedOrigins("https://previous.example.org").allowedMethods("GET").build());
            for (String bucket : StagingStorageBootstrapMain.BUCKETS) { remote.buckets.add(bucket); remote.cors.put(bucket, previous); remote.objects.put(bucket + "/existing", new Stored(new byte[]{4, 5}, Map.of())); }
            remote.failCorsWrite = providerFailure ? 2 : -1;
            expectFailure(() -> StagingStorageBootstrapMain.apply(StagingStorageBootstrapMain.settings(environment()), remote.client(), (bucket, key) -> providerFailure ? 403 : 200),
                    providerFailure ? "STAGING_STORAGE_PROVIDER_FAILED" : "STAGING_STORAGE_ANONYMOUS_ACCESS_NOT_DENIED");
            check(remote.buckets.size() == 2 && remote.objects.size() == 2, "ROLLBACK_MUST_KEEP_EXISTING_BUCKETS_AND_FILES");
            for (String bucket : StagingStorageBootstrapMain.BUCKETS) {
                check(remote.cors.get(bucket).equals(previous), "PREVIOUS_CORS_MUST_BE_RESTORED");
                check(Arrays.equals(remote.objects.get(bucket + "/existing").bytes(), new byte[]{4, 5}), "PREVIOUS_FILE_BYTES_MUST_REMAIN");
            }
        }
    }
    private static Map<String, String> environment() {
        return Map.ofEntries(Map.entry("APP_ENV", "staging"), Map.entry("STAGING_INTEGRATIONS", "mailpit-s3"), Map.entry("APP_PUBLIC_ORIGIN", "https://staging.example.org"),
                Map.entry("S3_ENDPOINT", "http://s3:8333"), Map.entry("S3_EXTERNAL_ENDPOINT", "https://files-staging.example.org"), Map.entry("S3_REGION", "us-east-1"), Map.entry("S3_PATH_STYLE", "true"),
                Map.entry("S3_PUBLIC_BUCKET", "courses-editorial-staging"), Map.entry("S3_PRIVATE_BUCKET", "courses-private-staging"), Map.entry("S3_ACCESS_KEY", "a".repeat(48)), Map.entry("S3_SECRET_KEY", "b".repeat(64)));
    }
    private static void expectFailure(Runnable action, String code) {
        try { action.run(); } catch (StagingStorageBootstrapMain.BootstrapFailure failure) { check(code.equals(failure.code), "STABLE_FAILURE_CODE_REQUIRED"); return; }
        throw new AssertionError("FAILURE_REQUIRED");
    }
    private static void check(boolean value, String code) { if (!value) throw new AssertionError(code); }
    private record Stored(byte[] bytes, Map<String, String> metadata) { @Override public String toString() { return "SyntheticStoredObject[redacted]"; } }
    private static final class Remote implements InvocationHandler {
        final Set<String> buckets = new HashSet<>(); final Map<String, List<CORSRule>> cors = new HashMap<>(); final Map<String, Stored> objects = new HashMap<>();
        int created, corsWrites, failCorsWrite = -1;
        S3Client client() { return (S3Client) Proxy.newProxyInstance(S3Client.class.getClassLoader(), new Class<?>[]{S3Client.class}, this); }
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if (method.isDefault() && args != null && args.length > 0 && args[0] instanceof java.util.function.Consumer<?>) return InvocationHandler.invokeDefault(proxy, method, args);
            return switch (method.getName()) {
                case "headBucket" -> { var request = (HeadBucketRequest) args[0]; if (!buckets.contains(request.bucket())) throw s3(404); yield HeadBucketResponse.builder().build(); }
                case "createBucket" -> { var request = (CreateBucketRequest) args[0]; if (buckets.add(request.bucket())) created++; yield CreateBucketResponse.builder().build(); }
                case "getBucketCors" -> { var request = (GetBucketCorsRequest) args[0]; if (!cors.containsKey(request.bucket())) throw s3(404); yield GetBucketCorsResponse.builder().corsRules(cors.get(request.bucket())).build(); }
                case "putBucketCors" -> { var request = (PutBucketCorsRequest) args[0]; cors.put(request.bucket(), List.copyOf(request.corsConfiguration().corsRules())); if (++corsWrites == failCorsWrite) throw s3(503); yield PutBucketCorsResponse.builder().build(); }
                case "deleteBucketCors" -> { cors.remove(((DeleteBucketCorsRequest) args[0]).bucket()); yield DeleteBucketCorsResponse.builder().build(); }
                case "putObject" -> { var request = (PutObjectRequest) args[0]; check("*".equals(request.ifNoneMatch()), "PROBE_MUST_NOT_OVERWRITE"); String key = request.bucket() + "/" + request.key(); if (objects.containsKey(key)) throw s3(412); try (var bytes = ((RequestBody) args[1]).contentStreamProvider().newStream()) { objects.put(key, new Stored(bytes.readAllBytes(), Map.copyOf(request.metadata()))); } yield PutObjectResponse.builder().build(); }
                case "headObject" -> { var request = (HeadObjectRequest) args[0]; var object = objects.get(request.bucket() + "/" + request.key()); if (object == null) throw s3(404); yield HeadObjectResponse.builder().contentLength((long) object.bytes().length).metadata(object.metadata()).build(); }
                case "deleteObject" -> { var request = (DeleteObjectRequest) args[0]; objects.remove(request.bucket() + "/" + request.key()); yield DeleteObjectResponse.builder().build(); }
                case "close" -> null;
                case "serviceName" -> "s3";
                case "toString" -> "ControlledS3Port[redacted]";
                default -> throw new AssertionError("UNEXPECTED_CONTROLLED_S3_OPERATION");
            };
        }
        private static S3Exception s3(int status) { return (S3Exception) S3Exception.builder().statusCode(status).message("Controlled provider failure").build(); }
    }
}
