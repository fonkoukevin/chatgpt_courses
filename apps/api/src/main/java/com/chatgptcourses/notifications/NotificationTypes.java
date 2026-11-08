package com.chatgptcourses.notifications;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class NotificationTypes {
    private NotificationTypes() { }
    public enum Type { ACCOUNT_CREATED, PASSWORD_RESET, ACCESS_ACTIVATED, SUPPORT_REPLY, REFUND_UPDATED }
    public enum Status { PENDING, PROCESSING, RETRY, SENT, DEAD, INDETERMINATE }
    public record Payload(String recipient, String locale, String token, Instant tokenExpiresAt, String resourceTitle, UUID ticketId) {
        @Override public String toString() { return "NotificationPayload[redacted]"; }
    }
    public record NotificationSummary(UUID id, String type, String status, int attempts, int cycleAttempts, int requeueCount,
            Instant nextAttemptAt, Instant leaseUntil, String lastErrorCode, Instant createdAt, Instant updatedAt,
            Instant expiresAt, Instant sentAt, Instant purgedAt, boolean payloadAvailable) { }
    public record NotificationPage(List<NotificationSummary> items, int page, int pageSize, long total) { }
    record Claim(UUID id, Type type, UUID leaseId, byte[] ciphertext, String businessKey, Instant expiresAt) {
        @Override public String toString() { return "NotificationClaim[redacted]"; }
    }
}
