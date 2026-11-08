package com.chatgptcourses.catalog.service;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.service.ContentTypes.PublicDocument;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CatalogTypes {
    private CatalogTypes() { }
    public record PublicMetadata(List<String> goalCodes,String level,List<String> audience,List<Tool> tools,List<Source> sources,List<Faq> faq,String evaluationDescription) { }
    public record Tool(String name,String url) { }
    public record Source(String label,String url) { }
    public record Faq(String question,String answer) { }
    public record SaveMetadata(PublicMetadata metadata,String reason) { }
    public record CatalogueQuery(String q,ResourceKind type,String goal,String level,String locale,String access,int page,int pageSize,String sort) { }
    public record CataloguePage(List<ResourceCard> items,int page,int pageSize,long total) { }
    public record ResourceCard(UUID resourceId,ResourceKind kind,UUID versionId,int versionNumber,UUID revisionId,String locale,
        String slug,String title,String summary,String objective,String expectedResult,Integer estimatedMinutes,String access,
        List<String> goalCodes,String level,Instant reviewedAt) { }
    public record FacetOption(String code,String label,long count) { }
    public record CatalogueFacets(List<FacetOption> types,List<FacetOption> goals,List<FacetOption> levels,List<FacetOption> accesses,List<FacetOption> locales) { }
    public record LanguageAvailability(String locale,String status,String slug) { }
    public record ResourceDetail(UUID resourceId,ResourceKind kind,UUID versionId,int versionNumber,String locale,String slug,
        String availability,UUID revisionId,String title,String summary,String access,PublicDocument document,PublicMetadata metadata,
        Instant reviewedAt,List<LanguageAvailability> languages,List<CurriculumNode> curriculum,List<ResourceCard> related,
        String objective,String expectedResult,List<String> prerequisites,Integer estimatedMinutes) { }
    public record CurriculumNode(UUID resourceId,ResourceKind kind,UUID versionId,int versionNumber,String locale,String slug,
        String availability,UUID revisionId,String title,String summary,String access,Integer estimatedMinutes,List<CurriculumNode> children) { }
}
