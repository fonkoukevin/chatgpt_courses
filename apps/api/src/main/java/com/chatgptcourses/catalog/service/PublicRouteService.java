package com.chatgptcourses.catalog.service;

import static com.chatgptcourses.catalog.service.PublicRouteTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Metadata-only projections; publication and version identity are always authoritative. */
@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class PublicRouteService {
    private final JdbcTemplate jdbc;
    public PublicRouteService(JdbcTemplate jdbc){this.jdbc=jdbc;}
    private static final String PUBLICATIONS="""
        FROM learning_resources r JOIN pedagogical_versions v ON v.resource_id=r.id
        JOIN content_translations t ON t.pedagogical_version_id=v.id
        JOIN editorial_revisions e ON e.id=t.published_revision_id
        LEFT JOIN content_translations source ON source.id=t.source_translation_id
        JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=t.locale
        WHERE r.kind IN('COURSE','GUIDE','METHOD_TEMPLATE') AND r.archived_at IS NULL
          AND t.locale=? AND t.editorial_state NOT IN('ARCHIVED','STALE') AND e.document_json IS NOT NULL
          AND(t.source_translation_id IS NULL OR(t.published_source_revision_id=source.current_revision_id AND source.editorial_state NOT IN('ARCHIVED','STALE')))
          AND v.version_number=(SELECT max(n.version_number) FROM pedagogical_versions n WHERE n.resource_id=r.id
            AND EXISTS(SELECT 1 FROM content_translations p WHERE p.pedagogical_version_id=n.id AND p.published_revision_id IS NOT NULL))
        """;
    public PublicPublicationPage publications(String locale,int page,int size){
        locale(locale);check(page>=0&&page<=1_000_000&&size>=1&&size<=100);
        long total=jdbc.queryForObject("SELECT count(*) "+PUBLICATIONS,Long.class,locale);
        var rows=jdbc.query("SELECT r.id AS resource_id,r.kind,v.id AS version_id,v.version_number,e.id AS revision_id,s.slug,e.title,e.summary,"+
            "(SELECT max(p.created_at) FROM editorial_events p WHERE p.translation_id=t.id AND p.revision_id=e.id AND p.event_type='PUBLISH') AS published_at "+PUBLICATIONS+
            " ORDER BY r.kind,s.slug,r.id LIMIT ? OFFSET ?",(rs,n)->{
                UUID resource=rs.getObject("resource_id",UUID.class),version=rs.getObject("version_id",UUID.class);
                Timestamp published=rs.getTimestamp("published_at");
                return new PublicPublication(resource,ResourceKind.valueOf(rs.getString("kind")),version,rs.getInt("version_number"),rs.getObject("revision_id",UUID.class),locale,rs.getString("slug"),rs.getString("title"),rs.getString("summary"),published==null?null:published.toInstant(),List.of());
            },locale,size,(long)page*size);
        var languages=publishedLanguages(rows.stream().map(PublicPublication::versionId).toList());
        return new PublicPublicationPage(rows.stream().map(p->new PublicPublication(p.resourceId(),p.kind(),p.versionId(),p.versionNumber(),p.revisionId(),p.locale(),p.slug(),p.title(),p.summary(),p.publishedAt(),languages.getOrDefault(p.versionId(),List.of()))).toList(),page,size,total);
    }
    public PublicActivityContext activityContext(UUID course,UUID courseVersion,UUID activity,UUID activityVersion,String locale){
        locale(locale);check(course!=null&&courseVersion!=null&&activity!=null&&activityVersion!=null);
        var modules=jdbc.query("""
            SELECT m.id,m.resource_id FROM pedagogical_versions c JOIN learning_resources cr ON cr.id=c.resource_id AND cr.kind='COURSE'
            JOIN version_compositions cm ON cm.parent_version_id=c.id JOIN pedagogical_versions m ON m.id=cm.child_version_id
            JOIN learning_resources mr ON mr.id=m.resource_id AND mr.kind='MODULE'
            JOIN version_compositions ma ON ma.parent_version_id=m.id JOIN pedagogical_versions a ON a.id=ma.child_version_id
            JOIN learning_resources ar ON ar.id=a.resource_id AND ar.kind='ACTIVITY'
            WHERE c.id=? AND c.resource_id=? AND a.id=? AND a.resource_id=? ORDER BY cm.position,ma.position,m.id
            """,(rs,n)->new Module(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),courseVersion,course,activityVersion,activity);
        if(modules.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        var languages=new ArrayList<ActivityContextLanguage>();
        for(String language:List.of("fr","en")){
            var parent=publication(course,courseVersion,language);var child=publication(activity,activityVersion,language);
            var paths=new ArrayList<String>();
            for(var module:modules){String middle=availability(module.resource(),module.version(),language);paths.add(combine(List.of(parent.state(),middle,child.state())));}
            String state=paths.contains("PUBLISHED")?"PUBLISHED":combine(paths);
            languages.add(new ActivityContextLanguage(language,state,parent.slug(),child.slug()));
        }
        var selected=languages.stream().filter(l->l.locale().equals(locale)).findFirst().orElseThrow();
        return new PublicActivityContext(course,courseVersion,activity,activityVersion,locale,selected.availability(),selected.courseSlug(),selected.activitySlug(),List.copyOf(languages));
    }
    private Map<UUID,List<PublishedLanguage>> publishedLanguages(List<UUID> versions){
        if(versions.isEmpty())return Map.of();
        String slots=String.join(",",versions.stream().map(v->"?").toList());
        var rows=jdbc.query("""
            SELECT t.pedagogical_version_id,t.locale,s.slug FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id
            JOIN learning_resources r ON r.id=v.resource_id AND r.archived_at IS NULL
            JOIN editorial_revisions e ON e.id=t.published_revision_id AND e.document_json IS NOT NULL
            JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=t.locale
            LEFT JOIN content_translations source ON source.id=t.source_translation_id
            WHERE t.pedagogical_version_id IN(
            """+slots+") AND t.editorial_state NOT IN('ARCHIVED','STALE') "+"""
              AND(t.source_translation_id IS NULL OR(t.published_source_revision_id=source.current_revision_id AND source.editorial_state NOT IN('ARCHIVED','STALE'))) ORDER BY t.locale
            """,(r,n)->Map.entry(r.getObject(1,UUID.class),new PublishedLanguage(r.getString(2),r.getString(3))),versions.toArray());
        var result=new HashMap<UUID,List<PublishedLanguage>>();
        for(var row:rows)result.computeIfAbsent(row.getKey(),ignored->new ArrayList<>()).add(row.getValue());
        result.replaceAll((version,languages)->List.copyOf(languages));return result;
    }
    private String availability(UUID resource,UUID version,String locale){return publication(resource,version,locale).state();}
    private Publication publication(UUID resource,UUID version,String locale){
        var rows=jdbc.query("""
            SELECT r.archived_at,t.editorial_state,t.published_revision_id,t.source_translation_id,t.published_source_revision_id,
              source.current_revision_id AS source_current,source.editorial_state AS source_state,e.document_json IS NOT NULL AS has_document,s.slug
            FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id
            LEFT JOIN content_translations source ON source.id=t.source_translation_id
            LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=?
            WHERE v.id=? AND v.resource_id=? AND EXISTS(SELECT 1 FROM content_translations p WHERE p.pedagogical_version_id=v.id AND p.published_revision_id IS NOT NULL)
            """,(r,n)->{
                String state;
                if(r.getTimestamp("archived_at")!=null||"ARCHIVED".equals(r.getString("editorial_state")))state="WITHDRAWN";
                else if(r.getObject("published_revision_id")==null)state="MISSING_TRANSLATION";
                else if(!r.getBoolean("has_document"))state="WITHDRAWN";
                else if("STALE".equals(r.getString("editorial_state"))||(r.getObject("source_translation_id")!=null&&(!java.util.Objects.equals(r.getObject("published_source_revision_id"),r.getObject("source_current"))||Set.of("ARCHIVED","STALE").contains(r.getString("source_state")==null?"":r.getString("source_state")))))state="STALE";
                else state="PUBLISHED";
                return new Publication(state,r.getObject("published_revision_id")==null?null:r.getString("slug"));
            },locale,locale,version,resource);
        if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();
    }
    private record Publication(String state,String slug) { }
    private static String combine(List<String> states){for(String status:List.of("WITHDRAWN","STALE","MISSING_TRANSLATION"))if(states.contains(status))return status;return "PUBLISHED";}
    private static void locale(String locale){check(Set.of("fr","en").contains(locale==null?"":locale));}
    private static void check(boolean allowed){if(!allowed)throw new ApiException(ApiError.VALIDATION_FAILED);}
    private record Module(UUID version,UUID resource) { }
}
