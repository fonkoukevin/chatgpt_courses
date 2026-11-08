package com.chatgptcourses.access;

import java.util.Map;
import java.util.UUID;

/** Server-side resource facts. No ownership, publication or entitlement fact is supplied by the browser. */
public sealed interface AccessResource {
    UUID id();

    record PublicContent(UUID id, Boolean published, Boolean translationAvailable) implements AccessResource { }
    record PedagogicalContent(UUID id, Boolean published, Boolean translationAvailable,
                              Boolean entitlementActive) implements AccessResource { }
    record PersonalResource(UUID id, UUID ownerId) implements AccessResource { }
    record AdministrativeResource(UUID id, Map<AccessPolicy.Action, String> requiredPermissions) implements AccessResource {
        public AdministrativeResource { requiredPermissions = requiredPermissions == null ? Map.of() : Map.copyOf(requiredPermissions); }
    }
}
