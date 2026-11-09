package com.chatgptcourses.access;

import com.chatgptcourses.shared.config.RuntimeProperties;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Independent, live origins cover only their promised versions, languages and published paths. */
@Component
public final class EntitlementAccess {
    private final JdbcTemplate jdbc;
    private final boolean testOrigins;
    public EntitlementAccess(JdbcTemplate jdbc,RuntimeProperties runtime){this.jdbc=jdbc;testOrigins=Set.of("local","test").contains(runtime.environment());}

    private static final String COVERED="""
            WITH RECURSIVE covered(id,resource_id,depth) AS (
              SELECT DISTINCT v.id,v.resource_id,0 FROM access_grants g
              JOIN user_accounts u ON u.id=g.owner_id AND u.status='ACTIVE'
              JOIN pedagogical_versions v ON v.resource_id=g.resource_id
              JOIN learning_resources r ON r.id=v.resource_id AND r.kind='COURSE' AND r.archived_at IS NULL
              JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
              JOIN editorial_revisions e ON e.id=t.published_revision_id AND e.document_json IS NOT NULL
              LEFT JOIN content_translations source ON source.id=t.source_translation_id
              WHERE g.owner_id=? AND g.revoked_at IS NULL AND g.starts_at<=clock_timestamp()
                AND(g.expires_at IS NULL OR g.expires_at>clock_timestamp()) AND g.locales @> ?::jsonb
                AND(g.origin_type='ORDER_LINE' OR(? AND g.origin_type='MANUAL_TEST'))
                AND(g.version_id=v.id OR(g.version_policy='UPDATES_DURING_PERIOD'
                  AND v.frozen_at>=g.starts_at AND v.frozen_at<=g.updates_until))
                AND t.editorial_state NOT IN('ARCHIVED','STALE')
                AND(t.source_translation_id IS NULL OR(t.published_source_revision_id=source.current_revision_id
                  AND source.editorial_state NOT IN('ARCHIVED','STALE')))
              UNION
              SELECT v.id,v.resource_id,p.depth+1 FROM covered p
              JOIN version_compositions c ON c.parent_version_id=p.id
              JOIN pedagogical_versions v ON v.id=c.child_version_id
              JOIN learning_resources r ON r.id=v.resource_id AND r.archived_at IS NULL
              JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
              JOIN editorial_revisions e ON e.id=t.published_revision_id AND e.document_json IS NOT NULL
              LEFT JOIN content_translations source ON source.id=t.source_translation_id
              WHERE p.depth<2 AND t.editorial_state NOT IN('ARCHIVED','STALE')
                AND(t.source_translation_id IS NULL OR(t.published_source_revision_id=source.current_revision_id
                  AND source.editorial_state NOT IN('ARCHIVED','STALE')))
            )
            """;
    public boolean covers(UUID owner,UUID resource,UUID version,String locale){
        if(!valid(owner,locale)||resource==null||version==null)return false;
        return Boolean.TRUE.equals(jdbc.queryForObject(COVERED+" SELECT EXISTS(SELECT 1 FROM covered WHERE id=? AND resource_id=?)",Boolean.class,locale,owner,"[\""+locale+"\"]",testOrigins,locale,version,resource));
    }
    /** A request-local projection of the same policy, never a shared entitlement cache. */
    public Set<UUID> coveredVersions(UUID owner,String locale){
        if(!valid(owner,locale))return Set.of();
        return Set.copyOf(jdbc.query(COVERED+" SELECT DISTINCT id FROM covered",(rs,n)->rs.getObject(1,UUID.class),locale,owner,"[\""+locale+"\"]",testOrigins,locale));
    }
    private static boolean valid(UUID owner,String locale){return owner!=null&&("fr".equals(locale)||"en".equals(locale));}
}
