package com.chatgptcourses.shared.http;

import java.util.Objects;

/** A business/HTTP failure with a fixed, non-sensitive public description. */
public final class ApiException extends RuntimeException {
    private final ApiError error;
    public ApiException(ApiError error) { super(Objects.requireNonNull(error).name()); this.error = error; }
    public ApiError error() { return error; }
}
