package com.chatgptcourses.identity.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.nio.charset.StandardCharsets;

public final class AccountPasswordValidator implements ConstraintValidator<ValidAccountPassword, String> {
    @Override public boolean isValid(String value, ConstraintValidatorContext context) { return isAcceptable(value); }
    public static boolean isAcceptable(String value) {
        if (value == null || value.length() > 256) return false;
        int count = value.codePointCount(0, value.length());
        if (count < 12 || count > 128 || value.getBytes(StandardCharsets.UTF_8).length > 1024) return false;
        // Unpaired UTF-16 surrogates are not Unicode characters; no composition rules are imposed.
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (Character.isHighSurrogate(character)) {
                if (++index >= value.length() || !Character.isLowSurrogate(value.charAt(index))) return false;
            } else if (Character.isLowSurrogate(character)) return false;
        }
        return true;
    }
}
