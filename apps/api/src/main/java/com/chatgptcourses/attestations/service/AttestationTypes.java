package com.chatgptcourses.attestations.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AttestationTypes {
    private AttestationTypes() { }
    public record ParticipationActivity(UUID activityId,UUID activityVersionId,int position,String title,Instant readAt,Instant declaredCompletedAt) { }
    public record ParticipationQuiz(UUID attemptId,UUID activityId,UUID activityVersionId,UUID sourceRevisionId,String locale,int attemptNumber,int scorePoints,int maxPoints,boolean passed,int passPercent,Instant submittedAt) { }
    public record ParticipationAssessment(UUID assessmentId,UUID projectId,UUID projectRevisionId,UUID rubricVersionId,UUID activityId,UUID activityVersionId,String locale,int scorePoints,int maxPoints,int passPoints,boolean thresholdMet,boolean needsRevision,Instant evaluatedAt,boolean declaredByUser) { }
    public record ParticipationEvidence(UUID enrollmentId,UUID courseResourceId,UUID courseVersionId,int courseVersionNumber,String courseTitle,String enrolledLocale,long profileRevision,String participantName,boolean identityVerified,boolean humanReview,List<ParticipationActivity> activities,List<ParticipationQuiz> quizzes,List<ParticipationAssessment> selfAssessments) { @Override public String toString(){return "ParticipationEvidence[private]";} }
    public record AttestationCriterion(String code,boolean met) { }
    public record AttestationEligibility(UUID enrollmentId,String type,String locale,boolean eligible,List<String> blockingCodes,List<AttestationCriterion> criteria,String evidenceFingerprint,ParticipationEvidence evidence) { }
    public record IssueAttestation(String locale,String expectedEvidenceFingerprint) { }
    public record AttestationDocument(String format,String contentType,String filename,long sizeBytes,String sha256) { }
    public record AttestationSummary(UUID id,UUID enrollmentId,String type,String locale,UUID courseResourceId,UUID courseVersionId,int courseVersionNumber,String courseTitle,String participantName,Instant issuedAt,AttestationDocument document) { }
    public record AttestationView(AttestationSummary summary,String evidenceFingerprint,ParticipationEvidence evidence) { }
    public record AttestationCreation(AttestationView value,boolean created) { }
    public record AttestationPage(List<AttestationSummary> items,int page,int pageSize,long total) { }
    public record AttestationEnrollment(UUID enrollmentId,UUID courseResourceId,UUID courseVersionId,int courseVersionNumber,String courseTitle,String enrolledLocale,Instant createdAt) { }
    public record AttestationEnrollmentPage(List<AttestationEnrollment> items,int page,int pageSize,long total) { }
    public record DocumentBytes(byte[] bytes,String filename,String sha256) { @Override public String toString(){return "AttestationDocument[private]";} }
}
