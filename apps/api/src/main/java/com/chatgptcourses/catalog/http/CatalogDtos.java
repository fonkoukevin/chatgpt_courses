package com.chatgptcourses.catalog.http;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes;
import com.chatgptcourses.editorial.http.EditorialDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public catalogue contracts contain only published, deliberately public fields. */
public final class CatalogDtos {
    private CatalogDtos() { }

    public record Tool(@NotBlank @Size(max = 120) String name, @Size(max = 2000) String url) {
        CatalogTypes.Tool command() { return new CatalogTypes.Tool(name, url); }
        static Tool from(CatalogTypes.Tool value) { return new Tool(value.name(), value.url()); }
    }
    public record Source(@NotBlank @Size(max = 240) String label, @NotBlank @Size(max = 2000) String url) {
        CatalogTypes.Source command() { return new CatalogTypes.Source(label, url); }
        static Source from(CatalogTypes.Source value) { return new Source(value.label(), value.url()); }
    }
    public record Faq(@NotBlank @Size(max = 500) String question, @NotBlank @Size(max = 2000) String answer) {
        CatalogTypes.Faq command() { return new CatalogTypes.Faq(question, answer); }
        static Faq from(CatalogTypes.Faq value) { return new Faq(value.question(), value.answer()); }
    }
    public record Metadata(
            @NotNull @Size(max = 6) List<@NotNull @Pattern(regexp = "understand-brief|define-scope|prepare-prompt|build-proposal|check-output|reuse-method") String> goalCodes,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String level,
            @NotNull @Size(max = 10) List<@NotBlank @Size(max = 500) String> audience,
            @NotNull @Size(max = 10) List<@NotNull @Valid Tool> tools,
            @NotNull @Size(max = 20) List<@NotNull @Valid Source> sources,
            @NotNull @Size(max = 12) List<@NotNull @Valid Faq> faq,
            @Size(min = 1, max = 4000) String evaluationDescription) {
        public CatalogTypes.PublicMetadata command() {
            return new CatalogTypes.PublicMetadata(goalCodes, level, audience, tools.stream().map(Tool::command).toList(),
                    sources.stream().map(Source::command).toList(), faq.stream().map(Faq::command).toList(), evaluationDescription);
        }
        public static Metadata from(CatalogTypes.PublicMetadata value) {
            return new Metadata(value.goalCodes(), value.level(), value.audience(), value.tools().stream().map(Tool::from).toList(),
                    value.sources().stream().map(Source::from).toList(), value.faq().stream().map(Faq::from).toList(), value.evaluationDescription());
        }
    }
    public record SaveMetadata(@NotNull @Valid Metadata metadata, @NotBlank @Size(max = 1000) String reason) {
        public CatalogTypes.SaveMetadata command() { return new CatalogTypes.SaveMetadata(metadata.command(), reason); }
        @Override public String toString() { return "SaveMetadata[redacted]"; }
    }
    public record Card(UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, UUID revisionId, String locale,
                       String slug, String title, String summary, String objective, String expectedResult, Integer estimatedMinutes,
                       String access, List<String> goalCodes, String level, Instant reviewedAt) {
        static Card from(CatalogTypes.ResourceCard value) {
            return new Card(value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.revisionId(), value.locale(),
                    value.slug(), value.title(), value.summary(), value.objective(), value.expectedResult(), value.estimatedMinutes(), value.access(), value.goalCodes(), value.level(), value.reviewedAt());
        }
    }
    public record Page(List<Card> items, int page, int pageSize, long total) {
        static Page from(CatalogTypes.CataloguePage value) { return new Page(value.items().stream().map(Card::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record FacetOption(String code, String label, long count) {
        static FacetOption from(CatalogTypes.FacetOption value) { return new FacetOption(value.code(), value.label(), value.count()); }
    }
    public record Facets(List<FacetOption> types, List<FacetOption> goals, List<FacetOption> levels,
                         List<FacetOption> accesses, List<FacetOption> locales) {
        static Facets from(CatalogTypes.CatalogueFacets value) {
            return new Facets(value.types().stream().map(FacetOption::from).toList(), value.goals().stream().map(FacetOption::from).toList(),
                    value.levels().stream().map(FacetOption::from).toList(), value.accesses().stream().map(FacetOption::from).toList(), value.locales().stream().map(FacetOption::from).toList());
        }
    }
    public record Language(String locale, String status, String slug) {
        static Language from(CatalogTypes.LanguageAvailability value) { return new Language(value.locale(), value.status(), value.slug()); }
    }
    public record Curriculum(UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, String locale, String slug,
                             String availability, UUID revisionId, String title, String summary, String access, Integer estimatedMinutes,
                             List<Curriculum> children) {
        public static Curriculum from(CatalogTypes.CurriculumNode value) {
            return new Curriculum(value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.locale(), value.slug(),
                    value.availability(), value.revisionId(), value.title(), value.summary(), value.access(), value.estimatedMinutes(), value.children().stream().map(Curriculum::from).toList());
        }
    }
    public record Detail(UUID resourceId, ResourceKind kind, UUID versionId, int versionNumber, String locale, String slug,
                         String availability, UUID revisionId, String title, String summary, String access, EditorialDtos.PublicDocument document,
                         Metadata metadata, Instant reviewedAt, List<Language> languages, List<Curriculum> curriculum, List<Card> related,
                         String objective, String expectedResult, List<String> prerequisites, Integer estimatedMinutes) {
        public static Detail from(CatalogTypes.ResourceDetail value) {
            return new Detail(value.resourceId(), value.kind(), value.versionId(), value.versionNumber(), value.locale(), value.slug(),
                    value.availability(), value.revisionId(), value.title(), value.summary(), value.access(), EditorialDtos.PublicDocument.from(value.document()),
                    Metadata.from(value.metadata()), value.reviewedAt(), value.languages().stream().map(Language::from).toList(), value.curriculum().stream().map(Curriculum::from).toList(),
                    value.related().stream().map(Card::from).toList(), value.objective(), value.expectedResult(), value.prerequisites(), value.estimatedMinutes());
        }
    }
}
