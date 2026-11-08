package com.chatgptcourses.identity.http;

import com.chatgptcourses.identity.http.IdentityDtos.AuthUserResponse;
import com.chatgptcourses.identity.http.IdentityDtos.CsrfResponse;
import com.chatgptcourses.identity.http.IdentityDtos.PasswordReset;
import com.chatgptcourses.identity.http.IdentityDtos.RegisterRequest;
import com.chatgptcourses.identity.http.IdentityDtos.ResetRequest;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class IdentityController {
    private final IdentityService identities;
    IdentityController(IdentityService identities) { this.identities = identities; }

    @GetMapping("/csrf")
    ResponseEntity<CsrfResponse> csrf(CsrfToken csrf) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(new CsrfResponse(csrf.getToken(), csrf.getHeaderName(), csrf.getParameterName()));
    }

    @PostMapping("/register")
    ResponseEntity<AuthUserResponse> register(@Valid @RequestBody RegisterRequest request) {
        var profile = identities.register(request.email(), request.password(), request.displayName(), request.locale());
        return ResponseEntity.status(HttpStatus.CREATED).header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(AuthUserResponse.from(profile));
    }

    @GetMapping("/me")
    ResponseEntity<AuthUserResponse> me(@AuthenticationPrincipal IdentityUserDetails principal) {
        var current = identities.loadSessionUser(requirePrincipal(principal).getUserId())
                .filter(user -> user.active() && user.authenticationVersion() == principal.getAuthenticationVersion())
                .orElseThrow(() -> new ApiException(ApiError.AUTHENTICATION_REQUIRED));
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(AuthUserResponse.from(current.profile()));
    }

    @PostMapping("/password-reset-requests")
    ResponseEntity<Void> resetRequest(@Valid @RequestBody ResetRequest request) {
        identities.requestPasswordReset(request.email(), request.locale());
        return ResponseEntity.accepted().header(HttpHeaders.CACHE_CONTROL, "private, no-store").build();
    }

    @PostMapping("/password-resets")
    ResponseEntity<Void> reset(@Valid @RequestBody PasswordReset request, HttpServletRequest servletRequest) {
        identities.resetPassword(request.token(), request.newPassword());
        var session = servletRequest.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "private, no-store").build();
    }

    private static IdentityUserDetails requirePrincipal(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal;
    }
}
