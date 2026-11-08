package com.chatgptcourses.shared.http;

import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public final class EntityTags {
    private static final Pattern RESOURCE_KIND = Pattern.compile("[a-z][a-z0-9-]{0,47}");
    public static final long MAX_SAFE_REVISION = 9_007_199_254_740_991L;
    private EntityTags() { }

    /** Include a representation discriminator in kind if the same revision has multiple byte representations. */
    public static String forRevision(String kind, UUID resourceId, long revision) {
        if (kind == null || !RESOURCE_KIND.matcher(kind).matches() || revision < 0 || revision > MAX_SAFE_REVISION) {
            throw new IllegalArgumentException("Invalid server resource revision");
        }
        return "\"" + kind + "-" + Objects.requireNonNull(resourceId) + "-r" + revision + "\"";
    }
}
