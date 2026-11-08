package com.chatgptcourses.projects.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.projects.service.ProjectTypes;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
class ProjectController {
    private final ProjectService service;
    ProjectController(ProjectService service) { this.service = service; }

    @GetMapping("/project-templates/{activityId}/versions/{versionId}")
    ResponseEntity<ProjectDtos.ProjectTemplate> template(@PathVariable UUID activityId, @PathVariable UUID versionId,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(ProjectDtos.ProjectTemplate.from(service.template(activityId, versionId, locale)));
    }
    @GetMapping("/me/projects")
    ResponseEntity<ProjectDtos.ProjectPage> list(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam(required = false) @Size(max = 240) String q,
            @RequestParam(required = false) @Pattern(regexp = "DRAFT|READY_FOR_SELF_ASSESSMENT|SELF_ASSESSED|NEEDS_REVISION") String state,
            @RequestParam(required = false) UUID activityId, @RequestParam(required = false) UUID activityVersionId,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return privateResponse(ProjectDtos.ProjectPage.from(service.list(actor(principal), new ProjectTypes.ProjectQuery(q, state, activityId, activityVersionId, page, pageSize))));
    }
    @PostMapping("/me/projects")
    ResponseEntity<ProjectDtos.ProjectView> create(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody ProjectDtos.CreateProject request) {
        var result = service.create(actor(principal), context(accountContext), request.command());
        var response = result.created() ? ResponseEntity.created(URI.create("/api/v1/me/projects/" + result.value().id())) : ResponseEntity.ok();
        return response.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header(HttpHeaders.LOCATION, "/api/v1/me/projects/" + result.value().id())
                .eTag(tag(result.value())).body(ProjectDtos.ProjectView.from(result.value()));
    }
    @GetMapping("/me/projects/{id}")
    ResponseEntity<ProjectDtos.ProjectView> get(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return projectResponse(service.get(actor(principal), id));
    }
    @PatchMapping("/me/projects/{id}")
    ResponseEntity<ProjectDtos.ProjectView> save(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody ProjectDtos.SaveProject request) {
        return projectResponse(service.save(actor(principal), context(accountContext), id, ifMatch, request.command()));
    }
    @GetMapping("/me/projects/{id}/revisions")
    ResponseEntity<ProjectDtos.ProjectRevisionPage> revisions(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return privateResponse(ProjectDtos.ProjectRevisionPage.from(service.revisions(actor(principal), id, page, pageSize)));
    }
    @GetMapping("/me/projects/{id}/revisions/{revisionId}")
    ResponseEntity<ProjectDtos.ProjectRevisionView> revision(@AuthenticationPrincipal IdentityUserDetails principal,
            @PathVariable UUID id, @PathVariable UUID revisionId) {
        return privateResponse(ProjectDtos.ProjectRevisionView.from(service.revision(actor(principal), id, revisionId)));
    }
    @GetMapping("/me/projects/{id}/context")
    ResponseEntity<ProjectDtos.ProjectContext> context(@AuthenticationPrincipal IdentityUserDetails principal,
            @PathVariable UUID id, @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return privateResponse(ProjectDtos.ProjectContext.from(service.context(actor(principal), id, locale)));
    }
    @GetMapping("/me/projects/{id}/status")
    ResponseEntity<ProjectDtos.ProjectStatus> status(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return privateResponse(ProjectDtos.ProjectStatus.from(service.status(actor(principal), id)));
    }
    @PostMapping("/me/projects/{id}/self-assessments")
    ResponseEntity<ProjectDtos.SelfAssessmentView> selfAssess(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody ProjectDtos.SubmitSelfAssessment request) {
        var result = service.selfAssess(actor(principal), context(accountContext), id, ifMatch, request.command());
        return ResponseEntity.created(URI.create("/api/v1/me/projects/" + id + "/self-assessments/" + result.id()))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(ProjectDtos.SelfAssessmentView.from(result));
    }
    @GetMapping("/me/projects/{id}/self-assessments")
    ResponseEntity<ProjectDtos.SelfAssessmentPage> assessments(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return privateResponse(ProjectDtos.SelfAssessmentPage.from(service.assessments(actor(principal), id, page, pageSize)));
    }
    @GetMapping("/me/projects/{id}/self-assessments/{assessmentId}")
    ResponseEntity<ProjectDtos.SelfAssessmentView> assessment(@AuthenticationPrincipal IdentityUserDetails principal,
            @PathVariable UUID id, @PathVariable UUID assessmentId) {
        return privateResponse(ProjectDtos.SelfAssessmentView.from(service.assessment(actor(principal), id, assessmentId)));
    }
    @PostMapping("/activities/{activityId}/solution-reveals")
    ResponseEntity<ProjectDtos.SolutionRevealView> reveal(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID activityId,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody ProjectDtos.RevealSolution request) {
        return privateResponse(ProjectDtos.SolutionRevealView.from(service.reveal(actor(principal), context(accountContext), activityId, request.command())));
    }
    private static UUID actor(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal.getUserId();
    }
    private static UUID context(String value) { return value == null ? null : UUID.fromString(value); }
    private static String tag(ProjectTypes.ProjectView value) { return EntityTags.forRevision("project", value.id(), value.revision()); }
    private static ResponseEntity<ProjectDtos.ProjectView> projectResponse(ProjectTypes.ProjectView value) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").eTag(tag(value)).body(ProjectDtos.ProjectView.from(value));
    }
    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(body);
    }
}
