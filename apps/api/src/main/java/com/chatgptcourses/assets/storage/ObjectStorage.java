package com.chatgptcourses.assets.storage;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

/** Locations originate in the registry, never in a browser command. */
public interface ObjectStorage {
    record Location(String bucket,String key) { @Override public String toString(){return "ObjectLocation[redacted]";} }
    record Metadata(long sizeBytes,String contentType) { }
    record SignedRequest(String url,Map<String,String> headers) { @Override public String toString(){return "SignedRequest[redacted]";} }
    Optional<Metadata> head(Location location);
    byte[] read(Location location,long maximumBytes);
    void put(Location location,byte[] bytes,String contentType,String disposition);
    SignedRequest presignPut(Location location,String contentType,long expectedBytes,Duration ttl);
    SignedRequest presignGet(Location location,String contentType,String disposition,Duration ttl);
    void deleteStaging(Location location);
}
