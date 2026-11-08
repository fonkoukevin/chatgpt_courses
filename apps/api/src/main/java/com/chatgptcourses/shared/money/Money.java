package com.chatgptcourses.shared.money;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;

/** Exact transport value; never an authoritative browser price for an order. */
public record Money(
        @PositiveOrZero @Max(9_007_199_254_740_991L) long amountMinor,
        @NotNull @Pattern(regexp = "[A-Z]{3}") String currency) {
}
