package com.chatgptcourses.operations;

import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Private object backup only; no Spring, business mutation, deletion or public URL. */
public final class ObjectSnapshotMain {
    private static final long MANIFEST_LIMIT = 16L * 1024 * 1024;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final Set<String> ROLES = Set.of("EDITORIAL", "PRIVATE");
    private ObjectSnapshotMain() { }

    public static void main(String[] args) {
        try {
            if (args.length != 2 || !Set.of("export", "restore").contains(args[0])) throw new IllegalArgumentException();
            var settings = Settings.read(System.getenv());
            Path directory = Path.of(args[1]).toAbsolutePath().normalize();
            if (!directory.startsWith(Path.of("/backup"))) throw new IllegalArgumentException();
            var mapper = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
            try (var s3 = S3Client.builder().endpointOverride(settings.endpoint()).region(Region.of(settings.region()))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.accessKey(), settings.secretKey())))
                    .forcePathStyle(settings.pathStyle()).httpClientBuilder(UrlConnectionHttpClient.builder()
                            .connectionTimeout(Duration.ofSeconds(5)).socketTimeout(Duration.ofSeconds(60)))
                    .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofMinutes(10)).apiCallAttemptTimeout(Duration.ofMinutes(5))).build()) {
                var result = args[0].equals("export") ? exportObjects(s3, settings, directory, mapper) : restoreObjects(s3, settings, directory, mapper);
                System.out.println(mapper.writeValueAsString(result));
            }
        } catch (Exception unavailable) {
            // Object keys, endpoint, provider payloads and credentials stay out of logs.
            System.err.println("OBJECT_SNAPSHOT_FAILED"); System.exit(1);
        }
    }

    private static Receipt exportObjects(S3Client s3, Settings settings, Path directory, ObjectMapper mapper) throws Exception {
        if (!Files.exists(directory)) {
            Path existing = directory.getParent();
            while (existing != null && !Files.exists(existing)) existing = existing.getParent();
            if (existing == null || !Files.isDirectory(existing, LinkOption.NOFOLLOW_LINKS) || !existing.equals(existing.toRealPath())) throw new IllegalArgumentException();
            Files.createDirectories(directory);
        }
        safeDirectory(directory);
        try (var files = Files.list(directory)) { if (files.findAny().isPresent()) throw new IllegalArgumentException(); }
        var entries = new ArrayList<Entry>();
        long total = 0;
        for (var bucket : settings.buckets()) {
            String token = null;
            do {
                var listed = s3.listObjectsV2(ListObjectsV2Request.builder().bucket(bucket.name()).continuationToken(token)
                        .maxKeys(Math.min(1000, settings.maxObjects() - entries.size() + 1)).build());
                for (var object : listed.contents()) {
                    if (entries.size() >= settings.maxObjects() || object.size() == null || object.size() < 0 || object.size() > settings.maxBytes() - total) throw new IllegalArgumentException();
                    String filename = "%06d.bin".formatted(entries.size() + 1);
                    Path output = directory.resolve(filename);
                    var request = GetObjectRequest.builder().bucket(bucket.name()).key(object.key()).ifMatch(object.eTag()).build();
                    Digest digest;
                    String type, disposition;
                    try (var input = s3.getObject(request); var bytes = Files.newOutputStream(output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                        type = input.response().contentType(); disposition = input.response().contentDisposition();
                        var sha = MessageDigest.getInstance("SHA-256"); long size = 0; byte[] buffer = new byte[BUFFER_SIZE]; int length;
                        while ((length = input.read(buffer)) != -1) {
                            if (length == 0) continue;
                            if (length > settings.maxBytes() - total - size || length > object.size() - size) throw new IllegalArgumentException();
                            size += length; sha.update(buffer, 0, length); bytes.write(buffer, 0, length);
                        }
                        if (size != object.size()) throw new IllegalArgumentException();
                        digest = new Digest(size, HexFormat.of().formatHex(sha.digest()));
                    }
                    entries.add(new Entry(bucket.role(), object.key(), filename, digest.bytes(), digest.sha256(), type, disposition));
                    total += digest.bytes();
                }
                token = Boolean.TRUE.equals(listed.isTruncated()) ? listed.nextContinuationToken() : null;
                if (Boolean.TRUE.equals(listed.isTruncated()) && (token == null || token.isBlank())) throw new IllegalArgumentException();
            } while (token != null);
        }
        var manifest = new Manifest(1, Instant.now().toString(), canonicalEndpoint(settings.endpoint()), settings.buckets(), List.copyOf(entries), total);
        validateManifest(manifest, settings);
        byte[] encoded = mapper.writeValueAsBytes(manifest);
        if (encoded.length > MANIFEST_LIMIT) throw new IllegalArgumentException();
        // No complete manifest is published until every streamed file is verified.
        Files.write(directory.resolve("manifest.json"), encoded, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        return new Receipt("exported", entries.size(), total, hash(encoded));
    }

    private static Receipt restoreObjects(S3Client s3, Settings settings, Path directory, ObjectMapper mapper) throws Exception {
        safeDirectory(directory);
        Path manifestPath = directory.resolve("manifest.json"); safeFile(manifestPath);
        if (Files.size(manifestPath) < 2 || Files.size(manifestPath) > MANIFEST_LIMIT) throw new IllegalArgumentException();
        byte[] encoded = Files.readAllBytes(manifestPath);
        var manifest = mapper.readValue(encoded, Manifest.class); validateManifest(manifest, settings);
        var sources = new HashSet<String>(); for (var bucket : manifest.buckets()) sources.add(bucket.name());
        if (settings.preserveBucketNames()) {
            if (!settings.restoreTargetConfirmed() || manifest.sourceEndpoint().equals(canonicalEndpoint(settings.endpoint()))) throw new IllegalArgumentException();
            for (var bucket : settings.buckets()) {
                if (manifest.buckets().stream().noneMatch(source -> source.role().equals(bucket.role()) && source.name().equals(bucket.name()))) throw new IllegalArgumentException();
            }
        }
        for (var bucket : settings.buckets()) {
            if (!settings.preserveBucketNames() && sources.contains(bucket.name())) throw new IllegalArgumentException();
            requireEmpty(s3, bucket.name());
        }
        // Validate every path, byte count and hash before the first remote write.
        for (var entry : manifest.entries()) {
            var digest = digest(directory.resolve(entry.filename()), entry.sizeBytes());
            if (digest.bytes() != entry.sizeBytes() || !digest.sha256().equals(entry.sha256())) throw new IllegalArgumentException();
        }
        // Catch unexpected files (including symlinks) rather than silently restoring a subset.
        var expectedFiles = new HashSet<String>(); expectedFiles.add("manifest.json"); for (var entry : manifest.entries()) expectedFiles.add(entry.filename());
        try (var files = Files.list(directory)) { for (var file : files.toList()) if (!expectedFiles.contains(file.getFileName().toString())) throw new IllegalArgumentException(); }
        for (var bucket : settings.buckets()) requireEmpty(s3, bucket.name());
        for (var entry : manifest.entries()) {
            String bucket = settings.buckets().stream().filter(b -> b.role().equals(entry.role())).findFirst().orElseThrow().name();
            Path file = directory.resolve(entry.filename()); safeFile(file); if (Files.size(file) != entry.sizeBytes()) throw new IllegalArgumentException();
            s3.putObject(PutObjectRequest.builder().bucket(bucket).key(entry.key()).contentType(entry.contentType())
                    .contentDisposition(entry.contentDisposition()).contentLength(entry.sizeBytes()).ifNoneMatch("*").build(), RequestBody.fromFile(file));
        }
        return new Receipt("restored", manifest.entries().size(), manifest.totalBytes(), hash(encoded));
    }

    private static void validateManifest(Manifest manifest, Settings settings) {
        if (manifest == null || manifest.schemaVersion() != 1 || manifest.buckets() == null || manifest.buckets().size() != 2
                || manifest.entries() == null || manifest.entries().size() > settings.maxObjects() || manifest.totalBytes() < 0 || manifest.totalBytes() > settings.maxBytes()) throw new IllegalArgumentException();
        Instant.parse(manifest.createdAt());
        if (manifest.sourceEndpoint() == null || !manifest.sourceEndpoint().equals(canonicalEndpoint(URI.create(manifest.sourceEndpoint())))) throw new IllegalArgumentException();
        var roles = new HashSet<String>(); var names = new HashSet<String>();
        for (var bucket : manifest.buckets()) if (bucket == null || !ROLES.contains(bucket.role()) || !roles.add(bucket.role()) || !names.add(bucket.name()) || !bucketName(bucket.name())) throw new IllegalArgumentException();
        var filenames = new HashSet<String>(); var keys = new HashSet<String>(); long total = 0;
        for (var entry : manifest.entries()) {
            if (entry == null || !ROLES.contains(entry.role()) || entry.key() == null || entry.key().isEmpty() || entry.key().getBytes(StandardCharsets.UTF_8).length > 1024
                    || entry.filename() == null || !entry.filename().matches("[0-9]{6}\\.bin") || !filenames.add(entry.filename()) || !keys.add(entry.role() + "\0" + entry.key())
                    || entry.sizeBytes() < 0 || entry.sizeBytes() > settings.maxBytes() - total || entry.sha256() == null || !entry.sha256().matches("[a-f0-9]{64}")
                    || !header(entry.contentType(), 1024) || !header(entry.contentDisposition(), 4096)) throw new IllegalArgumentException();
            total += entry.sizeBytes();
        }
        if (total != manifest.totalBytes()) throw new IllegalArgumentException();
    }
    private static void requireEmpty(S3Client s3, String bucket) {
        s3.headBucket(b -> b.bucket(bucket));
        if (!s3.listObjectsV2(b -> b.bucket(bucket).maxKeys(1)).contents().isEmpty()) throw new IllegalArgumentException();
    }
    private static Digest digest(Path path, long expected) throws Exception {
        safeFile(path); if (Files.size(path) != expected) throw new IllegalArgumentException();
        var sha = MessageDigest.getInstance("SHA-256"); long count = 0; byte[] buffer = new byte[BUFFER_SIZE];
        try (InputStream input = Files.newInputStream(path)) { int length; while ((length = input.read(buffer)) != -1) { if (length == 0) continue; if (length > expected - count) throw new IllegalArgumentException(); count += length; sha.update(buffer, 0, length); } }
        return new Digest(count, HexFormat.of().formatHex(sha.digest()));
    }
    private static void safeDirectory(Path directory) throws Exception {
        if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS) || !directory.equals(directory.toRealPath())) throw new IllegalArgumentException();
    }
    private static void safeFile(Path file) { if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) throw new IllegalArgumentException(); }
    private static boolean header(String value, int max) { return value == null || (value.length() <= max && value.indexOf('\r') < 0 && value.indexOf('\n') < 0 && value.indexOf('\0') < 0); }
    private static String hash(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    private static boolean bucketName(String name) { return name != null && name.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"); }
    private static String canonicalEndpoint(URI value) {
        if (value.getHost() == null || !Set.of("http","https").contains(value.getScheme()) || value.getUserInfo() != null || value.getQuery() != null || value.getFragment() != null
                || (value.getPath() != null && !value.getPath().isEmpty() && !value.getPath().equals("/"))) throw new IllegalArgumentException();
        int port = value.getPort(); if ((port == 80 && value.getScheme().equals("http")) || (port == 443 && value.getScheme().equals("https"))) port = -1;
        try { return new URI(value.getScheme(), null, value.getHost().toLowerCase(java.util.Locale.ROOT), port, null, null, null).toString(); }
        catch (java.net.URISyntaxException invalid) { throw new IllegalArgumentException(); }
    }
    private record Bucket(String role, String name) { @Override public String toString() { return "SnapshotBucket[private]"; } }
    private record Entry(String role, String key, String filename, long sizeBytes, String sha256, String contentType, String contentDisposition) { @Override public String toString() { return "SnapshotEntry[private]"; } }
    private record Manifest(int schemaVersion, String createdAt, String sourceEndpoint, List<Bucket> buckets, List<Entry> entries, long totalBytes) { @Override public String toString() { return "SnapshotManifest[private]"; } }
    private record Receipt(String result, int objects, long bytes, String manifestSha256) { }
    private record Digest(long bytes, String sha256) { }
    private record Settings(URI endpoint, String region, String accessKey, String secretKey, boolean pathStyle, List<Bucket> buckets, int maxObjects, long maxBytes, boolean preserveBucketNames, boolean restoreTargetConfirmed) {
        static Settings read(Map<String, String> env) {
            if (!Set.of("test", "staging", "production").contains(required(env, "APP_ENV"))) throw new IllegalArgumentException();
            URI endpoint = URI.create(required(env, "S3_ENDPOINT"));
            boolean isolated = "test".equals(env.get("APP_ENV")) && "true".equals(env.get("ISOLATED_OBJECT_SNAPSHOT"));
            if (endpoint.getHost() == null || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
                    || !("https".equals(endpoint.getScheme()) || (isolated && "http".equals(endpoint.getScheme())))) throw new IllegalArgumentException();
            endpoint = URI.create(canonicalEndpoint(endpoint));
            String editorial = required(env, "S3_PUBLIC_BUCKET"), personal = required(env, "S3_PRIVATE_BUCKET");
            if (!bucketName(editorial) || !bucketName(personal) || editorial.equals(personal)) throw new IllegalArgumentException();
            int maxObjects = Integer.parseInt(env.getOrDefault("OBJECT_SNAPSHOT_MAX_OBJECTS", "10000"));
            long maxBytes = Long.parseLong(env.getOrDefault("OBJECT_SNAPSHOT_MAX_BYTES", "1073741824"));
            if (maxObjects < 1 || maxObjects > 100000 || maxBytes < 1 || maxBytes > 1099511627776L) throw new IllegalArgumentException();
            return new Settings(endpoint, env.getOrDefault("S3_REGION", "us-east-1"), required(env,"S3_ACCESS_KEY"), required(env,"S3_SECRET_KEY"), Boolean.parseBoolean(env.getOrDefault("S3_PATH_STYLE","true")),
                    List.of(new Bucket("EDITORIAL", editorial), new Bucket("PRIVATE", personal)), maxObjects, maxBytes,
                    "true".equals(env.get("OBJECT_RESTORE_PRESERVE_BUCKET_NAMES")), "true".equals(env.get("OBJECT_RESTORE_TARGET_CONFIRMED")));
        }
        @Override public String toString() { return "ObjectSnapshotSettings[redacted]"; }
    }
    private static String required(Map<String, String> env, String key) { String value = env.get(key); if (value == null || value.isBlank()) throw new IllegalArgumentException(); return value; }
}
