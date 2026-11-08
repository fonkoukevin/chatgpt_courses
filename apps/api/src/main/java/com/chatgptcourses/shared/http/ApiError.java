package com.chatgptcourses.shared.http;

import org.springframework.http.HttpStatus;

/** Stable public errors. Exception messages and submitted values never become response details. */
public enum ApiError {
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Certains champs sont invalides."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "La requête est invalide."),
    INVALID_IF_MATCH(HttpStatus.BAD_REQUEST, "L’en-tête If-Match est invalide."),
    CONFLICT(HttpStatus.CONFLICT, "Cette opération entre en conflit avec l’état actuel."),
    REVISION_CONFLICT(HttpStatus.PRECONDITION_FAILED, "La ressource a changé. Rechargez sa révision avant de réessayer."),
    PRECONDITION_REQUIRED(HttpStatus.PRECONDITION_REQUIRED, "Fournissez dans If-Match un ETag de révision explicite obtenu à la lecture."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "La ressource demandée est introuvable."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Cette méthode n’est pas disponible pour cette ressource."),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "Le format de réponse demandé n’est pas disponible."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Le format de la requête n’est pas pris en charge."),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Le service est temporairement indisponible."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "La requête n’a pas pu être traitée.");

    private final HttpStatus status;
    private final String detail;

    ApiError(HttpStatus status, String detail) { this.status = status; this.detail = detail; }
    public HttpStatus status() { return status; }
    public String detail() { return detail; }
}
