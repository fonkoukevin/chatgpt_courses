package com.chatgptcourses.assets.service;

import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.assets.service.AssetTypes.AssetAccessContext;
import com.chatgptcourses.access.AccessPolicy;
import com.chatgptcourses.access.AccessResource;
import com.chatgptcourses.access.AccessSubject;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/** One authority for asset ownership, live publication, language and optional enrolled chain. */
@Component
public final class AssetAccessPolicy {
    private final JdbcTemplate jdbc;private final PublicCatalogueService catalogue;private final LearningService learning;private final AccessPolicy access;
    private final com.chatgptcourses.access.MemberContentService members;private final com.chatgptcourses.access.EntitlementAccess entitlements;
    public AssetAccessPolicy(JdbcTemplate jdbc,PublicCatalogueService catalogue,LearningService learning,AccessPolicy access,com.chatgptcourses.access.MemberContentService members,com.chatgptcourses.access.EntitlementAccess entitlements){this.jdbc=jdbc;this.catalogue=catalogue;this.learning=learning;this.access=access;this.members=members;this.entitlements=entitlements;}
    public void require(UUID actor,String permission){
        var action=permission.endsWith(".read")?AccessPolicy.Action.READ:AccessPolicy.Action.UPDATE;
        if(!access.decide(subject(actor),new AccessResource.AdministrativeResource(actor,java.util.Map.of(action,permission)),action).allowed())throw denied();
    }
    public void mutation(UUID actor,UUID context,String permission){require(actor,permission);if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);}
    public void accountContext(UUID actor,UUID context){if(actor==null){check(context==null);return;}if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);}
    public void project(UUID actor,UUID project,String permission,boolean lock){
        require(actor,permission);if(project==null)throw notFound();var rows=jdbc.query("SELECT id,owner_id FROM projects WHERE id=? AND owner_id=?"+(lock?" FOR NO KEY UPDATE":""),(rs,n)->new AccessResource.PersonalResource(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),project,actor);if(rows.isEmpty())throw notFound();require(actor,permission);
        if(!access.decide(subject(actor),rows.getFirst(),permission.endsWith(".read")?AccessPolicy.Action.READ:AccessPolicy.Action.UPDATE).allowed())throw notFound();
    }
    public void editorialOrigin(UUID resource,UUID version,String locale){locale(locale);if(resource==null||version==null||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pedagogical_versions WHERE id=? AND resource_id=?)",Boolean.class,version,resource)))throw notFound();}
    public void editorialDownload(UUID actor,UUID asset,String kind,String assetLocale,AssetAccessContext context){
        check(context!=null&&context.resourceId()!=null&&context.versionId()!=null);locale(context.locale());if(!context.locale().equals(assetLocale))throw notFound();
        var ids=new java.util.ArrayList<UUID>();ids.add(context.resourceId());
        if(context.enrollmentId()!=null){
            var paths=jdbc.query("SELECT e.course_resource_id,i.module_id FROM learning_enrollments e JOIN learning_enrollment_activities i ON i.enrollment_id=e.id WHERE e.id=? AND e.owner_id=? AND i.activity_id=? AND i.activity_version_id=?",(rs,n)->java.util.List.of(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),context.enrollmentId(),actor,context.resourceId(),context.versionId());
            if(paths.isEmpty())throw notFound();ids.addAll(paths.getFirst());
        }
        var unique=ids.stream().distinct().toList();String slots=String.join(",",unique.stream().map(id->"?").toList());
        jdbc.query("SELECT id FROM learning_resources WHERE id IN("+slots+") ORDER BY id FOR SHARE",(rs,n)->rs.getObject(1,UUID.class),unique.toArray());
        var detail=members.detail(actor,context.resourceId(),context.versionId(),context.locale());
        boolean published="PUBLISHED".equals(detail.availability()),translated=published&&context.locale().equals(detail.locale());
        AccessResource resource="FREE".equals(detail.access())?new AccessResource.PublicContent(detail.resourceId(),published,translated):new AccessResource.PedagogicalContent(detail.resourceId(),published,translated,entitlements.covers(actor,context.resourceId(),context.versionId(),context.locale()));
        var decision=access.decide(subject(actor),resource,AccessPolicy.Action.READ);
        if(!published||!translated)throw notFound();if(!decision.allowed()||detail.document()==null)throw denied();
        if(detail.document().media().stream().noneMatch(m->asset.equals(m.assetId())&&kind.equals(m.kind())))throw notFound();
        if(context.enrollmentId()!=null){
            var activity=learning.activity(actor,context.enrollmentId(),context.resourceId(),context.versionId(),context.locale());
            if(!"PUBLISHED".equals(activity.availability()))throw notFound();if(!"ACTIVE".equals(activity.accessStatus()))throw denied();
        }
    }
    private AccessSubject subject(UUID actor){
        if(actor==null)return AccessSubject.anonymous();var states=jdbc.query("SELECT status FROM user_accounts WHERE id=?",(rs,n)->rs.getString(1),actor);boolean active=!states.isEmpty()&&"ACTIVE".equals(states.getFirst());
        var permissions=jdbc.query("SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND ur.revoked_at IS NULL",(rs,n)->rs.getString(1),actor);
        return new AccessSubject(actor,true,active,new java.util.HashSet<>(permissions));
    }
    public static void locale(String value){check("fr".equals(value)||"en".equals(value));}
    public static void check(boolean value){if(!value)throw new ApiException(ApiError.VALIDATION_FAILED);}
    public static ApiException notFound(){return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    public static AccessDeniedException denied(){return new AccessDeniedException("Asset action unavailable");}
}
