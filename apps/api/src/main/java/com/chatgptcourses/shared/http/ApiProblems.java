package com.chatgptcourses.shared.http;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import tools.jackson.databind.ObjectMapper;

public final class ApiProblems {
    private ApiProblems() { }

    public static ProblemDetail create(HttpStatus status, String code, String detail, String path) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setInstance(URI.create(path));
        problem.setProperty("code", code);
        problem.setProperty("traceId", UUID.randomUUID().toString());
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
