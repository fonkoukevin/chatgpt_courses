package com.chatgptcourses.methods.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.service.MethodService;
import com.chatgptcourses.methods.service.MethodTypes;
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
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/v1/me/methods")
class PersonalMethodsController {
    private final MethodService service;
    PersonalMethodsController(MethodService service) { this.service = service; }

    @GetMapping
    ResponseEntity<MethodDtos.Page> list(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam(required = false) @Size(max = 240) String q,
            @RequestParam(required = false) @Size(min = 1, max = 80) String category,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return privateResponse(MethodDtos.Page.from(service.list(actor(principal), new MethodTypes.MethodQuery(q, category, page, pageSize))));
    }

    @GetMapping("/{id}")
    ResponseEntity<MethodDtos.Method> get(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return method(service.get(actor(principal), id), false);
    }

    @PostMapping
    ResponseEntity<MethodDtos.Method> create(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody MethodDtos.Create request) {
        return method(service.create(actor(principal), context(accountContext), request.command()), true);
    }

    @PostMapping("/from-template")
    ResponseEntity<MethodDtos.Method> fromTemplate(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody MethodDtos.FromTemplate request) {
        return method(service.fromTemplate(actor(principal), context(accountContext), request.command()), true);
    }

    @PatchMapping("/{id}")
    ResponseEntity<MethodDtos.Method> update(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @Valid @RequestBody MethodDtos.Update request) {
        return method(service.update(actor(principal), context(accountContext), id, ifMatch, request.command()), false);
    }

    @PostMapping("/{id}/duplicates")
    ResponseEntity<MethodDtos.Method> duplicate(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {
        return method(service.duplicate(actor(principal), context(accountContext), id, ifMatch), true);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id,
            @RequestHeader(value = "X-Account-Context", required = false) @Pattern(regexp = MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {
        service.delete(actor(principal), context(accountContext), id, ifMatch);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "private, no-store").build();
    }

    @GetMapping("/{id}/source-update")
    ResponseEntity<MethodDtos.SourceUpdate> sourceUpdate(@AuthenticationPrincipal IdentityUserDetails principal, @PathVariable UUID id) {
        return privateResponse(MethodDtos.SourceUpdate.from(service.sourceUpdate(actor(principal), id)));
    }

    private static UUID actor(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal.getUserId();
    }
    private static UUID context(String value) { return value == null ? null : UUID.fromString(value); }
    private static <T> ResponseEntity<T> privateResponse(T value) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(value);
    }
    private static ResponseEntity<MethodDtos.Method> method(MethodTypes.MethodView value, boolean created) {
        var response = created ? ResponseEntity.created(URI.create("/api/v1/me/methods/" + value.id())) : ResponseEntity.ok();
        return response.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .eTag(EntityTags.forRevision("personal-method", value.id(), value.revision())).body(MethodDtos.Method.from(value));
    }
}
