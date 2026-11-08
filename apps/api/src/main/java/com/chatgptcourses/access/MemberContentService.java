package com.chatgptcourses.access;

import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** An authorized learner projection never contains solutions, answer keys or an entity. */
@Service
public class MemberContentService {
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final PublicCatalogueService catalogue;private final EntitlementAccess entitlements;
    public MemberContentService(JdbcTemplate jdbc,ObjectMapper mapper,PublicCatalogueService catalogue,EntitlementAccess entitlements){this.jdbc=jdbc;this.mapper=mapper;this.catalogue=catalogue;this.entitlements=entitlements;}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ResourceDetail detail(UUID owner,UUID resource,UUID version,String locale){
        var d=catalogue.version(resource,version,locale);
        if(d.document()!=null||!"PUBLISHED".equals(d.availability())||!"PROTECTED".equals(d.access())||!entitlements.covers(owner,resource,version,locale))return d;
        var rows=jdbc.query("""
            SELECT e.document_json::text FROM content_translations t JOIN editorial_revisions e ON e.id=t.published_revision_id
            WHERE t.pedagogical_version_id=? AND t.locale=? AND e.id=?
            """,(rs,n)->mapper.readValue(rs.getString(1),ContentDocument.class),version,locale,d.revisionId());
        if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        var document=PublicCatalogueService.publicDocument(rows.getFirst());
        return new ResourceDetail(d.resourceId(),d.kind(),d.versionId(),d.versionNumber(),d.locale(),d.slug(),d.availability(),d.revisionId(),d.title(),d.summary(),d.access(),document,d.metadata(),d.reviewedAt(),d.languages(),d.curriculum(),d.related(),d.objective(),d.expectedResult(),d.prerequisites(),d.estimatedMinutes());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ResourceDetail read(UUID owner,UUID resource,UUID version,String locale){
        var detail=detail(owner,resource,version,locale);
        if("PUBLISHED".equals(detail.availability())&&detail.document()==null)throw new AccessDeniedException("Member content unavailable");
        return detail;
    }
}
