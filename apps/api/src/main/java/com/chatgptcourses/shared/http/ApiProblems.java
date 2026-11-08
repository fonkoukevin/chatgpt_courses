package com.chatgptcourses.shared.http;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.UUID;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import tools.jackson.databind.ObjectMapper;

public final class ApiProblems {
    private ApiProblems() { }

    public static ProblemDetail create(HttpStatus status, String code, String detail, String path) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        // Spring 7 leaves type unset; our public contract deliberately includes it explicitly.
        problem.setType(URI.create("about:blank"));
        problem.setTitle(status.getReasonPhrase());
        problem.setInstance(URI.create(path));
        problem.setProperty("code", code);
        problem.setProperty("traceId", UUID.randomUUID().toString());
        return problem;
    }

    public static ProblemDetail create(ApiError error, String path) {
        return create(error.status(), error.name(), error.detail(), path);
    }

    public static ProblemDetail validation(List<ApiFieldError> errors, String path) {
        var problem = create(ApiError.VALIDATION_FAILED, path);
        problem.setProperty("fieldErrors", List.copyOf(errors));
        return problem;
    }

    public static void write(ObjectMapper mapper, HttpServletRequest request,
                             HttpServletResponse response, HttpStatus status,
                             String code, String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setHeader("Cache-Control", "private, no-store");
        mapper.writeValue(response.getOutputStream(), create(status, code, detail, request.getRequestURI()));
    }
}
