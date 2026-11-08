package com.chatgptcourses.learning.http;

import com.chatgptcourses.catalog.http.CatalogDtos;
import com.chatgptcourses.learning.service.LearningTypes;
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

/** HTTP snapshots and commands. The session supplies identity; the client never supplies a score or owner. */
public final class LearningDtos {
    private LearningDtos() { }
    public record Policy(@NotNull @Min(1) @Max(100) Integer passPercent, @Min(1) @Max(50) Integer maxAttempts) {
        public LearningTypes.QuizPolicy command() { return new LearningTypes.QuizPolicy(passPercent, maxAttempts); }
        public static Policy from(LearningTypes.QuizPolicy value) { return value == null ? null : new Policy(value.passPercent(), value.maxAttempts()); }
    }
    public record Enroll(@NotNull UUID courseResourceId, @NotNull UUID courseVersionId,
            @NotNull @Pattern(regexp = "fr|en") String locale) {
        LearningTypes.EnrollCourse command() { return new LearningTypes.EnrollCourse(courseResourceId, courseVersionId, locale); }
    }
    public record Visit(@NotNull UUID activityId, @NotNull UUID activityVersionId,
            @NotNull @Pattern(regexp = "fr|en") String locale) {
        LearningTypes.VisitActivity command() { return new LearningTypes.VisitActivity(activityId, activityVersionId, locale); }
    }
    public record SetProgress(@NotNull UUID enrollmentId, @NotNull UUID activityVersionId,
            @NotNull Boolean read, @NotNull Boolean completed, @NotNull @Pattern(regexp = "fr|en") String locale) {
        LearningTypes.SetActivityProgress command() { return new LearningTypes.SetActivityProgress(enrollmentId, activityVersionId, read, completed, locale); }
    }
    public record CreateNote(@NotNull UUID activityId, @NotNull UUID activityVersionId,
            @NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Size(max = 16000) String text) {
        LearningTypes.CreateActivityNote command() { return new LearningTypes.CreateActivityNote(activityId, activityVersionId, locale, text); }
        @Override public String toString() { return "CreateActivityNote[redacted]"; }
    }
    public record UpdateNote(@NotNull @Size(max = 16000) String text) {
        LearningTypes.UpdateActivityNote command() { return new LearningTypes.UpdateActivityNote(text); }
        @Override public String toString() { return "UpdateActivityNote[redacted]"; }
    }
    public record Answer(@NotBlank @Size(max = 64) @Pattern(regexp = "[a-zA-Z0-9][a-zA-Z0-9_-]*") String key,
            @NotNull @Min(0) @Max(7) Integer optionIndex) {
        LearningTypes.QuizAnswer command() { return new LearningTypes.QuizAnswer(key, optionIndex); }
    }
    public record SubmitQuiz(@NotNull UUID enrollmentId, @NotNull UUID activityVersionId, @NotNull UUID revisionId,
            @NotNull @Pattern(regexp = "fr|en") String locale, @NotNull UUID submissionId,
            @NotNull @Size(min = 1, max = 20) List<@NotNull @Valid Answer> answers) {
        LearningTypes.SubmitQuiz command() { return new LearningTypes.SubmitQuiz(enrollmentId, activityVersionId, revisionId, locale, submissionId, answers.stream().map(Answer::command).toList()); }
        @Override public String toString() { return "SubmitQuiz[redacted]"; }
    }
    public record QuizCheck(@NotNull UUID revisionId, @NotNull @Pattern(regexp = "fr|en") String locale,
            @NotNull @Size(min = 1, max = 20) List<@NotNull @Valid Answer> answers) {
        LearningTypes.CheckQuiz command() { return new LearningTypes.CheckQuiz(locale, revisionId, answers.stream().map(Answer::command).toList()); }
        @Override public String toString() { return "QuizCheck[redacted]"; }
    }
    public record Totals(int totalActivities, int readActivities, int completedActivities, int quizPassedActivities, String projectAvailability) {
        static Totals from(LearningTypes.ProgressTotals value) { return new Totals(value.totalActivities(), value.readActivities(), value.completedActivities(), value.quizPassedActivities(), value.projectAvailability()); }
    }
    public record Resume(UUID enrollmentId, UUID courseResourceId, UUID courseVersionId, String courseSlug,
            UUID activityId, UUID activityVersionId, String activitySlug, String locale, String title) {
        static Resume from(LearningTypes.ResumeTarget value) {
            return value == null ? null : new Resume(value.enrollmentId(), value.courseResourceId(), value.courseVersionId(), value.courseSlug(), value.activityId(), value.activityVersionId(), value.activitySlug(), value.locale(), value.title());
        }
    }
    public record Summary(UUID id, UUID courseResourceId, UUID courseVersionId, int courseVersionNumber,
            String title, String enrolledLocale, String courseSlug, String accessStatus, String availability,
            Totals progress, Instant createdAt, Instant lastVisitedAt) {
        static Summary from(LearningTypes.EnrollmentSummary value) {
            return new Summary(value.id(), value.courseResourceId(), value.courseVersionId(), value.courseVersionNumber(), value.title(), value.enrolledLocale(), value.courseSlug(), value.accessStatus(), value.availability(), Totals.from(value.progress()), value.createdAt(), value.lastVisitedAt());
        }
    }
    public record Dashboard(Resume resume, List<Summary> enrollments, List<MethodDtos.Summary> recentMethods, String recentMethodsAvailability) {
        static Dashboard from(LearningTypes.LearningDashboard value) { return new Dashboard(Resume.from(value.resume()), value.enrollments().stream().map(Summary::from).toList(), value.recentMethods().stream().map(MethodDtos.Summary::from).toList(), value.recentMethodsAvailability()); }
    }
    public record Progress(UUID id, UUID enrollmentId, UUID activityId, UUID activityVersionId, long revision, Instant readAt, Instant completedAt) {
        static Progress from(LearningTypes.ActivityProgressView value) { return new Progress(value.id(), value.enrollmentId(), value.activityId(), value.activityVersionId(), value.revision(), value.readAt(), value.completedAt()); }
    }
    public record EnrolledActivity(UUID activityId, UUID activityVersionId, UUID moduleId, UUID moduleVersionId,
            int position, String title, String accessStatus, String availability, Progress progress) {
        static EnrolledActivity from(LearningTypes.EnrolledActivity value) { return new EnrolledActivity(value.activityId(), value.activityVersionId(), value.moduleId(), value.moduleVersionId(), value.position(), value.title(), value.accessStatus(), value.availability(), Progress.from(value.progress())); }
    }
    public record Enrollment(Summary summary, List<CatalogDtos.Curriculum> curriculum, List<EnrolledActivity> activities) {
        static Enrollment from(LearningTypes.EnrollmentView value) { return new Enrollment(Summary.from(value.summary()), value.curriculum().stream().map(CatalogDtos.Curriculum::from).toList(), value.activities().stream().map(EnrolledActivity::from).toList()); }
    }
    public record ActivityLink(UUID activityId, UUID activityVersionId, String slug, String title, String availability, String accessStatus) {
        static ActivityLink from(LearningTypes.ActivityLink value) { return value == null ? null : new ActivityLink(value.activityId(), value.activityVersionId(), value.slug(), value.title(), value.availability(), value.accessStatus()); }
    }
    public record QuizOverview(Policy policy, int attemptsUsed, Integer attemptsRemaining, UUID latestAttemptId, boolean passed) {
        static QuizOverview from(LearningTypes.QuizOverview value) { return value == null ? null : new QuizOverview(Policy.from(value.policy()), value.attemptsUsed(), value.attemptsRemaining(), value.latestAttemptId(), value.passed()); }
    }
    public record Activity(UUID enrollmentId, UUID activityId, UUID activityVersionId, UUID moduleId, UUID moduleVersionId,
            int position, int totalActivities, CatalogDtos.Detail resource, Progress progress, ActivityLink previous,
            ActivityLink next, QuizOverview quiz, String accessStatus, String availability) {
        static Activity from(LearningTypes.LearningActivity value) { return new Activity(value.enrollmentId(), value.activityId(), value.activityVersionId(), value.moduleId(), value.moduleVersionId(), value.position(), value.totalActivities(), CatalogDtos.Detail.from(value.resource()), Progress.from(value.progress()), ActivityLink.from(value.previous()), ActivityLink.from(value.next()), QuizOverview.from(value.quiz()), value.accessStatus(), value.availability()); }
    }
    public record VisitResult(UUID enrollmentId, UUID activityId, UUID activityVersionId, Instant visitedAt) {
        static VisitResult from(LearningTypes.VisitView value) { return new VisitResult(value.enrollmentId(), value.activityId(), value.activityVersionId(), value.visitedAt()); }
    }
    public record Note(UUID id, UUID activityId, UUID activityVersionId, String locale, String text, long revision, Instant createdAt, Instant updatedAt) {
        static Note from(LearningTypes.ActivityNoteView value) { return new Note(value.id(), value.activityId(), value.activityVersionId(), value.locale(), value.text(), value.revision(), value.createdAt(), value.updatedAt()); }
        @Override public String toString() { return "ActivityNote[redacted]"; }
    }
    public record NoteLookup(Note note) {
        static NoteLookup from(LearningTypes.ActivityNoteLookup value) { return new NoteLookup(value.note() == null ? null : Note.from(value.note())); }
    }
    public record QuestionResult(String key, String prompt, List<String> options, int selectedOption, int correctOption,
            boolean correct, String explanation, int points, int awardedPoints) {
        static QuestionResult from(LearningTypes.QuizQuestionResult value) { return new QuestionResult(value.key(), value.prompt(), value.options(), value.selectedOption(), value.correctOption(), value.correct(), value.explanation(), value.points(), value.awardedPoints()); }
    }
    public record Attempt(UUID id, UUID submissionId, UUID enrollmentId, UUID activityId, UUID activityVersionId,
            UUID revisionId, String locale, int attemptNumber, int scorePoints, int maxPoints, boolean passed,
            Policy policy, Instant submittedAt, List<QuestionResult> results) {
        static Attempt from(LearningTypes.QuizAttemptView value) { return new Attempt(value.id(), value.submissionId(), value.enrollmentId(), value.activityId(), value.activityVersionId(), value.revisionId(), value.locale(), value.attemptNumber(), value.scorePoints(), value.maxPoints(), value.passed(), Policy.from(value.policy()), value.submittedAt(), value.results().stream().map(QuestionResult::from).toList()); }
    }
    public record AttemptPage(List<Attempt> items, int page, int pageSize, long total) {
        static AttemptPage from(LearningTypes.QuizAttemptPage value) { return new AttemptPage(value.items().stream().map(Attempt::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record QuizCheckResult(UUID activityId, UUID activityVersionId, UUID revisionId, String locale, int scorePoints,
            int maxPoints, boolean passed, Policy policy, List<QuestionResult> results) {
        static QuizCheckResult from(LearningTypes.FormativeQuizResult value) { return new QuizCheckResult(value.activityId(), value.activityVersionId(), value.revisionId(), value.locale(), value.scorePoints(), value.maxPoints(), value.passed(), Policy.from(value.policy()), value.results().stream().map(QuestionResult::from).toList()); }
    }
}
