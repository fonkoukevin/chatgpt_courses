package com.chatgptcourses.identity.service;

import java.util.Set;
import java.util.UUID;

public record SessionUserSnapshot(UUID id, String email, String displayName, String locale, boolean active,
                                  long authenticationVersion, Set<String> roles, Set<String> permissions) {
    public SessionUserSnapshot { roles = Set.copyOf(roles); permissions = Set.copyOf(permissions); }
    public AccountProfile profile() { return new AccountProfile(id, email, displayName, locale, roles, permissions); }
}
