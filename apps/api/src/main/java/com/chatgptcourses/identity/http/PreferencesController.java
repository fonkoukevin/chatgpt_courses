package com.chatgptcourses.identity.http;

import com.chatgptcourses.identity.http.IdentityDtos.PreferencesPatch;
import com.chatgptcourses.identity.http.IdentityDtos.PreferencesResponse;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.identity.service.PreferencesView;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/preferences")
class PreferencesController {
    private final IdentityService identities;
    PreferencesController(IdentityService identities) { this.identities = identities; }

    @GetMapping
    ResponseEntity<PreferencesResponse> preferences(@AuthenticationPrincipal IdentityUserDetails principal) {
        return response(identities.getPreferences(requirePrincipal(principal).getUserId()));
    }

    @PatchMapping
    ResponseEntity<PreferencesResponse> update(@AuthenticationPrincipal IdentityUserDetails principal,
                                               @RequestHeader(value = "X-Account-Context", required = false) String accountContext,
                                               @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
                                               @Valid @RequestBody PreferencesPatch request) {
        return response(identities.updatePreferences(requirePrincipal(principal).getUserId(),com.chatgptcourses.account.service.AccountOperations.context(accountContext),ifMatch,request.locale()));
    }

    private static ResponseEntity<PreferencesResponse> response(PreferencesView preferences) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .eTag(EntityTags.forRevision("preferences", preferences.id(), preferences.revision()))
                .body(PreferencesResponse.from(preferences));
    }

    private static IdentityUserDetails requirePrincipal(IdentityUserDetails principal) {
        if (principal == null) throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        return principal;
    }
}
