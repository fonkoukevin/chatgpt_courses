package com.chatgptcourses.projects.service;

import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Personal productions and declared evidence; no automated truth detection or human review. */
public final class ProjectTypes {
    private ProjectTypes() { }
    public record ProjectPolicy(String caseCode,int passPoints,String revealPolicy,List<BlockingIssueDefinition> blockingIssues) { }
    public record BlockingIssueDefinition(String key,String label) { }
    public record ProjectFields(String title,String locale,String objective,String scope,String method,String timeline,String budget,String clarifications,String nextStep,String externalText) { }
    public record ProjectOrigin(UUID activityId,UUID activityVersionId,int activityVersionNumber,UUID translationId,UUID revisionId,String locale,String title,String slug,UUID enrollmentId,UUID courseResourceId,UUID courseVersionId,String courseTitle) { }
    public record ProjectCriterion(String key,String category,String label,int points,boolean blocking) { }
    public record ProjectRubricDefinition(UUID sourceRevisionId,String locale,String caseCode,int passPoints,int maxPoints,String revealPolicy,List<ProjectCriterion> criteria,List<BlockingIssueDefinition> blockingIssues) { }
    public record ProjectRubricSnapshot(UUID id,UUID sourceRevisionId,String locale,String caseCode,int passPoints,int maxPoints,String revealPolicy,List<ProjectCriterion> criteria,List<BlockingIssueDefinition> blockingIssues) { }
    public record ProjectView(UUID id,long revision,UUID currentRevisionId,int revisionNumber,ProjectFields fields,String stage,ProjectOrigin origin,ProjectRubricSnapshot rubric,Instant createdAt,Instant updatedAt,Instant savedAt) { }
    public record ProjectSummary(UUID id,long revision,String title,String locale,String state,UUID currentRevisionId,UUID activityId,UUID activityVersionId,int activityVersionNumber,String activityTitle,String courseTitle,Instant updatedAt,Instant savedAt) { }
    public record ProjectPage(List<ProjectSummary> items,int page,int pageSize,long total) { }
    public record ProjectRevisionView(UUID id,UUID projectId,int revisionNumber,ProjectFields fields,String stage,Instant createdAt,UUID authorId) { }
    public record ProjectRevisionSummary(UUID id,UUID projectId,int revisionNumber,String title,String locale,String stage,Instant createdAt,UUID authorId) { }
    public record ProjectRevisionPage(List<ProjectRevisionSummary> items,int page,int pageSize,long total) { }
    public record ProjectContext(UUID projectId,UUID activityId,UUID activityVersionId,String availability,String accessStatus,UUID sourceRevisionId,UUID currentPublishedRevisionId,boolean sourceChanged,ResourceDetail resource) { }
    public record ProjectTemplate(UUID activityId,UUID activityVersionId,UUID revisionId,String locale,String title,String availability,ResourceDetail resource,ProjectRubricDefinition rubric) { }
    public record ProjectStatus(UUID projectId,UUID currentRevisionId,String stage,String state,SelfAssessmentView latestAssessment) { }
    public record CriterionDeclaration(String key,boolean satisfied,String comment) { }
    public record BlockingDeclaration(String key,boolean present,String comment) { }
    public record DeclaredBlockingIssue(String key,String label,String comment) { }
    public record SelfAssessmentView(UUID id,UUID submissionId,UUID projectId,UUID projectRevisionId,UUID rubricVersionId,String method,int scorePoints,int maxPoints,int passPoints,boolean thresholdMet,boolean needsRevision,List<CriterionDeclaration> answers,List<BlockingDeclaration> blockingDeclarations,List<DeclaredBlockingIssue> blockingIssues,String comment,Instant evaluatedAt,UUID authorId,UUID evaluatorId,boolean declaredByUser) { }
    public record SelfAssessmentSummary(UUID id,UUID projectId,UUID projectRevisionId,UUID rubricVersionId,String method,int scorePoints,int maxPoints,int passPoints,boolean thresholdMet,boolean needsRevision,int blockingIssueCount,Instant evaluatedAt,UUID authorId) { }
    public record SelfAssessmentPage(List<SelfAssessmentSummary> items,int page,int pageSize,long total) { }
    public record SolutionFile(UUID assetId,String filename,String locale) { }
    public record SolutionRevealView(UUID id,UUID projectId,UUID projectRevisionId,UUID activityId,UUID activityVersionId,UUID revisionId,String locale,String correction,Instant revealedAt,List<SolutionFile> files) {
        public SolutionRevealView(UUID id,UUID projectId,UUID projectRevisionId,UUID activityId,UUID activityVersionId,UUID revisionId,String locale,String correction,Instant revealedAt){this(id,projectId,projectRevisionId,activityId,activityVersionId,revisionId,locale,correction,revealedAt,List.of());}
    }
    public record CreateProject(UUID creationId,UUID activityId,UUID activityVersionId,UUID revisionId,String sourceLocale,UUID enrollmentId,ProjectFields fields,String stage) { }
    public record ProjectCreationResult(ProjectView value,boolean created) { }
    public record SaveProject(ProjectFields fields,String stage) { }
    public record SubmitSelfAssessment(UUID submissionId,UUID projectRevisionId,UUID rubricVersionId,List<CriterionDeclaration> answers,List<BlockingDeclaration> blockingDeclarations,String comment) { }
    public record RevealSolution(UUID projectId,UUID projectRevisionId,UUID activityVersionId,UUID revisionId,String locale) { }
    public record ProjectQuery(String q,String state,UUID activityId,UUID activityVersionId,int page,int pageSize) { }
}
