package com.chatgptcourses.identity.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("courses.identity")
public record IdentitySettings(Duration resetTokenTtl, Duration resetWindow,
                               @Min(1) @Max(20) int resetRequestLimit) {
    @AssertTrue(message = "Password recovery durations must be positive and bounded")
    public boolean isValidDurations() {
        return resetTokenTtl != null && resetWindow != null && resetTokenTtl.compareTo(Duration.ofMinutes(1)) >= 0
                && resetTokenTtl.compareTo(Duration.ofHours(1)) <= 0 && resetWindow.compareTo(Duration.ofMinutes(1)) >= 0
                && resetWindow.compareTo(Duration.ofHours(24)) <= 0;
    }
}
