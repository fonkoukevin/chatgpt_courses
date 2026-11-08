package com.chatgptcourses.shared.http;

/** Validation metadata only; deliberately has no rejectedValue or dynamic constraint message. */
public record ApiFieldError(String field, String code, String message) {
    static ApiFieldError from(String field, String constraint) {
        String safeField = field != null && field.length() <= 128
                && field.matches("[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*|\\[\\d+\\])*")
                ? field : "_request";
        return switch (constraint == null ? "" : constraint) {
            case "NotNull", "NotBlank", "NotEmpty" -> new ApiFieldError(safeField, "REQUIRED", "Ce champ est requis.");
            case "Email", "Pattern" -> new ApiFieldError(safeField, "INVALID_FORMAT", "Le format de ce champ est invalide.");
            case "Size", "Length" -> new ApiFieldError(safeField, "INVALID_LENGTH", "La longueur de ce champ est invalide.");
            case "Min", "Max", "DecimalMin", "DecimalMax", "Positive", "PositiveOrZero", "Negative", "NegativeOrZero", "Digits"
                    -> new ApiFieldError(safeField, "INVALID_NUMBER", "La valeur numérique de ce champ est invalide.");
            default -> new ApiFieldError(safeField, "INVALID_VALUE", "Ce champ est invalide.");
        };
    }
}
