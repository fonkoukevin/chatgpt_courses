package com.chatgptcourses.operations;

import jakarta.validation.constraints.NotNull;

/** Explicit public projection; no datasource or session details are serialized. */
public record SystemHealthResponse(@NotNull Status status) {
    public enum Status { UP }
}
