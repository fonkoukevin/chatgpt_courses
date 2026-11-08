package com.chatgptcourses.shared.http;

import org.springframework.http.HttpStatus;

/** Stable public errors. Exception messages and submitted values never become response details. */
public enum ApiError {
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Certains champs sont invalides."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "La requête est invalide."),
    INVALID_IF_MATCH(HttpStatus.BAD_REQUEST, "L’en-tête If-Match est invalide."),
    INVALID_RESET_TOKEN(HttpStatus.BAD_REQUEST, "Le lien de récupération est invalide ou a expiré."),
    EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "Cette adresse ne peut pas être utilisée pour cette inscription."),
    AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "Une authentification est nécessaire."),
    ACCOUNT_UNAVAILABLE(HttpStatus.UNAUTHORIZED, "La session n’est plus disponible. Reconnectez-vous."),
    ACCOUNT_CONTEXT_REQUIRED(HttpStatus.PRECONDITION_REQUIRED, "Confirmez le compte attendu avant cette action."),
    ACCOUNT_CONTEXT_CHANGED(HttpStatus.CONFLICT, "Le compte connecté a changé. Vérifiez le compte attendu avant de confirmer l’action."),
    BAD_CREDENTIALS(HttpStatus.UNAUTHORIZED, "L’adresse ou le mot de passe est incorrect."),
    CSRF_INVALID(HttpStatus.FORBIDDEN, "Le contrôle de session a expiré ou est invalide. Rechargez-le avant de réessayer."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "Cette action n’est pas autorisée."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Trop de demandes. Réessayez plus tard."),
    CONTENT_NOT_READY(HttpStatus.CONFLICT, "Le contenu présente encore des éléments à vérifier avant cette action."),
    INVALID_CONTENT_TRANSITION(HttpStatus.CONFLICT, "Cette transition éditoriale n’est pas disponible dans l’état courant."),
    NEW_PEDAGOGICAL_VERSION_REQUIRED(HttpStatus.CONFLICT, "Cette modification nécessite une nouvelle version pédagogique."),
    ACTIVITY_NOTE_EXISTS(HttpStatus.CONFLICT, "Une note existe déjà pour cette version d’activité. Ouvrez-la avant de la modifier."),
    QUIZ_UNAVAILABLE(HttpStatus.CONFLICT, "Aucun quiz n’est disponible pour cette activité."),
    QUIZ_ATTEMPTS_EXHAUSTED(HttpStatus.CONFLICT, "Le nombre de tentatives prévu pour ce quiz est atteint."),
    PROJECT_NOT_READY(HttpStatus.CONFLICT, "Préparez et enregistrez une production avant cette action."),
    SOLUTION_REVEAL_REQUIRES_ASSESSMENT(HttpStatus.CONFLICT, "Renseignez d’abord une autoévaluation pour cette révision de production."),
    ASSET_QUOTA_EXCEEDED(HttpStatus.CONFLICT, "La limite de fichiers de ce projet est atteinte."),
    UPLOAD_OBJECT_MISSING(HttpStatus.CONFLICT, "Le transfert du fichier n’est pas encore confirmé."),
    ASSET_NOT_READY(HttpStatus.CONFLICT, "Ce fichier n’est pas disponible pour cette action."),
    OFFER_CHANGED(HttpStatus.CONFLICT, "L’offre a changé. Vérifiez le nouveau récapitulatif avant de confirmer."),
    OFFER_NOT_READY(HttpStatus.CONFLICT, "Cette offre n’est pas disponible pour préparer une commande."),
    ALREADY_ACCESSIBLE(HttpStatus.CONFLICT, "Les ressources de cette offre sont déjà accessibles. Reprenez votre formation."),
    TERMS_CHANGED(HttpStatus.CONFLICT, "Les conditions présentées ont changé. Vérifiez-les avant de confirmer."),
    ACTIVE_ORDER_EXISTS(HttpStatus.CONFLICT, "Une commande est déjà engagée. Vérifiez son état avant toute nouvelle tentative."),
    IDEMPOTENCY_KEY_REQUIRED(HttpStatus.PRECONDITION_REQUIRED, "Fournissez une clé Idempotency-Key avant de préparer la commande."),
    PAYMENT_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "Le paiement n’est pas configuré pour cette offre."),
    CONFLICT(HttpStatus.CONFLICT, "Cette opération entre en conflit avec l’état actuel."),
    REVISION_CONFLICT(HttpStatus.PRECONDITION_FAILED, "La ressource a changé. Rechargez sa révision avant de réessayer."),
    PRECONDITION_REQUIRED(HttpStatus.PRECONDITION_REQUIRED, "Fournissez dans If-Match un ETag de révision explicite obtenu à la lecture."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "La ressource demandée est introuvable."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Cette méthode n’est pas disponible pour cette ressource."),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "Le format de réponse demandé n’est pas disponible."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Le format de la requête n’est pas pris en charge."),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Le service est temporairement indisponible."),
    ORDER_NOT_PAYABLE(HttpStatus.CONFLICT, "Cette commande ne permet pas une nouvelle session de paiement."),
    PAYMENT_AMOUNT_NOT_SUPPORTED(HttpStatus.CONFLICT, "Ce montant n’est pas disponible pour ce mode de paiement."),
    STRIPE_WEBHOOK_INVALID(HttpStatus.BAD_REQUEST, "La notification de paiement n’est pas valide."),
    REFUND_NOT_AVAILABLE(HttpStatus.CONFLICT,"Cette commande ne permet pas cette action de remboursement dans son état actuel."),
    REFUND_AMOUNT_UNAVAILABLE(HttpStatus.CONFLICT,"Ce montant n’est plus disponible. Vérifiez les remboursements et réservations en cours."),
    REFUND_PREVIEW_CHANGED(HttpStatus.CONFLICT,"L’aperçu a changé. Vérifiez à nouveau le montant, les lignes et les effets avant de décider."),
    REFUND_REQUEST_EXISTS(HttpStatus.CONFLICT,"Une demande est déjà ouverte pour cette commande."),
    REFUND_OPERATION_NOT_EXECUTABLE(HttpStatus.CONFLICT,"Cette opération ne permet pas une nouvelle exécution financière."),
    INVALID_REFUND_ALLOCATION(HttpStatus.BAD_REQUEST,"Les allocations et les effets sur les lignes sont invalides."),
    REQUEST_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "La requête dépasse la taille autorisée."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "La requête n’a pas pu être traitée.");

    private final HttpStatus status;
    private final String detail;

    ApiError(HttpStatus status, String detail) { this.status = status; this.detail = detail; }
    public HttpStatus status() { return status; }
    public String detail() { return detail; }
}
