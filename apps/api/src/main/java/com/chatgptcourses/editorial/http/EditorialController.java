package com.chatgptcourses.editorial.http;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.http.CatalogDtos;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.editorial.service.ContentTypes;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/contents")
class EditorialController {
    private final EditorialService service;
    EditorialController(EditorialService service) { this.service = service; }

    @GetMapping
    ResponseEntity<EditorialDtos.Page<EditorialDtos.Summary>> list(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam(required = false) @Size(max = 240) String q,
            @RequestParam(required = false) ResourceKind kind, @RequestParam(required = false) EditorialState state,
            @RequestParam(required = false) @Pattern(regexp = "fr|en") String locale,
            @RequestParam(required = false) UUID courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant verifiedBefore,
            @RequestParam(required = false) Boolean needsUpdate,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        var result = service.list(actor(principal), new ContentTypes.ContentQuery(q, kind, state, locale, courseId, verifiedBefore, needsUpdate, page, size));
        return privateResponse(new EditorialDtos.Page<>(result.items().stream().map(EditorialDtos.Summary::from).toList(), result.page(), result.size(), result.total()));
    }

    @PostMapping
    ResponseEntity<EditorialDtos.Content> create(@AuthenticationPrincipal IdentityUserDetails principal,
                                                @Valid @RequestBody EditorialDtos.Create request) {
        return content(service.create(actor(principal), request.command()), true);
    }

    @GetMapping("/{id}")
    ResponseEntity<EditorialDtos.Content> get(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return content(service.get(actor(principal), id), false);
    }

    @GetMapping("/{id}/preview")
    ResponseEntity<EditorialDtos.Content> preview(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return content(service.get(actor(principal), id), false);
    }

    @PostMapping("/{id}/revisions")
    ResponseEntity<EditorialDtos.Content> revise(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Save request) {
        return content(service.revise(actor(principal), id, ifMatch, request.command()), false);
    }

    @PostMapping("/{id}/versions")
    ResponseEntity<EditorialDtos.Content> version(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Version request) {
        return content(service.newVersion(actor(principal), id, ifMatch, request.command()), true);
    }

    @PostMapping("/{id}/duplicate")
    ResponseEntity<EditorialDtos.Content> duplicate(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Duplicate request) {
        return content(service.duplicate(actor(principal), id, ifMatch, request.command()), true);
    }

    @PostMapping("/{id}/translations")
    ResponseEntity<EditorialDtos.Content> translate(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Translation request) {
        return content(service.translate(actor(principal), id, ifMatch, request.command()), true);
    }

    @PostMapping("/{id}/transition")
    ResponseEntity<EditorialDtos.Content> transition(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Transition request) {
        return content(service.transition(actor(principal), id, ifMatch, request.command()), false);
    }

    @PostMapping("/{id}/publish")
    ResponseEntity<EditorialDtos.Content> publish(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Publish request) {
        return content(service.publish(actor(principal), id, ifMatch, request.command()), false);
    }

    @PostMapping("/{id}/archive")
    ResponseEntity<EditorialDtos.Content> archive(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Archive request) {
        return content(service.archive(actor(principal), id, ifMatch, request.command()), false);
    }

    @PutMapping("/{id}/composition")
    ResponseEntity<EditorialDtos.Content> composition(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody EditorialDtos.Composition request) {
        return content(service.composition(actor(principal), id, ifMatch, request.command()), false);
    }

    @PutMapping("/{id}/metadata")
    ResponseEntity<EditorialDtos.Content> metadata(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody CatalogDtos.SaveMetadata request) {
        return content(service.metadata(actor(principal), id, ifMatch, request.command()), false);
    }

    @GetMapping("/{id}/readiness")
    ResponseEntity<EditorialDtos.Readiness> readiness(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return privateResponse(EditorialDtos.Readiness.from(service.readiness(actor(principal), id)));
    }

    @GetMapping("/{id}/dependencies")
    ResponseEntity<EditorialDtos.Dependencies> dependencies(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return privateResponse(EditorialDtos.Dependencies.from(service.dependencies(actor(principal), id)));
    }

    @GetMapping("/{id}/revisions")
    ResponseEntity<EditorialDtos.Page<EditorialDtos.Revision>> history(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        var result = service.history(actor(principal), id, page, size);
        return privateResponse(new EditorialDtos.Page<>(result.items().stream().map(EditorialDtos.Revision::from).toList(), result.page(), result.size(), result.total()));
    }

    private static ResponseEntity<EditorialDtos.Content> content(ContentTypes.ContentView value, boolean created) {
        var response = created ? ResponseEntity.created(URI.create("/api/v1/admin/contents/" + value.id())) : ResponseEntity.ok();
        return response.header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
                .eTag(EntityTags.forRevision("content", value.id(), value.revision())).body(EditorialDtos.Content.from(value));
    }
    private static <T> ResponseEntity<T> privateResponse(T value) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Robots-Tag", "noindex, nofollow").body(value);
    }
    private static UUID actor(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal.getUserId();
    }
}
