package com.chatgptcourses.shared.money;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

class MoneyValidationTest {
    @Test
    void transportAmountsStayExactForJavaAndJavascriptWithoutAssumingCurrencyDecimals() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new Money(0, "JPY"))).isEmpty();
            assertThat(validator.validate(new Money(9_007_199_254_740_991L, "KWD"))).isEmpty();
            assertThat(validator.validate(new Money(-1, "EUR"))).isNotEmpty();
            assertThat(validator.validate(new Money(9_007_199_254_740_992L, "EUR"))).isNotEmpty();
            assertThat(validator.validate(new Money(1, "eur"))).isNotEmpty();
            assertThat(validator.validate(new Money(1, null))).isNotEmpty();
        }
    }
}
