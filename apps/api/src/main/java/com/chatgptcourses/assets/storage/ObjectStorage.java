package com.chatgptcourses.assets.storage;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/** Locations originate in the registry, never in a browser command. */
public interface ObjectStorage {
    record Location(String bucket,String key) { @Override public String toString(){return "ObjectLocation[redacted]";} }
    record Metadata(long sizeBytes,String contentType) { }
    /** Deadline encoded in the signature; a consumer must not start a new TTL after signing. */
    record SignedRequest(String url,Map<String,String> headers,Instant expiresAt) {
        public SignedRequest{java.util.Objects.requireNonNull(expiresAt,"Signed expiration is required");}
        @Override public String toString(){return "SignedRequest[redacted]";}
    }
    Optional<Metadata> head(Location location);
    byte[] read(Location location,long maximumBytes);
    void put(Location location,byte[] bytes,String contentType,String disposition);
    SignedRequest presignPut(Location location,String contentType,long expectedBytes,Duration ttl);
    SignedRequest presignGet(Location location,String contentType,String disposition,Duration ttl);
    void deleteStaging(Location location);
}
