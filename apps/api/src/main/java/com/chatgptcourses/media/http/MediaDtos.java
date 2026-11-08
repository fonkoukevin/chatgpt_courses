package com.chatgptcourses.media.http;

import com.chatgptcourses.media.service.MediaTypes;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.UUID;

public final class MediaDtos {
    private MediaDtos(){ }
    public record Context(@NotNull @Pattern(regexp="fr|en")String locale,@NotNull UUID resourceId,@NotNull UUID versionId,UUID enrollmentId){MediaTypes.MediaAccessContext command(){return new MediaTypes.MediaAccessContext(locale,resourceId,versionId,enrollmentId);}}
    public record SetProgress(@NotNull @Valid Context context,@NotNull @DecimalMin("0")Double positionSeconds){MediaTypes.SetMediaProgress command(){return new MediaTypes.SetMediaProgress(context.command(),positionSeconds);}}
    public record Metadata(UUID id,String locale,String provider,double durationSeconds,long sizeBytes,String sha256,boolean playbackAvailable,String unavailableReason,String transcript,String captionsVtt){static Metadata from(MediaTypes.VideoMediaView value){return new Metadata(value.id(),value.locale(),value.provider(),value.durationSeconds(),value.sizeBytes(),value.sha256(),value.playbackAvailable(),value.unavailableReason(),value.transcript(),value.captionsVtt());}}
    public record Playback(UUID mediaId,String provider,String url,Instant expiresAt,String contentType,double durationSeconds,long sizeBytes,String sha256){static Playback from(MediaTypes.VideoPlaybackAccess value){return new Playback(value.mediaId(),value.provider(),value.url(),value.expiresAt(),value.contentType(),value.durationSeconds(),value.sizeBytes(),value.sha256());}@Override public String toString(){return "Playback[redacted]";}}
    public record Progress(UUID mediaId,String locale,double durationSeconds,double positionSeconds,long revision,Instant updatedAt){static Progress from(MediaTypes.MediaProgressView value){return new Progress(value.mediaId(),value.locale(),value.durationSeconds(),value.positionSeconds(),value.revision(),value.updatedAt());}}
}
