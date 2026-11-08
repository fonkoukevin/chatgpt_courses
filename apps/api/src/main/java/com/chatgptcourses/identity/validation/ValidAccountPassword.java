package com.chatgptcourses.identity.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Constraint(validatedBy = AccountPasswordValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.ANNOTATION_TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidAccountPassword {
    String message() default "Le mot de passe doit contenir de 12 à 128 caractères Unicode et au plus 1024 octets UTF-8.";
    Class<?>[] groups() default { };
    Class<? extends Payload>[] payload() default { };
}
