package com.chatgptcourses.access;

/** Internal policy boundary. It complements Spring filters and per-use-case authorization; it does not replace them. */
public interface AccessPolicy {
    enum Action { READ, UPDATE, DELETE, ADMINISTER }
    enum Reason { ALLOWED, UNKNOWN_CONTEXT, UNSUPPORTED_ACTION, AUTH_REQUIRED, ACCOUNT_UNAVAILABLE,
        CONTENT_UNPUBLISHED, TRANSLATION_UNAVAILABLE, ENTITLEMENT_REQUIRED, OWNER_MISMATCH, PERMISSION_REQUIRED }
    record Decision(boolean allowed, Reason reason) { }
    Decision decide(AccessSubject subject, AccessResource resource, Action action);
}
