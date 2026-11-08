package com.chatgptcourses.learning.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.learning.service.LearningTypes;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
class LearningController {
    private final LearningService service;
    LearningController(LearningService service) { this.service = service; }

    @GetMapping("/me/learning")
    ResponseEntity<LearningDtos.Dashboard> dashboard(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return privateResponse(LearningDtos.Dashboard.from(service.dashboard(actor(principal), locale)));
    }
    @PostMapping("/me/enrollments")
    ResponseEntity<LearningDtos.Enrollment> enroll(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody LearningDtos.Enroll request) {
        var result = service.enroll(actor(principal), context(accountContext), request.command());
        var response = result.created() ? ResponseEntity.created(URI.create("/api/v1/me/enrollments/" + result.value().summary().id() + "?locale=" + request.locale())) : ResponseEntity.ok();
        return response.header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(LearningDtos.Enrollment.from(result.value()));
    }
    @GetMapping("/me/enrollments/{id}")
    ResponseEntity<LearningDtos.Enrollment> enrollment(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return privateResponse(LearningDtos.Enrollment.from(service.enrollment(actor(principal), id, locale)));
    }
    @GetMapping("/me/enrollments/{id}/activities/{activityId}")
    ResponseEntity<LearningDtos.Activity> activity(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @PathVariable UUID activityId, @RequestParam UUID activityVersionId,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return privateResponse(LearningDtos.Activity.from(service.activity(actor(principal), id, activityId, activityVersionId, locale)));
    }
    @PostMapping("/me/enrollments/{id}/visits")
    ResponseEntity<LearningDtos.VisitResult> visit(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody LearningDtos.Visit request) {
        return privateResponse(LearningDtos.VisitResult.from(service.visit(actor(principal), context(accountContext), id, request.command())));
    }
    @GetMapping("/me/activity-progress/{activityId}")
    ResponseEntity<LearningDtos.Progress> progress(@AuthenticationPrincipal IdentityUserDetails principal,
            @PathVariable UUID activityId, @RequestParam UUID enrollmentId, @RequestParam UUID activityVersionId) {
        return progressResponse(service.progress(actor(principal), activityId, enrollmentId, activityVersionId));
    }
    @PutMapping("/me/activity-progress/{activityId}")
    ResponseEntity<LearningDtos.Progress> setProgress(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID activityId,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody LearningDtos.SetProgress request) {
        return progressResponse(service.setProgress(actor(principal), context(accountContext), activityId, ifMatch, request.command()));
    }
    @GetMapping("/me/activity-notes/by-activity/{activityId}")
    ResponseEntity<LearningDtos.NoteLookup> noteForActivity(@AuthenticationPrincipal IdentityUserDetails principal,
            @PathVariable UUID activityId, @RequestParam UUID activityVersionId) {
        return privateResponse(LearningDtos.NoteLookup.from(service.noteForActivity(actor(principal), activityId, activityVersionId)));
    }
    @PostMapping("/me/activity-notes")
    ResponseEntity<LearningDtos.Note> createNote(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody LearningDtos.CreateNote request) {
        return noteResponse(service.createNote(actor(principal), context(accountContext), request.command()), true);
    }
    @GetMapping("/me/activity-notes/{id}")
    ResponseEntity<LearningDtos.Note> note(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return noteResponse(service.note(actor(principal), id), false);
    }
    @PatchMapping("/me/activity-notes/{id}")
    ResponseEntity<LearningDtos.Note> updateNote(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody LearningDtos.UpdateNote request) {
        return noteResponse(service.updateNote(actor(principal), context(accountContext), id, ifMatch, request.command()), false);
    }
    @PostMapping("/activities/{activityId}/quiz-attempts")
    ResponseEntity<LearningDtos.Attempt> submitQuiz(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID activityId,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody LearningDtos.SubmitQuiz request) {
        var result = service.submitQuiz(actor(principal), context(accountContext), activityId, request.command());
        return ResponseEntity.created(URI.create("/api/v1/me/quiz-attempts/" + result.id()))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(LearningDtos.Attempt.from(result));
    }
    @GetMapping("/me/quiz-attempts")
    ResponseEntity<LearningDtos.AttemptPage> attempts(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam UUID activityVersionId,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return privateResponse(LearningDtos.AttemptPage.from(service.attempts(actor(principal), activityVersionId, page, pageSize)));
    }
    @GetMapping("/me/quiz-attempts/{id}")
    ResponseEntity<LearningDtos.Attempt> attempt(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return privateResponse(LearningDtos.Attempt.from(service.attempt(actor(principal), id)));
    }
    private static UUID actor(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal.getUserId();
    }
    private static UUID context(String value) { return value == null ? null : UUID.fromString(value); }
    private static <T> ResponseEntity<T> privateResponse(T value) { return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(value); }
    private static ResponseEntity<LearningDtos.Progress> progressResponse(LearningTypes.ActivityProgressView value) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .eTag(EntityTags.forRevision("activity-progress", value.id(), value.revision())).body(LearningDtos.Progress.from(value));
    }
    private static ResponseEntity<LearningDtos.Note> noteResponse(LearningTypes.ActivityNoteView value, boolean created) {
        var response = created ? ResponseEntity.created(URI.create("/api/v1/me/activity-notes/" + value.id())) : ResponseEntity.ok();
        return response.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .eTag(EntityTags.forRevision("activity-note", value.id(), value.revision())).body(LearningDtos.Note.from(value));
    }
}
