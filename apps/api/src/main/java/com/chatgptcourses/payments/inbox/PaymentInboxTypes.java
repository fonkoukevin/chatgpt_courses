package com.chatgptcourses.payments.inbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Minimized operational information. A reconciliation job is never presented as a Stripe event. */
public final class PaymentInboxTypes {
    private PaymentInboxTypes(){ }
    public record PaymentEventSummary(UUID id,String kind,String eventId,String type,String objectId,boolean livemode,
            String accountId,String apiVersion,String state,int attempts,Instant nextAttemptAt,String lastErrorCode,
            Instant createdAt,Instant updatedAt,Instant processedAt,UUID orderId,UUID operationId) { }
    public record PaymentEventPage(List<PaymentEventSummary> items,int page,int pageSize,long total) { }
    public record RetryPaymentEvent(String reason) { }
    public record WebhookReceipt(boolean received) { }
    record VerifiedEvent(String eventId,String type,String objectId,boolean livemode,String accountId,String apiVersion,Instant createdAt,byte[] hash) {
        @Override public String toString(){return "VerifiedPaymentEvent[redacted]";}
    }
    record Claim(UUID id,String kind,UUID leaseId,String sessionId,UUID operationId,UUID orderId) { }
}
