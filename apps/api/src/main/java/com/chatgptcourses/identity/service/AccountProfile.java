package com.chatgptcourses.identity.service;

import java.util.Set;
import java.util.UUID;

public record AccountProfile(UUID id, String email, String displayName, String locale,
                             Set<String> roles, Set<String> permissions) {
    public AccountProfile { roles = Set.copyOf(roles); permissions = Set.copyOf(permissions); }
}
