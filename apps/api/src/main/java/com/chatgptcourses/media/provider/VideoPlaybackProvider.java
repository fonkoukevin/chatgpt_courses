package com.chatgptcourses.media.provider;

import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

/** Local test provider only. A production streaming provider remains an independent integration. */
public interface VideoPlaybackProvider {
    boolean available();
    Clip importClip(UUID mediaId,Path source);
    Optional<Clip> resolve(UUID mediaId,long expectedSize,String expectedHash);
    record Clip(Path file,double durationSeconds,long sizeBytes,String sha256){@Override public String toString(){return "VideoClip[redacted]";}}
}
