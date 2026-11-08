package com.chatgptcourses.shared.http;

import jakarta.persistence.OptimisticLockException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> application(ApiException exception, HttpServletRequest request) {
        return response(ApiProblems.create(exception.error(), request.getRequestURI()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        var errors = exception.getBindingResult().getAllErrors().stream()
                .map(error -> ApiFieldError.from(error instanceof FieldError field ? field.getField() : "_request", error.getCode()))
                .toList();
        return validation(errors, request);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> methodValidation(HandlerMethodValidationException exception, HttpServletRequest request) {
        // Invalid server return values are internal defects, not client validation errors.
        if (exception.isForReturnValue()) return response(ApiProblems.create(ApiError.INTERNAL_ERROR, request.getRequestURI()));
        var errors = new ArrayList<ApiFieldError>();
        for (var parameter : exception.getParameterValidationResults()) {
            if (parameter instanceof ParameterErrors beanErrors) {
                for (var error : beanErrors.getAllErrors()) {
                    errors.add(ApiFieldError.from(error instanceof FieldError field ? field.getField() : "_request", error.getCode()));
                }
            } else {
                for (var error : parameter.getResolvableErrors()) {
                    errors.add(ApiFieldError.from(parameter.getMethodParameter().getParameterName(), constraintCode(error)));
                }
            }
        }
        for (var ignored : exception.getCrossParameterValidationResults()) errors.add(ApiFieldError.from("_request", null));
        return validation(errors, request);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ProblemDetail> constraintValidation(ConstraintViolationException exception, HttpServletRequest request) {
        var errors = exception.getConstraintViolations().stream().map(violation -> ApiFieldError.from(
                violation.getPropertyPath().toString(), violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName())).toList();
        return validation(errors, request);
    }

    @ExceptionHandler({OptimisticLockException.class, OptimisticLockingFailureException.class})
    ResponseEntity<ProblemDetail> revisionConflict(HttpServletRequest request) {
        return response(ApiProblems.create(ApiError.REVISION_CONFLICT, request.getRequestURI()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> conflict(HttpServletRequest request) {
        return response(ApiProblems.create(ApiError.CONFLICT, request.getRequestURI()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ProblemDetail> invalidRequest(HttpServletRequest request) {
        return response(ApiProblems.create(ApiError.INVALID_REQUEST, request.getRequestURI()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> notFound(HttpServletRequest request) {
        return response(ApiProblems.create(ApiError.RESOURCE_NOT_FOUND, request.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception exception, HttpServletRequest request) {
        if (exception instanceof ErrorResponse error) {
            ApiError publicError = switch (error.getStatusCode().value()) {
                case 400 -> ApiError.INVALID_REQUEST;
                case 404 -> ApiError.RESOURCE_NOT_FOUND;
                case 405 -> ApiError.METHOD_NOT_ALLOWED;
                case 406 -> ApiError.NOT_ACCEPTABLE;
                case 415 -> ApiError.UNSUPPORTED_MEDIA_TYPE;
                default -> ApiError.INTERNAL_ERROR;
            };
            var headers = new HttpHeaders();
            if (publicError.status() == HttpStatus.METHOD_NOT_ALLOWED) headers.setAllow(error.getHeaders().getAllow());
            return ResponseEntity.status(publicError.status()).headers(headers)
                    .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                    .body(ApiProblems.create(publicError, request.getRequestURI()));
        }
        return response(ApiProblems.create(ApiError.INTERNAL_ERROR, request.getRequestURI()));
    }

    private ResponseEntity<ProblemDetail> validation(List<ApiFieldError> errors, HttpServletRequest request) {
        var sorted = errors.stream().distinct().sorted(Comparator.comparing(ApiFieldError::field).thenComparing(ApiFieldError::code)).toList();
        return response(ApiProblems.validation(sorted, request.getRequestURI()));
    }

    private static String constraintCode(MessageSourceResolvable error) {
        var codes = error.getCodes();
        if (codes == null || codes.length == 0) return null;
        return codes[codes.length - 1].split("\\.", 2)[0];
    }

    private static ResponseEntity<ProblemDetail> response(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(problem);
    }
}
