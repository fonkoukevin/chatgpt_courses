package com.chatgptcourses.learning.service;

import com.chatgptcourses.catalog.service.CatalogTypes.CurriculumNode;
import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import com.chatgptcourses.methods.service.MethodTypes.MethodSummary;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Explicit learning facts. Reading, completion, quiz and future projects are distinct. */
public final class LearningTypes {
    private LearningTypes() { }
    public record QuizPolicy(int passPercent,Integer maxAttempts) { }
    public record ProgressTotals(int totalActivities,int readActivities,int completedActivities,int quizPassedActivities,String projectAvailability) { }
    public record ResumeTarget(UUID enrollmentId,UUID courseResourceId,UUID courseVersionId,String courseSlug,UUID activityId,UUID activityVersionId,String activitySlug,String locale,String title) { }
    public record EnrollmentSummary(UUID id,UUID courseResourceId,UUID courseVersionId,int courseVersionNumber,String title,String enrolledLocale,String courseSlug,String accessStatus,String availability,ProgressTotals progress,Instant createdAt,Instant lastVisitedAt) { }
    public record LearningDashboard(ResumeTarget resume,List<EnrollmentSummary> enrollments,List<MethodSummary> recentMethods,String recentMethodsAvailability) { }
    public record EnrollmentView(EnrollmentSummary summary,List<CurriculumNode> curriculum,List<EnrolledActivity> activities) { }
    public record EnrolledActivity(UUID activityId,UUID activityVersionId,UUID moduleId,UUID moduleVersionId,int position,String title,String accessStatus,String availability,ActivityProgressView progress) { }
    public record ActivityProgressView(UUID id,UUID enrollmentId,UUID activityId,UUID activityVersionId,long revision,Instant readAt,Instant completedAt) { }
    public record ActivityLink(UUID activityId,UUID activityVersionId,String slug,String title,String availability,String accessStatus) { }
    public record QuizOverview(QuizPolicy policy,int attemptsUsed,Integer attemptsRemaining,UUID latestAttemptId,boolean passed) { }
    public record LearningActivity(UUID enrollmentId,UUID activityId,UUID activityVersionId,UUID moduleId,UUID moduleVersionId,int position,int totalActivities,ResourceDetail resource,ActivityProgressView progress,ActivityLink previous,ActivityLink next,QuizOverview quiz,String accessStatus,String availability) { }
    public record VisitView(UUID enrollmentId,UUID activityId,UUID activityVersionId,Instant visitedAt) { }
    public record ActivityNoteView(UUID id,UUID activityId,UUID activityVersionId,String locale,String text,long revision,Instant createdAt,Instant updatedAt) { }
    public record ActivityNoteLookup(ActivityNoteView note) { }
    public record QuizAnswer(String key,int optionIndex) { }
    public record QuizQuestionResult(String key,String prompt,List<String> options,int selectedOption,int correctOption,boolean correct,String explanation,int points,int awardedPoints) { }
    public record QuizAttemptView(UUID id,UUID submissionId,UUID enrollmentId,UUID activityId,UUID activityVersionId,UUID revisionId,String locale,int attemptNumber,int scorePoints,int maxPoints,boolean passed,QuizPolicy policy,Instant submittedAt,List<QuizQuestionResult> results) { }
    public record QuizAttemptPage(List<QuizAttemptView> items,int page,int pageSize,long total) { }
    public record FormativeQuizResult(UUID activityId,UUID activityVersionId,UUID revisionId,String locale,int scorePoints,int maxPoints,boolean passed,QuizPolicy policy,List<QuizQuestionResult> results) { }
    public record EnrollCourse(UUID courseResourceId,UUID courseVersionId,String locale) { }
    public record EnrollmentResult(EnrollmentView value,boolean created) { }
    public record VisitActivity(UUID activityId,UUID activityVersionId,String locale) { }
    public record SetActivityProgress(UUID enrollmentId,UUID activityVersionId,boolean read,boolean completed,String locale) { }
    public record CreateActivityNote(UUID activityId,UUID activityVersionId,String locale,String text) { }
    public record UpdateActivityNote(String text) { }
    public record SubmitQuiz(UUID enrollmentId,UUID activityVersionId,UUID revisionId,String locale,UUID submissionId,List<QuizAnswer> answers) { }
    public record CheckQuiz(String locale,UUID revisionId,List<QuizAnswer> answers) { }
}
