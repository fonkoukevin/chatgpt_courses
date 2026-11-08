package com.chatgptcourses.identity.security;

import com.chatgptcourses.identity.service.CredentialSnapshot;
import com.chatgptcourses.identity.service.SessionUserSnapshot;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.Serial;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public final class IdentityUserDetails implements UserDetails, CredentialsContainer {
    @Serial private static final long serialVersionUID = 1L;
    private final UUID userId;
    private final String email;
    private final boolean active;
    private final long authenticationVersion;
    private final List<SimpleGrantedAuthority> authorities;
    private transient String passwordHash;

    private IdentityUserDetails(UUID id, String email, boolean active, long version, Set<String> roles,
                                Set<String> permissions, String passwordHash) {
        this.userId = id;
        this.email = email;
        this.active = active;
        this.authenticationVersion = version;
        this.authorities = Stream.concat(roles.stream().map(role -> "ROLE_" + role), permissions.stream())
                .distinct().sorted().map(SimpleGrantedAuthority::new).toList();
        this.passwordHash = passwordHash;
    }
    public static IdentityUserDetails fromCredentials(CredentialSnapshot value) {
        return new IdentityUserDetails(value.id(), value.email(), value.active(), value.authenticationVersion(), value.roles(), value.permissions(), value.passwordHash());
    }
    public static IdentityUserDetails fromSession(SessionUserSnapshot value) {
        return new IdentityUserDetails(value.id(), value.email(), value.active(), value.authenticationVersion(), value.roles(), value.permissions(), null);
    }
    public UUID getUserId() { return userId; }
    public long getAuthenticationVersion() { return authenticationVersion; }
    public String getEmail() { return email; }
    /** Stable Spring Session principal index; login input remains the email address. */
    @Override public String getUsername() { return userId.toString(); }
    @Override @JsonIgnore public String getPassword() { return passwordHash; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
    @Override public boolean isEnabled() { return active; }
    @Override public void eraseCredentials() { passwordHash = null; }
    @Override public String toString() { return "IdentityUserDetails[redacted]"; }
}
