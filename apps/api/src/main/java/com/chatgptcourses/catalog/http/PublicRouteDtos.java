package com.chatgptcourses.catalog.http;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.PublicRouteTypes;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PublicRouteDtos {
    private PublicRouteDtos() { }
    public record PublishedLanguage(String locale,String slug) {
        static PublishedLanguage from(PublicRouteTypes.PublishedLanguage v){return new PublishedLanguage(v.locale(),v.slug());}
    }
    public record PublicPublication(UUID resourceId,ResourceKind kind,UUID versionId,int versionNumber,UUID revisionId,String locale,
        String slug,String title,String summary,Instant publishedAt,List<PublishedLanguage> languages) {
        static PublicPublication from(PublicRouteTypes.PublicPublication v){return new PublicPublication(v.resourceId(),v.kind(),v.versionId(),v.versionNumber(),v.revisionId(),v.locale(),v.slug(),v.title(),v.summary(),v.publishedAt(),v.languages().stream().map(PublishedLanguage::from).toList());}
    }
    public record PublicPublicationPage(List<PublicPublication> items,int page,int pageSize,long total) {
        static PublicPublicationPage from(PublicRouteTypes.PublicPublicationPage v){return new PublicPublicationPage(v.items().stream().map(PublicPublication::from).toList(),v.page(),v.pageSize(),v.total());}
    }
    public record ActivityContextLanguage(String locale,String availability,String courseSlug,String activitySlug) {
        static ActivityContextLanguage from(PublicRouteTypes.ActivityContextLanguage v){return new ActivityContextLanguage(v.locale(),v.availability(),v.courseSlug(),v.activitySlug());}
    }
    public record PublicActivityContext(UUID courseResourceId,UUID courseVersionId,UUID activityResourceId,UUID activityVersionId,String locale,
        String availability,String courseSlug,String activitySlug,List<ActivityContextLanguage> languages) {
        static PublicActivityContext from(PublicRouteTypes.PublicActivityContext v){return new PublicActivityContext(v.courseResourceId(),v.courseVersionId(),v.activityResourceId(),v.activityVersionId(),v.locale(),v.availability(),v.courseSlug(),v.activitySlug(),v.languages().stream().map(ActivityContextLanguage::from).toList());}
    }
}
