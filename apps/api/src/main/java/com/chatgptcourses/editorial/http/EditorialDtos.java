package com.chatgptcourses.editorial.http;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.http.CatalogDtos;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.ContentTypes;
import com.chatgptcourses.methods.http.MethodDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Explicit HTTP representations. Actors, publication pointers and media availability are never input. */
public final class EditorialDtos {
    private EditorialDtos() { }

    public record Block(@NotNull @Pattern(regexp = "HEADING|PARAGRAPH|LIST|CALLOUT|CODE|LINK") String type,
                        @NotBlank @Size(max = 4000) String text, @Size(max = 2000) String url) {
        ContentTypes.ContentBlock command() { return new ContentTypes.ContentBlock(type, text, url); }
        static Block from(ContentTypes.ContentBlock value) { return new Block(value.type(), value.text(), value.url()); }
    }
    public record Exercise(@NotNull @Size(max = 8000) String instructions, @NotNull @Size(max = 8000) String correction) {
        ContentTypes.Exercise command() { return new ContentTypes.Exercise(instructions, correction); }
        static Exercise from(ContentTypes.Exercise value) { return value == null ? null : new Exercise(value.instructions(), value.correction()); }
    }
    public record Quiz(@NotBlank @Size(max = 64) @Pattern(regexp = "[a-zA-Z0-9][a-zA-Z0-9_-]*") String key, @NotBlank @Size(max = 2000) String prompt,
                       @NotNull @Size(min = 2, max = 8) List<@NotBlank @Size(max = 1000) String> options,
                       @NotNull @Min(0) @Max(7) Integer correctOption, @NotBlank @Size(max = 4000) String explanation,
                       @NotNull @Min(1) @Max(1000) Integer points) {
        ContentTypes.QuizQuestion command() { return new ContentTypes.QuizQuestion(key, prompt, options, correctOption, explanation, points); }
        static Quiz from(ContentTypes.QuizQuestion value) { return new Quiz(value.key(), value.prompt(), value.options(), value.correctOption(), value.explanation(), value.points()); }
    }
    public record Rubric(@NotBlank @Size(max = 64) @Pattern(regexp = "[a-zA-Z0-9][a-zA-Z0-9_-]*") String key, @NotBlank @Size(max = 2000) String label,
                         @NotNull @Min(1) @Max(1000) Integer points, @NotNull Boolean blocking) {
        ContentTypes.RubricCriterion command() { return new ContentTypes.RubricCriterion(key, label, points, blocking); }
        static Rubric from(ContentTypes.RubricCriterion value) { return new Rubric(value.key(), value.label(), value.points(), value.blocking()); }
    }
    public record Media(@NotNull UUID assetId, @NotNull @Pattern(regexp = "IMAGE|VIDEO|FILE") String kind,
                        @NotNull Boolean required, @NotBlank @Size(max = 240) String label) {
        ContentTypes.MediaReference command() { return new ContentTypes.MediaReference(assetId, kind, required, label); }
        static Media from(ContentTypes.MediaReference value) { return new Media(value.assetId(), value.kind(), value.required(), value.label()); }
    }
    public record Document(@NotNull @Size(max = 4000) String objective, @NotNull @Size(max = 4000) String expectedResult,
                           @NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> prerequisites,
                           @NotNull @Size(max = 60) List<@NotNull @Valid Block> blocks,
                           @Min(1) @Max(1440) Integer estimatedMinutes, @Valid Exercise exercise,
                           @NotNull @Size(max = 20) List<@NotNull @Valid Quiz> quiz,
                           @NotNull @Size(max = 30) List<@NotNull @Valid Rubric> rubric,
                           @NotNull @Pattern(regexp = "FREE|PROTECTED") String access,
                           @NotNull @Size(max = 20) List<@NotNull @Valid Media> media,
                           @NotNull @Size(max = 30) List<@NotNull UUID> relatedResourceIds,
                           @Valid MethodDtos.Definition methodDefinition) {
        ContentTypes.ContentDocument command() {
            return new ContentTypes.ContentDocument(objective, expectedResult, prerequisites, blocks.stream().map(Block::command).toList(),
                    estimatedMinutes, exercise == null ? null : exercise.command(), quiz.stream().map(Quiz::command).toList(),
                    rubric.stream().map(Rubric::command).toList(), access, media.stream().map(Media::command).toList(), relatedResourceIds,
                    methodDefinition == null ? null : methodDefinition.command());
        }
        static Document from(ContentTypes.ContentDocument value) {
            return value == null ? null : new Document(value.objective(), value.expectedResult(), value.prerequisites(), value.blocks().stream().map(Block::from).toList(),
                    value.estimatedMinutes(), Exercise.from(value.exercise()), value.quiz().stream().map(Quiz::from).toList(),
                    value.rubric().stream().map(Rubric::from).toList(), value.access(), value.media().stream().map(Media::from).toList(), value.relatedResourceIds(), MethodDtos.Definition.from(value.methodDefinition()));
        }
        @Override public String toString() { return "Document[redacted]"; }
    }
    public record Create(@NotNull ResourceKind kind, @NotNull @Pattern(regexp = "fr|en") String locale,
                         @NotBlank @Size(max = 180) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
                         @NotBlank @Size(max = 240) String title, @NotNull @Size(max = 2000) String summary,
                         @NotBlank @Size(max = 4000) String objectives, @NotBlank @Size(max = 4000) String evaluationDefinition,
                         @NotNull @Valid Document document, @NotNull @Size(max = 100) List<@NotNull UUID> childVersionIds,
                         @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.CreateContent command() { return new ContentTypes.CreateContent(kind, locale, slug, title, summary, objectives, evaluationDefinition, document.command(), childVersionIds, reason); }
        @Override public String toString() { return "CreateContent[redacted]"; }
    }
    public record Save(@NotBlank @Size(max = 240) String title, @NotNull @Size(max = 2000) String summary,
                       @NotNull @Valid Document document, @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.SaveRevision command() { return new ContentTypes.SaveRevision(title, summary, document.command(), reason); }
        @Override public String toString() { return "SaveRevision[redacted]"; }
    }
    public record Version(@NotBlank @Size(max = 4000) String objectives, @NotBlank @Size(max = 4000) String evaluationDefinition,
                          @NotBlank @Size(max = 240) String title, @NotNull @Size(max = 2000) String summary,
                          @NotNull @Valid Document document, @NotNull @Size(max = 100) List<@NotNull UUID> childVersionIds,
                          @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.NewVersion command() { return new ContentTypes.NewVersion(objectives, evaluationDefinition, title, summary, document.command(), childVersionIds, reason); }
        @Override public String toString() { return "NewVersion[redacted]"; }
    }
    public record Duplicate(@NotBlank @Size(max = 180) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
                            @NotBlank @Size(max = 240) String title, @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.DuplicateContent command() { return new ContentTypes.DuplicateContent(slug, title, reason); }
    }
    public record Translation(@NotNull @Pattern(regexp = "fr|en") String locale,
                              @NotBlank @Size(max = 180) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
                              @NotBlank @Size(max = 240) String title, @NotNull @Size(max = 2000) String summary,
                              @NotNull @Valid Document document, @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.CreateTranslation command() { return new ContentTypes.CreateTranslation(locale, slug, title, summary, document.command(), reason); }
        @Override public String toString() { return "CreateTranslation[redacted]"; }
    }
    public record Transition(@NotNull @Pattern(regexp = "TO_REVIEW|READY|STALE") String state,
                             @NotBlank @Size(max = 1000) String reason, UUID sourceRevisionId) {
        ContentTypes.TransitionContent command() { return new ContentTypes.TransitionContent(EditorialState.valueOf(state), reason, sourceRevisionId); }
    }
    public record Publish(@NotNull UUID revisionId, @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.PublishContent command() { return new ContentTypes.PublishContent(revisionId, reason); }
    }
    public record Archive(@NotBlank @Size(max = 1000) String reason) {
        ContentTypes.ArchiveContent command() { return new ContentTypes.ArchiveContent(reason); }
    }
    public record Composition(@NotNull @Size(max = 100) List<@NotNull UUID> childVersionIds,
                              @NotBlank @Size(max = 1000) String reason) {
        ContentTypes.ReplaceComposition command() { return new ContentTypes.ReplaceComposition(childVersionIds, reason); }
    }

