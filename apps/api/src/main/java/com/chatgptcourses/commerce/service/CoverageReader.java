package com.chatgptcourses.commerce.service;

import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.catalog.service.CatalogTypes.CurriculumNode;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Read-only authoritative coverage. P11 has no application path that grants access. */
@Component
public class CoverageReader {
    private final JdbcTemplate jdbc;
    private final PublicCatalogueService catalogue;
    private final com.chatgptcourses.access.EntitlementAccess grants;
    public CoverageReader(JdbcTemplate jdbc,PublicCatalogueService catalogue,RuntimeProperties runtime){this.jdbc=jdbc;this.catalogue=catalogue;grants=new com.chatgptcourses.access.EntitlementAccess(jdbc,runtime);}
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
        return grants.covers(owner,resource,version,locale);
    }
    private boolean free(UUID resource,UUID version,String locale){
        try{var detail=catalogue.version(resource,version,locale);return "PUBLISHED".equals(detail.availability())&&"FREE".equals(detail.access())&&detail.curriculum().stream().allMatch(CoverageReader::freeNode);}
        catch(ApiException unavailable){if(unavailable.error()==ApiError.RESOURCE_NOT_FOUND)return false;throw unavailable;}
    }
    private static boolean freeNode(CurriculumNode value){return "PUBLISHED".equals(value.availability())&&"FREE".equals(value.access())&&value.children().stream().allMatch(CoverageReader::freeNode);}
}
