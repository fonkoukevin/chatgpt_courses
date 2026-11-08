package com.chatgptcourses.commerce.service;

import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.catalog.service.CatalogTypes.CurriculumNode;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Read-only authoritative coverage. P11 has no application path that grants access. */
@Component
public class CoverageReader {
    private final JdbcTemplate jdbc;
    private final PublicCatalogueService catalogue;
    private final boolean allowTestOrigins;
    public CoverageReader(JdbcTemplate jdbc,PublicCatalogueService catalogue,RuntimeProperties runtime){this.jdbc=jdbc;this.catalogue=catalogue;allowTestOrigins=Set.of("local","test").contains(runtime.environment());}
    public PurchaseCoverage coverage(UUID owner,PublicOffer offer){
        var result=new ArrayList<CoverageResource>();int already=0;
        for(var item:offer.resources()){
            var covered=new ArrayList<String>();var missing=new ArrayList<String>();
            for(String locale:offer.locales()){
                if(free(item.resourceId(),item.versionId(),locale)||granted(owner,item.resourceId(),item.versionId(),locale))covered.add(locale);else missing.add(locale);
            }
            boolean accessible=missing.isEmpty()&&!offer.locales().isEmpty();if(accessible)already++;
            result.add(new CoverageResource(item.resourceId(),item.versionId(),List.copyOf(covered),List.copyOf(missing),accessible));
        }
        boolean any=result.stream().anyMatch(value->!value.coveredLocales().isEmpty());
        return new PurchaseCoverage(!result.isEmpty()&&already==result.size()?"ALL":any?"PARTIAL":"NONE",List.copyOf(result),already,result.size()-already);
    }
    private boolean granted(UUID owner,UUID resource,UUID version,String locale){
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM access_grants g JOIN pedagogical_versions target ON target.id=? AND target.resource_id=g.resource_id
              WHERE g.owner_id=? AND g.resource_id=? AND g.revoked_at IS NULL AND g.starts_at<=clock_timestamp()
                AND(g.expires_at IS NULL OR g.expires_at>clock_timestamp()) AND g.locales @> ?::jsonb
                AND(g.origin_type='ORDER_LINE' OR(? AND g.origin_type='MANUAL_TEST'))
                AND(g.version_id=target.id OR(g.version_policy='UPDATES_DURING_PERIOD' AND g.updates_until IS NOT NULL
                  AND target.frozen_at>=g.starts_at AND target.frozen_at<=g.updates_until)))
            """,Boolean.class,version,owner,resource,"[\""+locale+"\"]",allowTestOrigins));
    }
    private boolean free(UUID resource,UUID version,String locale){
        try{var detail=catalogue.version(resource,version,locale);return "PUBLISHED".equals(detail.availability())&&"FREE".equals(detail.access())&&detail.curriculum().stream().allMatch(CoverageReader::freeNode);}
        catch(ApiException unavailable){if(unavailable.error()==ApiError.RESOURCE_NOT_FOUND)return false;throw unavailable;}
    }
    private static boolean freeNode(CurriculumNode value){return "PUBLISHED".equals(value.availability())&&"FREE".equals(value.access())&&value.children().stream().allMatch(CoverageReader::freeNode);}
}
