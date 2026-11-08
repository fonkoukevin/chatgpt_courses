package com.chatgptcourses.notifications;

import java.time.Duration;
import java.util.Base64;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** No production encryption-key fallback; the same persisted key must survive restarts. */
@ConfigurationProperties("courses.notifications.outbox")
public record OutboxSettings(String encryptionKey, boolean workerEnabled, Duration pollDelay, Duration leaseDuration,
        int maxAttempts, Duration retryBase, Duration retryMax, Duration payloadRetention) {
    public OutboxSettings {
        byte[] decoded;
        try { decoded = encryptionKey == null ? new byte[0] : Base64.getDecoder().decode(encryptionKey); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("NOTIFICATION_OUTBOX_KEY must be Base64 encoding exactly 32 bytes"); }
        if (decoded.length != 32) throw new IllegalArgumentException("NOTIFICATION_OUTBOX_KEY must be Base64 encoding exactly 32 bytes");
        if (!between(pollDelay, Duration.ofMillis(100), Duration.ofMinutes(1))
                || !between(leaseDuration, Duration.ofSeconds(15), Duration.ofMinutes(10))
                || maxAttempts < 1 || maxAttempts > 20
                || !between(retryBase, Duration.ofSeconds(1), Duration.ofMinutes(5))
                || !between(retryMax, retryBase, Duration.ofHours(1))
                || !between(payloadRetention, Duration.ofMinutes(1), Duration.ofDays(7))) {
            throw new IllegalArgumentException("Invalid notification outbox timing or attempt configuration");
        }
    }
    private static boolean between(Duration value, Duration min, Duration max) { return value != null && value.compareTo(min) >= 0 && value.compareTo(max) <= 0; }
    @Override public String toString() { return "OutboxSettings[redacted]"; }
}
