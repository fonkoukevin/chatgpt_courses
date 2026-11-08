package com.chatgptcourses.media.service;

import static com.chatgptcourses.media.service.MediaTypes.*;
import com.chatgptcourses.assets.service.AssetAccessPolicy;
import com.chatgptcourses.assets.service.AssetTypes.AssetAccessContext;
import com.chatgptcourses.learning.service.LearningMediaPort;
import com.chatgptcourses.media.config.MediaProperties;
import com.chatgptcourses.media.provider.VideoPlaybackProvider;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaService implements LearningMediaPort {
    private final JdbcTemplate jdbc;
    private final LocalVideoRegistry registry;
    private final VideoPlaybackProvider provider;
    private final AssetAccessPolicy policy;
    private final MediaProperties properties;
    private final SecureRandom random=new SecureRandom();
    public MediaService(JdbcTemplate jdbc,LocalVideoRegistry registry,VideoPlaybackProvider provider,AssetAccessPolicy policy,MediaProperties properties){this.jdbc=jdbc;this.registry=registry;this.provider=provider;this.policy=policy;this.properties=properties;}
    @Transactional
    public VideoMediaView metadata(UUID actor,UUID mediaId,MediaAccessContext context){var media=authorize(actor,mediaId,context);boolean available=provider.resolve(media.id(),media.sizeBytes(),media.sha256()).isPresent();return new VideoMediaView(media.id(),media.locale(),"LOCAL_TEST",media.durationSeconds(),media.sizeBytes(),media.sha256(),available,available?null:provider.available()?"MEDIA_UNAVAILABLE":"PROVIDER_NOT_CONFIGURED",media.transcript(),media.captionsVtt());}
    @Transactional
    public VideoPlaybackAccess playback(UUID actor,UUID accountContext,UUID mediaId,MediaAccessContext context){
        policy.accountContext(actor,accountContext);var media=authorize(actor,mediaId,context);clip(media);
        byte[] bytes=new byte[32];random.nextBytes(bytes);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);Instant created=Instant.now().truncatedTo(ChronoUnit.MICROS),expires=created.plusSeconds(properties.linkTtlSeconds());
        jdbc.update("DELETE FROM video_playback_grants WHERE id IN(SELECT id FROM video_playback_grants WHERE expires_at<=? ORDER BY expires_at LIMIT 1000)",Timestamp.from(created));
        jdbc.update("INSERT INTO video_playback_grants(id,media_id,token_hash,owner_id,created_at,expires_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),mediaId,digest(token),actor,Timestamp.from(created),Timestamp.from(expires));
        return new VideoPlaybackAccess(media.id(),"LOCAL_TEST","/api/v1/media/"+media.id()+"/stream?grant="+token,expires,"video/mp4",media.durationSeconds(),media.sizeBytes(),media.sha256());
    }
    @Transactional(readOnly=true)
    public VideoPlaybackProvider.Clip open(UUID mediaId,String token){
        if(mediaId==null||token==null||!token.matches("[A-Za-z0-9_-]{43}"))throw notFound();
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM video_playback_grants WHERE media_id=? AND token_hash=? AND expires_at>?)",Boolean.class,mediaId,digest(token),Timestamp.from(Instant.now()))))throw notFound();
        return clip(registry.find(mediaId).orElseThrow(MediaService::notFound));
    }
    @Transactional
    public MediaProgressView progress(UUID actor,UUID mediaId,MediaAccessContext context){policy.require(actor,"media.progress.read");var media=authorize(actor,mediaId,context);return progressRow(actor,media);}
    @Transactional
    public MediaProgressView setProgress(UUID actor,UUID accountContext,UUID mediaId,String ifMatch,SetMediaProgress command){
        policy.mutation(actor,accountContext,"media.progress.write");if(command==null)throw invalid();var media=authorize(actor,mediaId,command.context());clip(media);
        jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor);policy.mutation(actor,accountContext,"media.progress.write");var old=progressRow(actor,media);
        RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("media-progress",mediaId,old.revision()));
        var authorized=new AuthorizedMedia(mediaId,command.context().versionId(),media.locale(),media.durationSeconds());MediaPosition.forMedia(authorized,command.positionSeconds());
        if(old.updatedAt()!=null&&Double.compare(old.positionSeconds(),command.positionSeconds())==0)return old;
        Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("INSERT INTO media_progress(owner_id,media_id,position_seconds,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(owner_id,media_id) DO UPDATE SET position_seconds=EXCLUDED.position_seconds,revision=media_progress.revision+1,updated_at=EXCLUDED.updated_at",actor,mediaId,command.positionSeconds(),Timestamp.from(now));
        return progressRow(actor,media);
    }
    @Override @Transactional
    public Optional<AuthorizedMedia> resolve(UUID actor,UUID mediaId){
        var source=registry.find(mediaId);if(source.isEmpty())return Optional.empty();var media=source.get();try{authorize(actor,mediaId,new MediaAccessContext(media.locale(),media.resourceId(),media.versionId(),null));clip(media);return Optional.of(new AuthorizedMedia(media.id(),media.versionId(),media.locale(),media.durationSeconds()));}catch(ApiException|AccessDeniedException unavailable){return Optional.empty();}
    }
    private Registration authorize(UUID actor,UUID id,MediaAccessContext context){
        if(context==null||context.resourceId()==null||context.versionId()==null||context.locale()==null)throw invalid();var media=registry.find(id).orElseThrow(MediaService::notFound);
        policy.editorialDownload(actor,id,"VIDEO",media.locale(),new AssetAccessContext(context.locale(),context.resourceId(),context.versionId(),context.enrollmentId()));return media;
    }
    private VideoPlaybackProvider.Clip clip(Registration media){return provider.resolve(media.id(),media.sizeBytes(),media.sha256()).orElseThrow(()->new ApiException(ApiError.SERVICE_UNAVAILABLE));}
    private MediaProgressView progressRow(UUID actor,Registration media){var rows=jdbc.query("SELECT position_seconds,revision,updated_at FROM media_progress WHERE owner_id=? AND media_id=?",(rs,n)->new MediaProgressView(media.id(),media.locale(),media.durationSeconds(),rs.getDouble(1),rs.getLong(2),rs.getTimestamp(3).toInstant()),actor,media.id());return rows.isEmpty()?new MediaProgressView(media.id(),media.locale(),media.durationSeconds(),0,0,null):rows.getFirst();}
    private static byte[] digest(String token){try{return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));}catch(NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable");}}
    private static ApiException notFound(){return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private static ApiException invalid(){return new ApiException(ApiError.VALIDATION_FAILED);}
}
