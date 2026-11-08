package com.chatgptcourses.identity.service;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Set;
import java.util.UUID;

/** Transient authentication lookup result; never a response DTO or session principal. */
public record CredentialSnapshot(UUID id, String email, @JsonIgnore String passwordHash, boolean active,
                                 long authenticationVersion, Set<String> roles, Set<String> permissions) {
    public CredentialSnapshot { roles = Set.copyOf(roles); permissions = Set.copyOf(permissions); }
    @Override public String toString() { return "CredentialSnapshot[redacted]"; }
}
