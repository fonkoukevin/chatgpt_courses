package com.chatgptcourses.media.service;

import com.chatgptcourses.editorial.service.EditorialMediaRegistry;
import com.chatgptcourses.media.provider.LocalVideoPlaybackProvider;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.chatgptcourses.media.service.MediaTypes.*;

/** Server-only registration. No HTTP request can supply a path or an arbitrary remote media URL. */
@Service
public class LocalVideoRegistry implements EditorialMediaRegistry {
    private final JdbcTemplate jdbc;
    private final LocalVideoPlaybackProvider provider;
    public LocalVideoRegistry(JdbcTemplate jdbc,LocalVideoPlaybackProvider provider){this.jdbc=jdbc;this.provider=provider;}
    @Transactional
    public Registration register(UUID actor,UUID id,UUID resourceId,UUID versionId,String locale,Path file,String transcript,String captionsVtt){
        requireEditor(actor);if(id==null||resourceId==null||versionId==null||file==null||locale==null||!Set.of("fr","en").contains(locale))throw invalid();
        if(!text(transcript,8000)||!text(captionsVtt,8000)||captionsVtt!=null&&!captionsVtt.startsWith("WEBVTT"))throw invalid();
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pedagogical_versions v JOIN content_translations t ON t.pedagogical_version_id=v.id WHERE v.id=? AND v.resource_id=? AND t.locale=?)",Boolean.class,versionId,resourceId,locale)))throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        var existing=find(id);if(existing.isPresent()){var old=existing.get();if(!resourceId.equals(old.resourceId())||!versionId.equals(old.versionId())||!locale.equals(old.locale())||!java.util.Objects.equals(transcript,old.transcript())||!java.util.Objects.equals(captionsVtt,old.captionsVtt())||!provider.inspectSource(file).sha256().equals(old.sha256()))throw new ApiException(ApiError.CONFLICT);}
        var clip=provider.importClip(id,file);requireEditor(actor);
        jdbc.update("INSERT INTO video_media(id,origin_resource_id,origin_version_id,locale,duration_seconds,size_bytes,sha256,transcript,captions_vtt,registered_by) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",id,resourceId,versionId,locale,clip.durationSeconds(),clip.sizeBytes(),clip.sha256(),transcript,captionsVtt,actor);
        var value=find(id).orElseThrow();if(!resourceId.equals(value.resourceId())||!versionId.equals(value.versionId())||!locale.equals(value.locale())||!clip.sha256().equals(value.sha256())||!java.util.Objects.equals(transcript,value.transcript())||!java.util.Objects.equals(captionsVtt,value.captionsVtt()))throw new ApiException(ApiError.CONFLICT);return value;
    }
    @Transactional(readOnly=true)
    public Optional<Registration> find(UUID id){if(id==null)return Optional.empty();var rows=jdbc.query("SELECT * FROM video_media WHERE id=?",(rs,n)->new Registration(rs.getObject("id",UUID.class),rs.getObject("origin_resource_id",UUID.class),rs.getObject("origin_version_id",UUID.class),rs.getString("locale"),rs.getDouble("duration_seconds"),rs.getLong("size_bytes"),rs.getString("sha256"),rs.getString("transcript"),rs.getString("captions_vtt")),id);return rows.stream().findFirst();}
    @Override @Transactional(readOnly=true)
    public boolean ready(UUID resourceId,UUID versionId,String locale,UUID mediaId,String kind){if(!"VIDEO".equals(kind))return false;return find(mediaId).filter(value->value.locale().equals(locale)).flatMap(value->provider.resolve(value.id(),value.sizeBytes(),value.sha256())).isPresent();}
    private void requireEditor(UUID actor){if(actor==null||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code='content.write')",Boolean.class,actor)))throw new AccessDeniedException("Local video import unavailable");}
    private static boolean text(String value,int max){if(value==null)return true;if(value.length()>max||value.indexOf('\0')>=0)return false;for(int i=0;i<value.length();i++){char c=value.charAt(i);if(Character.isHighSurrogate(c)){if(i+1>=value.length()||!Character.isLowSurrogate(value.charAt(++i)))return false;}else if(Character.isLowSurrogate(c))return false;}return true;}
    private static ApiException invalid(){return new ApiException(ApiError.VALIDATION_FAILED);}
}