    public record Content(UUID id, UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, String locale,
                          String slug, EditorialState state, long revision, UUID currentRevisionId, UUID publishedRevisionId,
                          String title, String summary, String objectives, String evaluationDefinition, Document document,
                          List<UUID> childVersionIds, UUID sourceTranslationId, UUID sourceRevisionId, UUID reviewedSourceRevisionId,
                          Instant verifiedAt, Instant updatedAt, Instant frozenAt, List<TranslationLink> translations, String legacyBody, CatalogDtos.Metadata metadata) {
        static Content from(ContentTypes.ContentView value) {
            return new Content(value.id(), value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.locale(), value.slug(), value.state(),
                    value.revision(), value.currentRevisionId(), value.publishedRevisionId(), value.title(), value.summary(), value.objectives(), value.evaluationDefinition(),
                    Document.from(value.document()), value.childVersionIds(), value.sourceTranslationId(), value.sourceRevisionId(), value.reviewedSourceRevisionId(), value.verifiedAt(), value.updatedAt(), value.frozenAt(), value.translations().stream().map(TranslationLink::from).toList(), value.legacyBody(), CatalogDtos.Metadata.from(value.metadata()));
        }
        @Override public String toString() { return "ContentView[redacted]"; }
    }
    public record TranslationLink(UUID id, String locale, EditorialState state, UUID sourceRevisionId, UUID reviewedSourceRevisionId) {
        static TranslationLink from(ContentTypes.TranslationLink value) { return new TranslationLink(value.id(), value.locale(), value.state(), value.sourceRevisionId(), value.reviewedSourceRevisionId()); }
    }
    public record Summary(UUID id, UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, String locale,
                          String slug, EditorialState state, long revision, String title, String summary, Instant verifiedAt,
                          Instant updatedAt, boolean needsUpdate) {
        static Summary from(ContentTypes.ContentSummary value) { return new Summary(value.id(), value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.locale(), value.slug(), value.state(), value.revision(), value.title(), value.summary(), value.verifiedAt(), value.updatedAt(), value.needsUpdate()); }
    }
    public record Page<T>(List<T> items, int page, int size, long total) { }
    public record Revision(UUID id, int revisionNumber, String title, String summary, Document document, UUID authorId,
                           Instant createdAt, String reason, UUID replacesRevisionId, String legacyBody, CatalogDtos.Metadata metadata) {
        static Revision from(ContentTypes.RevisionView value) { return new Revision(value.id(), value.revisionNumber(), value.title(), value.summary(), Document.from(value.document()), value.authorId(), value.createdAt(), value.reason(), value.replacesRevisionId(), value.legacyBody(), CatalogDtos.Metadata.from(value.metadata())); }
        @Override public String toString() { return "RevisionView[redacted]"; }
    }
    public record Issue(String code, String field, UUID resourceId, String action) {
        static Issue from(ContentTypes.Issue value) { return new Issue(value.code(), value.field(), value.resourceId(), value.action()); }
    }
    public record Readiness(boolean ready, List<Issue> blockingIssues, List<Issue> warnings, UUID checkedRevision) {
        static Readiness from(ContentTypes.Readiness value) { return new Readiness(value.ready(), value.blockingIssues().stream().map(Issue::from).toList(), value.warnings().stream().map(Issue::from).toList(), value.checkedRevision()); }
    }
    public record Dependency(UUID resourceId, UUID versionId, ResourceKind kind, String title, String relation) {
        static Dependency from(ContentTypes.Dependency value) { return new Dependency(value.resourceId(), value.versionId(), value.kind(), value.title(), value.relation()); }
    }
    public record Dependencies(List<Dependency> items, boolean canArchive, List<String> consequences) {
        static Dependencies from(ContentTypes.Dependencies value) { return new Dependencies(value.items().stream().map(Dependency::from).toList(), value.canArchive(), value.consequences()); }
    }
    public record PublicQuiz(String key, String prompt, List<String> options, int points) {
        static PublicQuiz from(ContentTypes.PublicQuizQuestion value) { return new PublicQuiz(value.key(), value.prompt(), value.options(), value.points()); }
    }
    public record PublicDocument(String objective, String expectedResult, List<String> prerequisites, List<Block> blocks,
                                 Integer estimatedMinutes, String exerciseInstructions, List<PublicQuiz> quiz, List<Rubric> rubric,
                                 String access, List<Media> media, List<UUID> relatedResourceIds, MethodDtos.Definition methodDefinition) {
        public static PublicDocument from(ContentTypes.PublicDocument value) {
            return value == null ? null : new PublicDocument(value.objective(), value.expectedResult(), value.prerequisites(), value.blocks().stream().map(Block::from).toList(), value.estimatedMinutes(), value.exerciseInstructions(), value.quiz().stream().map(PublicQuiz::from).toList(), value.rubric().stream().map(Rubric::from).toList(), value.access(), value.media().stream().map(Media::from).toList(), value.relatedResourceIds(), MethodDtos.Definition.from(value.methodDefinition()));
        }
    }
    public record PublicContent(UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, String locale, String slug,
                                String availability, UUID revisionId, String title, String summary, String access,
                                PublicDocument document, List<UUID> childResourceIds) {
        static PublicContent from(ContentTypes.PublicContent value) { return new PublicContent(value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.locale(), value.slug(), value.availability(), value.revisionId(), value.title(), value.summary(), value.access(), PublicDocument.from(value.document()), value.childResourceIds()); }
    }
}
