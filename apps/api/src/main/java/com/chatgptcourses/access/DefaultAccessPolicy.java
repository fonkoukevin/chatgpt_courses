package com.chatgptcourses.access;

import org.springframework.stereotype.Component;

@Component
public final class DefaultAccessPolicy implements AccessPolicy {
    @Override
    public Decision decide(AccessSubject subject, AccessResource resource, Action action) {
        if (subject == null || resource == null || resource.id() == null || action == null) return deny(Reason.UNKNOWN_CONTEXT);
        if (resource instanceof AccessResource.PublicContent content) {
            if (action != Action.READ) return deny(Reason.UNSUPPORTED_ACTION);
            return publication(content.published(), content.translationAvailable());
        }
        Decision identity = identity(subject);
        if (!identity.allowed()) return identity;
        return switch (resource) {
            case AccessResource.PedagogicalContent content -> {
                if (action != Action.READ) yield deny(Reason.UNSUPPORTED_ACTION);
                Decision publication = publication(content.published(), content.translationAvailable());
                if (!publication.allowed()) yield publication;
                yield Boolean.TRUE.equals(content.entitlementActive()) ? allow() : deny(Reason.ENTITLEMENT_REQUIRED);
            }
            case AccessResource.PersonalResource personal -> {
                if (action == Action.ADMINISTER) yield deny(Reason.UNSUPPORTED_ACTION);
                yield personal.ownerId() != null && personal.ownerId().equals(subject.userId())
                        ? allow() : deny(Reason.OWNER_MISMATCH);
            }
            case AccessResource.AdministrativeResource administrative -> {
                String permission = administrative.requiredPermissions().get(action);
                yield permission != null && !permission.isBlank() && subject.permissions().contains(permission)
                        ? allow() : deny(Reason.PERMISSION_REQUIRED);
            }
            default -> deny(Reason.UNKNOWN_CONTEXT);
        };
    }

    private static Decision identity(AccessSubject subject) {
        if (!Boolean.TRUE.equals(subject.authenticated())) return deny(Reason.AUTH_REQUIRED);
        if (subject.userId() == null) return deny(Reason.UNKNOWN_CONTEXT);
        return Boolean.TRUE.equals(subject.active()) ? allow() : deny(Reason.ACCOUNT_UNAVAILABLE);
    }

    private static Decision publication(Boolean published, Boolean translationAvailable) {
        if (!Boolean.TRUE.equals(published)) return deny(Reason.CONTENT_UNPUBLISHED);
        return Boolean.TRUE.equals(translationAvailable) ? allow() : deny(Reason.TRANSLATION_UNAVAILABLE);
    }

    private static Decision allow() { return new Decision(true, Reason.ALLOWED); }
    private static Decision deny(Reason reason) { return new Decision(false, reason); }
}
