package com.chatgptcourses.shared.http;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(NoResourceFoundException.class)
    ProblemDetail notFound(HttpServletRequest request) {
        return ApiProblems.create(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND",
                "La ressource demandée est introuvable.", request.getRequestURI());
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(HttpServletRequest request) {
        return ApiProblems.create(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "La requête n’a pas pu être traitée.", request.getRequestURI());
    }
}
