package com.chatgptcourses.access;

import java.util.Set;
import java.util.UUID;

/** Server snapshot from Spring identity/permissions, never a request DTO. */
public record AccessSubject(UUID userId, Boolean authenticated, Boolean active, Set<String> permissions) {
    public AccessSubject { permissions = permissions == null ? Set.of() : Set.copyOf(permissions); }
    public static AccessSubject anonymous() { return new AccessSubject(null, false, false, Set.of()); }
}
