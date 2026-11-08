package com.chatgptcourses.media.service;

import java.time.Instant;
import java.util.UUID;

public final class MediaTypes {
    private MediaTypes(){ }
    public record MediaAccessContext(String locale,UUID resourceId,UUID versionId,UUID enrollmentId){ }
    public record VideoMediaView(UUID id,String locale,String provider,double durationSeconds,long sizeBytes,String sha256,
            boolean playbackAvailable,String unavailableReason,String transcript,String captionsVtt){ }
    public record VideoPlaybackAccess(UUID mediaId,String provider,String url,Instant expiresAt,String contentType,double durationSeconds,long sizeBytes,String sha256){
        @Override public String toString(){return "VideoPlaybackAccess[redacted]";}
    }
    public record MediaProgressView(UUID mediaId,String locale,double durationSeconds,double positionSeconds,long revision,Instant updatedAt){ }
    public record SetMediaProgress(MediaAccessContext context,double positionSeconds){ }
    public record Registration(UUID id,UUID resourceId,UUID versionId,String locale,double durationSeconds,long sizeBytes,String sha256,String transcript,String captionsVtt){ }
}
