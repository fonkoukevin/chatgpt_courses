package com.chatgptcourses.methods.http;

import com.chatgptcourses.methods.service.MethodTypes;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Explicit HTTP fields: owner, source snapshot and server revisions are never accepted as editable fields. */
public final class MethodDtos {
    public static final String ACCOUNT_CONTEXT_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private MethodDtos() { }

    public record Parameters(@NotNull @Size(max = 4000) String objective,
            @NotNull @Size(max = 4000) String context, @NotNull @Size(max = 4000) String availableData,
            @NotNull @Size(max = 4000) String recipient, @NotNull @Size(max = 4000) String format,
            @NotNull @Size(max = 4000) String constraints, @NotNull @Size(max = 4000) String clarifications) {
        public MethodTypes.MethodParameters command() {
            return new MethodTypes.MethodParameters(objective, context, availableData, recipient, format, constraints, clarifications);
        }
        public static Parameters from(MethodTypes.MethodParameters value) {
            return value == null ? null : new Parameters(value.objective(), value.context(), value.availableData(), value.recipient(), value.format(), value.constraints(), value.clarifications());
        }
        @Override public String toString() { return "MethodParameters[redacted]"; }
    }
    public record Definition(@NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> useCases,
            @NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> requiredInputs,
            @NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> steps,
            @NotNull @Size(max = 4000) String starterInstruction, @NotNull @Size(max = 8000) String example,
            @NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> checks,
            @NotNull @Size(max = 20) List<@NotBlank @Size(max = 1000) String> limitations,
            @NotNull @Valid Parameters defaults) {
        public MethodTypes.MethodDefinition command() {
            return new MethodTypes.MethodDefinition(useCases, requiredInputs, steps, starterInstruction, example, checks, limitations, defaults.command());
        }
        public static Definition from(MethodTypes.MethodDefinition value) {
            return value == null ? null : new Definition(value.useCases(), value.requiredInputs(), value.steps(), value.starterInstruction(), value.example(), value.checks(), value.limitations(), Parameters.from(value.defaults()));
        }
        @Override public String toString() { return "MethodDefinition[redacted]"; }
    }
    public record Fields(@NotBlank @Size(max = 240) String title, @NotNull @Pattern(regexp = "fr|en") String locale,
            @NotBlank @Size(max = 32000) String text, @NotNull @Valid Parameters parameters,
            @Valid Parameters generatedFrom, @NotNull @Size(max = 8000) String notes,
            @Size(min = 1, max = 80) @Pattern(regexp = "(?s).*\\S.*") String category) {
        MethodTypes.MethodFields command() { return new MethodTypes.MethodFields(title, locale, text, parameters.command(), generatedFrom == null ? null : generatedFrom.command(), notes, category); }
        @Override public String toString() { return "MethodFields[redacted]"; }
    }
    public record Create(@NotNull @Valid Fields fields) {
        MethodTypes.CreateMethod command() { return new MethodTypes.CreateMethod(fields.command()); }
        @Override public String toString() { return "CreateMethod[redacted]"; }
    }
    public record Update(@NotNull @Valid Fields fields) {
        MethodTypes.UpdateMethod command() { return new MethodTypes.UpdateMethod(fields.command()); }
        @Override public String toString() { return "UpdateMethod[redacted]"; }
    }
    public record FromTemplate(@NotNull UUID sourceResourceId, @NotNull UUID sourceVersionId,
            @NotNull UUID sourceRevisionId, @NotNull @Pattern(regexp = "fr|en") String sourceLocale,
            @NotNull @Valid Fields fields) {
        MethodTypes.FromTemplate command() { return new MethodTypes.FromTemplate(sourceResourceId, sourceVersionId, sourceRevisionId, sourceLocale, fields.command()); }
        @Override public String toString() { return "MethodFromTemplate[redacted]"; }
    }
    public record Origin(UUID resourceId, UUID versionId, UUID translationId, UUID revisionId, String locale, String title, String slug) {
        static Origin from(MethodTypes.MethodOrigin value) {
            return value == null ? null : new Origin(value.resourceId(), value.versionId(), value.translationId(), value.revisionId(), value.locale(), value.title(), value.slug());
        }
    }
    public record Method(UUID id, long revision, String title, String locale, String text, Parameters parameters,
            Parameters generatedFrom, String notes, String category, Origin origin, Instant createdAt, Instant updatedAt) {
        static Method from(MethodTypes.MethodView value) {
            return new Method(value.id(), value.revision(), value.title(), value.locale(), value.text(), Parameters.from(value.parameters()), Parameters.from(value.generatedFrom()), value.notes(), value.category(), Origin.from(value.origin()), value.createdAt(), value.updatedAt());
        }
        @Override public String toString() { return "PersonalMethod[redacted]"; }
    }
    public record Summary(UUID id, long revision, String title, String locale, String category, Instant updatedAt, boolean hasSource) {
        static Summary from(MethodTypes.MethodSummary value) { return new Summary(value.id(), value.revision(), value.title(), value.locale(), value.category(), value.updatedAt(), value.hasSource()); }
    }
    public record Page(List<Summary> items, int page, int pageSize, long total) {
        static Page from(MethodTypes.MethodPage value) { return new Page(value.items().stream().map(Summary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record SourceUpdate(String status, Origin source, Origin candidate) {
        static SourceUpdate from(MethodTypes.SourceUpdate value) { return new SourceUpdate(value.status(), Origin.from(value.source()), Origin.from(value.candidate())); }
    }
    public record Template(UUID resourceId, UUID versionId, UUID revisionId, String locale, String title, String slug, String availability, Definition definition) {
        static Template from(MethodTypes.MethodTemplate value) {
            return new Template(value.resourceId(), value.versionId(), value.revisionId(), value.locale(), value.title(), value.slug(), value.availability(), Definition.from(value.definition()));
        }
    }
}
