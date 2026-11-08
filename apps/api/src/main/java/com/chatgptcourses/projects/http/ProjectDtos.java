package com.chatgptcourses.projects.http;

import com.chatgptcourses.catalog.http.CatalogDtos;
import com.chatgptcourses.projects.service.ProjectTypes;
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

/** Explicit transport snapshots. Identity and declared scores are always supplied by the server. */
public final class ProjectDtos {
    private ProjectDtos() { }
    public record ProjectPolicy(@NotNull @Pattern(regexp = "BR01|BR02") String caseCode, @NotNull @Min(1) @Max(20) Integer passPoints, @NotNull @Pattern(regexp = "EXPLICIT|AFTER_SUBMISSION") String revealPolicy, @NotNull @Size(max = 4) List<@NotNull @Valid BlockingIssueDefinition> blockingIssues) {
        public static ProjectPolicy from(ProjectTypes.ProjectPolicy value) { return value == null ? null : new ProjectPolicy(value.caseCode(), value.passPoints(), value.revealPolicy(), value.blockingIssues().stream().map(BlockingIssueDefinition::from).toList()); }
        public ProjectTypes.ProjectPolicy command() { return new ProjectTypes.ProjectPolicy(caseCode, passPoints, revealPolicy, blockingIssues.stream().map(BlockingIssueDefinition::command).toList()); }
    }
    public record BlockingIssueDefinition(@NotNull @Pattern(regexp = "invented-claims|definitive-wrong-total|unpriced-inclusion|unsupported-date") String key, @NotNull @Size(max = 1000) String label) {
        public static BlockingIssueDefinition from(ProjectTypes.BlockingIssueDefinition value) { return value == null ? null : new BlockingIssueDefinition(value.key(), value.label()); }
        public ProjectTypes.BlockingIssueDefinition command() { return new ProjectTypes.BlockingIssueDefinition(key, label); }
    }
    public record ProjectFields(@NotBlank @Size(max = 240) String title, @NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Size(max = 8000) String objective, @NotNull @Size(max = 8000) String scope, @NotNull @Size(max = 8000) String method, @NotNull @Size(max = 8000) String timeline, @NotNull @Size(max = 8000) String budget, @NotNull @Size(max = 8000) String clarifications, @NotNull @Size(max = 8000) String nextStep, @NotNull @Size(max = 32000) String externalText) {
        public static ProjectFields from(ProjectTypes.ProjectFields value) { return value == null ? null : new ProjectFields(value.title(), value.locale(), value.objective(), value.scope(), value.method(), value.timeline(), value.budget(), value.clarifications(), value.nextStep(), value.externalText()); }
        public ProjectTypes.ProjectFields command() { return new ProjectTypes.ProjectFields(title, locale, objective, scope, method, timeline, budget, clarifications, nextStep, externalText); }
        @Override public String toString() { return "ProjectFields[redacted]"; }
    }
    public record ProjectOrigin(UUID activityId, UUID activityVersionId, int activityVersionNumber, UUID translationId, UUID revisionId, String locale, String title, String slug, UUID enrollmentId, UUID courseResourceId, UUID courseVersionId, String courseTitle) {
        public static ProjectOrigin from(ProjectTypes.ProjectOrigin value) { return value == null ? null : new ProjectOrigin(value.activityId(), value.activityVersionId(), value.activityVersionNumber(), value.translationId(), value.revisionId(), value.locale(), value.title(), value.slug(), value.enrollmentId(), value.courseResourceId(), value.courseVersionId(), value.courseTitle()); }
    }
    public record ProjectCriterion(String key, String category, String label, int points, boolean blocking) {
        public static ProjectCriterion from(ProjectTypes.ProjectCriterion value) { return value == null ? null : new ProjectCriterion(value.key(), value.category(), value.label(), value.points(), value.blocking()); }
    }
    public record ProjectRubricDefinition(UUID sourceRevisionId, String locale, String caseCode, int passPoints, int maxPoints, String revealPolicy, List<ProjectCriterion> criteria, List<BlockingIssueDefinition> blockingIssues) {
        public static ProjectRubricDefinition from(ProjectTypes.ProjectRubricDefinition value) { return value == null ? null : new ProjectRubricDefinition(value.sourceRevisionId(), value.locale(), value.caseCode(), value.passPoints(), value.maxPoints(), value.revealPolicy(), value.criteria().stream().map(ProjectCriterion::from).toList(), value.blockingIssues().stream().map(BlockingIssueDefinition::from).toList()); }
    }
    public record ProjectRubricSnapshot(UUID id, UUID sourceRevisionId, String locale, String caseCode, int passPoints, int maxPoints, String revealPolicy, List<ProjectCriterion> criteria, List<BlockingIssueDefinition> blockingIssues) {
        public static ProjectRubricSnapshot from(ProjectTypes.ProjectRubricSnapshot value) { return value == null ? null : new ProjectRubricSnapshot(value.id(), value.sourceRevisionId(), value.locale(), value.caseCode(), value.passPoints(), value.maxPoints(), value.revealPolicy(), value.criteria().stream().map(ProjectCriterion::from).toList(), value.blockingIssues().stream().map(BlockingIssueDefinition::from).toList()); }
    }
    public record ProjectView(UUID id, long revision, UUID currentRevisionId, int revisionNumber, ProjectFields fields, String stage, ProjectOrigin origin, ProjectRubricSnapshot rubric, Instant createdAt, Instant updatedAt, Instant savedAt) {
        public static ProjectView from(ProjectTypes.ProjectView value) { return value == null ? null : new ProjectView(value.id(), value.revision(), value.currentRevisionId(), value.revisionNumber(), ProjectFields.from(value.fields()), value.stage(), ProjectOrigin.from(value.origin()), ProjectRubricSnapshot.from(value.rubric()), value.createdAt(), value.updatedAt(), value.savedAt()); }
        @Override public String toString() { return "ProjectView[redacted]"; }
    }
    public record ProjectSummary(UUID id, long revision, String title, String locale, String state, UUID currentRevisionId, UUID activityId, UUID activityVersionId, int activityVersionNumber, String activityTitle, String courseTitle, Instant updatedAt, Instant savedAt) {
        public static ProjectSummary from(ProjectTypes.ProjectSummary value) { return value == null ? null : new ProjectSummary(value.id(), value.revision(), value.title(), value.locale(), value.state(), value.currentRevisionId(), value.activityId(), value.activityVersionId(), value.activityVersionNumber(), value.activityTitle(), value.courseTitle(), value.updatedAt(), value.savedAt()); }
    }
    public record ProjectPage(List<ProjectSummary> items, int page, int pageSize, long total) {
        public static ProjectPage from(ProjectTypes.ProjectPage value) { return value == null ? null : new ProjectPage(value.items().stream().map(ProjectSummary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record ProjectRevisionView(UUID id, UUID projectId, int revisionNumber, ProjectFields fields, String stage, Instant createdAt, UUID authorId) {
        public static ProjectRevisionView from(ProjectTypes.ProjectRevisionView value) { return value == null ? null : new ProjectRevisionView(value.id(), value.projectId(), value.revisionNumber(), ProjectFields.from(value.fields()), value.stage(), value.createdAt(), value.authorId()); }
        @Override public String toString() { return "ProjectRevisionView[redacted]"; }
    }
    public record ProjectRevisionSummary(UUID id, UUID projectId, int revisionNumber, String title, String locale, String stage, Instant createdAt, UUID authorId) {
        public static ProjectRevisionSummary from(ProjectTypes.ProjectRevisionSummary value) { return value == null ? null : new ProjectRevisionSummary(value.id(), value.projectId(), value.revisionNumber(), value.title(), value.locale(), value.stage(), value.createdAt(), value.authorId()); }
    }
    public record ProjectRevisionPage(List<ProjectRevisionSummary> items, int page, int pageSize, long total) {
        public static ProjectRevisionPage from(ProjectTypes.ProjectRevisionPage value) { return value == null ? null : new ProjectRevisionPage(value.items().stream().map(ProjectRevisionSummary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record ProjectContext(UUID projectId, UUID activityId, UUID activityVersionId, String availability, String accessStatus, UUID sourceRevisionId, UUID currentPublishedRevisionId, boolean sourceChanged, CatalogDtos.Detail resource) {
        public static ProjectContext from(ProjectTypes.ProjectContext value) { return value == null ? null : new ProjectContext(value.projectId(), value.activityId(), value.activityVersionId(), value.availability(), value.accessStatus(), value.sourceRevisionId(), value.currentPublishedRevisionId(), value.sourceChanged(), value.resource() == null ? null : CatalogDtos.Detail.from(value.resource())); }
    }
    public record ProjectTemplate(UUID activityId, UUID activityVersionId, UUID revisionId, String locale, String title, String availability, CatalogDtos.Detail resource, ProjectRubricDefinition rubric) {
        public static ProjectTemplate from(ProjectTypes.ProjectTemplate value) { return value == null ? null : new ProjectTemplate(value.activityId(), value.activityVersionId(), value.revisionId(), value.locale(), value.title(), value.availability(), value.resource() == null ? null : CatalogDtos.Detail.from(value.resource()), ProjectRubricDefinition.from(value.rubric())); }
    }
    public record ProjectStatus(UUID projectId, UUID currentRevisionId, String stage, String state, SelfAssessmentView latestAssessment) {
        public static ProjectStatus from(ProjectTypes.ProjectStatus value) { return value == null ? null : new ProjectStatus(value.projectId(), value.currentRevisionId(), value.stage(), value.state(), SelfAssessmentView.from(value.latestAssessment())); }
    }
    public record CriterionDeclaration(@NotNull @Pattern(regexp = "(fidelity|scope|budget|schedule|presentation)-[1-4]") String key, @NotNull Boolean satisfied, @NotNull @Size(max = 1000) String comment) {
        public static CriterionDeclaration from(ProjectTypes.CriterionDeclaration value) { return value == null ? null : new CriterionDeclaration(value.key(), value.satisfied(), value.comment()); }
        public ProjectTypes.CriterionDeclaration command() { return new ProjectTypes.CriterionDeclaration(key, satisfied, comment); }
        @Override public String toString() { return "CriterionDeclaration[redacted]"; }
    }
    public record BlockingDeclaration(@NotNull @Pattern(regexp = "invented-claims|definitive-wrong-total|unpriced-inclusion|unsupported-date") String key, @NotNull Boolean present, @NotNull @Size(max = 1000) String comment) {
        public static BlockingDeclaration from(ProjectTypes.BlockingDeclaration value) { return value == null ? null : new BlockingDeclaration(value.key(), value.present(), value.comment()); }
        public ProjectTypes.BlockingDeclaration command() { return new ProjectTypes.BlockingDeclaration(key, present, comment); }
        @Override public String toString() { return "BlockingDeclaration[redacted]"; }
    }
    public record DeclaredBlockingIssue(String key, String label, String comment) {
        public static DeclaredBlockingIssue from(ProjectTypes.DeclaredBlockingIssue value) { return value == null ? null : new DeclaredBlockingIssue(value.key(), value.label(), value.comment()); }
    }
    public record SelfAssessmentView(UUID id, UUID submissionId, UUID projectId, UUID projectRevisionId, UUID rubricVersionId, String method, int scorePoints, int maxPoints, int passPoints, boolean thresholdMet, boolean needsRevision, List<CriterionDeclaration> answers, List<BlockingDeclaration> blockingDeclarations, List<DeclaredBlockingIssue> blockingIssues, String comment, Instant evaluatedAt, UUID authorId, UUID evaluatorId, boolean declaredByUser) {
        public static SelfAssessmentView from(ProjectTypes.SelfAssessmentView value) { return value == null ? null : new SelfAssessmentView(value.id(), value.submissionId(), value.projectId(), value.projectRevisionId(), value.rubricVersionId(), value.method(), value.scorePoints(), value.maxPoints(), value.passPoints(), value.thresholdMet(), value.needsRevision(), value.answers().stream().map(CriterionDeclaration::from).toList(), value.blockingDeclarations().stream().map(BlockingDeclaration::from).toList(), value.blockingIssues().stream().map(DeclaredBlockingIssue::from).toList(), value.comment(), value.evaluatedAt(), value.authorId(), value.evaluatorId(), value.declaredByUser()); }
        @Override public String toString() { return "SelfAssessmentView[redacted]"; }
    }
    public record SelfAssessmentSummary(UUID id, UUID projectId, UUID projectRevisionId, UUID rubricVersionId, String method, int scorePoints, int maxPoints, int passPoints, boolean thresholdMet, boolean needsRevision, int blockingIssueCount, Instant evaluatedAt, UUID authorId) {
        public static SelfAssessmentSummary from(ProjectTypes.SelfAssessmentSummary value) { return value == null ? null : new SelfAssessmentSummary(value.id(), value.projectId(), value.projectRevisionId(), value.rubricVersionId(), value.method(), value.scorePoints(), value.maxPoints(), value.passPoints(), value.thresholdMet(), value.needsRevision(), value.blockingIssueCount(), value.evaluatedAt(), value.authorId()); }
    }
    public record SelfAssessmentPage(List<SelfAssessmentSummary> items, int page, int pageSize, long total) {
        public static SelfAssessmentPage from(ProjectTypes.SelfAssessmentPage value) { return value == null ? null : new SelfAssessmentPage(value.items().stream().map(SelfAssessmentSummary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record SolutionRevealView(UUID id, UUID projectId, UUID projectRevisionId, UUID activityId, UUID activityVersionId, UUID revisionId, String locale, String correction, Instant revealedAt) {
        public static SolutionRevealView from(ProjectTypes.SolutionRevealView value) { return value == null ? null : new SolutionRevealView(value.id(), value.projectId(), value.projectRevisionId(), value.activityId(), value.activityVersionId(), value.revisionId(), value.locale(), value.correction(), value.revealedAt()); }
        @Override public String toString() { return "SolutionRevealView[redacted]"; }
    }
    public record CreateProject(@NotNull UUID creationId, @NotNull UUID activityId, @NotNull UUID activityVersionId,
            @NotNull UUID revisionId, @NotNull @Pattern(regexp = "fr|en") String sourceLocale, UUID enrollmentId,
            @NotNull @Valid ProjectFields fields, @NotNull @Pattern(regexp = "DRAFT|READY_FOR_SELF_ASSESSMENT") String stage) {
        ProjectTypes.CreateProject command() { return new ProjectTypes.CreateProject(creationId, activityId, activityVersionId, revisionId, sourceLocale, enrollmentId, fields.command(), stage); }
        @Override public String toString() { return "CreateProject[redacted]"; }
    }
    public record SaveProject(@NotNull @Valid ProjectFields fields, @NotNull @Pattern(regexp = "DRAFT|READY_FOR_SELF_ASSESSMENT") String stage) {
        ProjectTypes.SaveProject command() { return new ProjectTypes.SaveProject(fields.command(), stage); }
        @Override public String toString() { return "SaveProject[redacted]"; }
    }
    public record SubmitSelfAssessment(@NotNull UUID submissionId, @NotNull UUID projectRevisionId, @NotNull UUID rubricVersionId,
            @NotNull @Size(min = 20, max = 20) List<@NotNull @Valid CriterionDeclaration> answers,
            @NotNull @Size(min = 4, max = 4) List<@NotNull @Valid BlockingDeclaration> blockingDeclarations,
            @NotNull @Size(max = 4000) String comment) {
        ProjectTypes.SubmitSelfAssessment command() { return new ProjectTypes.SubmitSelfAssessment(submissionId, projectRevisionId, rubricVersionId, answers.stream().map(CriterionDeclaration::command).toList(), blockingDeclarations.stream().map(BlockingDeclaration::command).toList(), comment); }
        @Override public String toString() { return "SubmitSelfAssessment[redacted]"; }
    }
    public record RevealSolution(@NotNull UUID projectId, @NotNull UUID projectRevisionId, @NotNull UUID activityVersionId,
            @NotNull UUID revisionId, @NotNull @Pattern(regexp = "fr|en") String locale) {
        ProjectTypes.RevealSolution command() { return new ProjectTypes.RevealSolution(projectId, projectRevisionId, activityVersionId, revisionId, locale); }
    }
}
