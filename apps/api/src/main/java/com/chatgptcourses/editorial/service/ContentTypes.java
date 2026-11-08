package com.chatgptcourses.editorial.service;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.model.EditorialState;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Explicit editorial contracts; no persistence entity is exposed through HTTP. */
public final class ContentTypes {
    private ContentTypes() { }
    public record ContentDocument(String objective, String expectedResult, List<String> prerequisites,
        List<ContentBlock> blocks, Integer estimatedMinutes, Exercise exercise, List<QuizQuestion> quiz,
        List<RubricCriterion> rubric, String access, List<MediaReference> media, List<UUID> relatedResourceIds) { }
    public record ContentBlock(String type, String text, String url) { }
    public record Exercise(String instructions, String correction) { }
    public record QuizQuestion(String key, String prompt, List<String> options, int correctOption, String explanation, int points) { }
    public record RubricCriterion(String key, String label, int points, boolean blocking) { }
    public record MediaReference(UUID assetId, String kind, boolean required, String label) { }
    public record CreateContent(ResourceKind kind, String locale, String slug, String title, String summary,
        String objectives, String evaluationDefinition, ContentDocument document, List<UUID> childVersionIds, String reason) { }
    public record SaveRevision(String title, String summary, ContentDocument document, String reason) { }
    public record NewVersion(String objectives, String evaluationDefinition, String title, String summary,
        ContentDocument document, List<UUID> childVersionIds, String reason) { }
    public record DuplicateContent(String slug, String title, String reason) { }
    public record CreateTranslation(String locale, String slug, String title, String summary, ContentDocument document, String reason) { }
    public record TransitionContent(EditorialState state, String reason, UUID sourceRevisionId) { }
    public record PublishContent(UUID revisionId, String reason) { }
    public record ArchiveContent(String reason) { }
    public record ReplaceComposition(List<UUID> childVersionIds, String reason) { }
    public record ContentView(UUID id, UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber,
        String locale, String slug, EditorialState state, long revision, UUID currentRevisionId, UUID publishedRevisionId,
        String title, String summary, String objectives, String evaluationDefinition, ContentDocument document,
        List<UUID> childVersionIds, UUID sourceTranslationId, UUID sourceRevisionId, UUID reviewedSourceRevisionId,
        Instant verifiedAt, Instant updatedAt, Instant frozenAt, List<TranslationLink> translations, String legacyBody) { }
    public record TranslationLink(UUID id, String locale, EditorialState state, UUID sourceRevisionId, UUID reviewedSourceRevisionId) { }
    public record ContentSummary(UUID id, UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber,
        String locale, String slug, EditorialState state, long revision, String title, String summary,
        Instant verifiedAt, Instant updatedAt, boolean needsUpdate) { }
    public record ContentQuery(String q, ResourceKind kind, EditorialState state, String locale, UUID courseId,
        Instant verifiedBefore, Boolean needsUpdate, int page, int size) { }
    public record Page<T>(List<T> items, int page, int size, long total) { }
    public record RevisionView(UUID id, int revisionNumber, String title, String summary, ContentDocument document,
        UUID authorId, Instant createdAt, String reason, UUID replacesRevisionId, String legacyBody) { }
    public record Issue(String code, String field, UUID resourceId, String action) { }
    public record Readiness(boolean ready, List<Issue> blockingIssues, List<Issue> warnings, UUID checkedRevision) { }
    public record Dependency(UUID resourceId, UUID versionId, ResourceKind kind, String title, String relation) { }
    public record Dependencies(List<Dependency> items, boolean canArchive, List<String> consequences) { }
    public record PublicQuizQuestion(String key, String prompt, List<String> options, int points) { }
    public record PublicDocument(String objective, String expectedResult, List<String> prerequisites,
        List<ContentBlock> blocks, Integer estimatedMinutes, String exerciseInstructions, List<PublicQuizQuestion> quiz,
        List<RubricCriterion> rubric, String access, List<MediaReference> media, List<UUID> relatedResourceIds) { }
    public record PublicContent(UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber,
        String locale, String slug, String availability, UUID revisionId, String title, String summary,
        String access, PublicDocument document, List<UUID> childResourceIds) { }
}
