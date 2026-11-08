package com.chatgptcourses.identity.http;

import com.chatgptcourses.identity.service.AccountProfile;
import com.chatgptcourses.identity.service.PreferencesView;
import com.chatgptcourses.identity.validation.EmailAddresses;
import com.chatgptcourses.identity.validation.ValidAccountPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** Public HTTP contracts; no credential snapshots, JPA entities or client-selected roles. */
public final class IdentityDtos {
    private IdentityDtos() { }

    public record RegisterRequest(@NotBlank @Email @Size(max = 320) String email,
                                  @NotNull @ValidAccountPassword String password,
                                  @Size(max = 120) String displayName,
                                  @NotNull @Pattern(regexp = "fr|en") String locale) {
        public RegisterRequest { email = EmailAddresses.normalize(email); }
        @Override public String toString() { return "RegisterRequest[redacted]"; }
    }

    public record ResetRequest(@NotBlank @Email @Size(max = 320) String email,
                               @NotNull @Pattern(regexp = "fr|en") String locale) {
        public ResetRequest { email = EmailAddresses.normalize(email); }
        @Override public String toString() { return "ResetRequest[redacted]"; }
    }

    public record PasswordReset(@NotBlank @Size(max = 256) @Pattern(regexp = "[A-Za-z0-9_-]+") String token,
                                @NotNull @ValidAccountPassword String newPassword) {
        @Override public String toString() { return "PasswordReset[redacted]"; }
    }

    public record PreferencesPatch(@NotNull @Pattern(regexp = "fr|en") String locale) { }
    public record CsrfResponse(String token, String headerName, String parameterName) { }
    public record AuthUserResponse(UUID id, String email, String displayName, String locale,
                                   List<String> roles, List<String> permissions) {
        public static AuthUserResponse from(AccountProfile profile) {
            return new AuthUserResponse(profile.id(), profile.email(), profile.displayName(), profile.locale(),
                    profile.roles().stream().sorted().toList(), profile.permissions().stream().sorted().toList());
        }
    }
    public record PreferencesResponse(UUID id, String locale, long revision) {
        static PreferencesResponse from(PreferencesView preferences) {
            return new PreferencesResponse(preferences.id(), preferences.locale(), preferences.revision());
        }
    }
}
