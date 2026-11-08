package com.chatgptcourses.notifications.http;

import com.chatgptcourses.notifications.NotificationTypes;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Transport has operational metadata only, never recipient, business key, token or encrypted payload. */
public final class NotificationDtos {
    private NotificationDtos() { }
    public record Retry(@NotNull @Pattern(regexp="CONFIGURATION_FIXED|MANUAL_RECONCILIATION") String reason,
            @NotNull Boolean ackDuplicate) { }
    public record Summary(UUID id,String type,String status,int attempts,int cycleAttempts,int requeueCount,
            Instant nextAttemptAt,Instant leaseUntil,String lastErrorCode,Instant createdAt,Instant updatedAt,
            Instant expiresAt,Instant sentAt,Instant purgedAt,boolean payloadAvailable) {
        static Summary from(NotificationTypes.NotificationSummary value){return new Summary(value.id(),value.type(),value.status(),value.attempts(),value.cycleAttempts(),value.requeueCount(),value.nextAttemptAt(),value.leaseUntil(),value.lastErrorCode(),value.createdAt(),value.updatedAt(),value.expiresAt(),value.sentAt(),value.purgedAt(),value.payloadAvailable());}
    }
    public record Page(List<Summary> items,int page,int pageSize,long total) {
        static Page from(NotificationTypes.NotificationPage value){return new Page(value.items().stream().map(Summary::from).toList(),value.page(),value.pageSize(),value.total());}
    }
}
