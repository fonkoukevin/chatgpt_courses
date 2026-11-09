package com.chatgptcourses.catalog.service;

import com.chatgptcourses.catalog.model.ResourceKind;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PublicRouteTypes {
    private PublicRouteTypes() { }
    public record PublishedLanguage(String locale,String slug) { }
    public record PublicPublication(UUID resourceId,ResourceKind kind,UUID versionId,int versionNumber,UUID revisionId,
        String locale,String slug,String title,String summary,Instant publishedAt,List<PublishedLanguage> languages) { }
    public record PublicPublicationPage(List<PublicPublication> items,int page,int pageSize,long total) { }
    public record ActivityContextLanguage(String locale,String availability,String courseSlug,String activitySlug) { }
    public record PublicActivityContext(UUID courseResourceId,UUID courseVersionId,UUID activityResourceId,UUID activityVersionId,
        String locale,String availability,String courseSlug,String activitySlug,List<ActivityContextLanguage> languages) { }
}
