package com.chatgptcourses.shared.http;

import java.util.regex.Pattern;

/**
 * Explicit-revision If-Match policy, based on RFC 9110 sections 5.6.1, 8.8.3 and 13.1.1.
 * Call after authorization and loading the resource inside the write transaction. This comparison
 * is not a lock: JPA @Version (or an equivalent conditional UPDATE) must guard the actual write.
 */
public final class RevisionPreconditions {
    private static final Pattern ENTITY_TAG = Pattern.compile("(?:W/)?\"[\\x21\\x23-\\x7E\\x80-\\xFF]*\"");
    private static final int MAX_HEADER_LENGTH = 4096;
    private static final int MAX_LIST_ELEMENTS = 64;
    private RevisionPreconditions() { }

    public static void requireMatch(String ifMatch, String currentStrongTag) {
        if (ifMatch == null || ifMatch.isBlank()) throw new ApiException(ApiError.PRECONDITION_REQUIRED);
        if (currentStrongTag == null || currentStrongTag.startsWith("W/") || !ENTITY_TAG.matcher(currentStrongTag).matches()) {
            throw new IllegalArgumentException("A current strong server ETag is required");
        }
        if (ifMatch.length() > MAX_HEADER_LENGTH) throw new ApiException(ApiError.INVALID_IF_MATCH);
        String header = trimOws(ifMatch);
        // '*' is valid HTTP existence semantics, but does not satisfy this API's explicit-revision policy.
        if (header.equals("*")) throw new ApiException(ApiError.PRECONDITION_REQUIRED);
        int position = 0;
        int elements = 0;
        boolean hasTag = false;
        boolean matches = false;
        while (position < header.length()) {
            while (position < header.length() && isOws(header.charAt(position))) position++;
            if (position == header.length()) break;
            if (++elements > MAX_LIST_ELEMENTS) throw new ApiException(ApiError.INVALID_IF_MATCH);
            if (header.charAt(position) == ',') { position++; continue; }
            var tag = ENTITY_TAG.matcher(header).region(position, header.length());
            if (!tag.lookingAt()) throw new ApiException(ApiError.INVALID_IF_MATCH);
            hasTag = true;
            String value = tag.group();
            matches |= !value.startsWith("W/") && value.equals(currentStrongTag);
            position = tag.end();
            while (position < header.length() && isOws(header.charAt(position))) position++;
            if (position < header.length()) {
                if (header.charAt(position) != ',') throw new ApiException(ApiError.INVALID_IF_MATCH);
                position++;
            }
        }
        if (!hasTag) throw new ApiException(ApiError.INVALID_IF_MATCH);
        if (!matches) throw new ApiException(ApiError.REVISION_CONFLICT);
    }

    private static String trimOws(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && isOws(value.charAt(start))) start++;
        while (end > start && isOws(value.charAt(end - 1))) end--;
        return value.substring(start, end);
    }
    private static boolean isOws(char value) { return value == ' ' || value == '\t'; }
}
