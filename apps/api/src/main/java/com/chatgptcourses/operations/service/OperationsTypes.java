package com.chatgptcourses.operations.service;

import com.chatgptcourses.commerce.service.CommerceTypes.OrderView;
import com.chatgptcourses.shared.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OperationsTypes {
    private OperationsTypes() { }
    public record OperationsPeriod(Instant from,Instant to) { }
    public record DashboardCounter(String code,String value,String availability,String unavailableReason) { }
    public record OperationsDashboard(OperationsPeriod period,Instant generatedAt,List<DashboardCounter> counters) { }
    public record AdminOrderQuery(Instant from,Instant to,String paymentStatus,String fulfillmentStatus,UUID offerId,String currency,int page,int pageSize) { }
    public record AdminOrderSummary(UUID id,UUID ownerId,long revision,UUID offerId,String title,Money total,String orderStatus,String paymentStatus,String fulfillmentStatus,Instant createdAt,Instant paidAt) { }
    public record AdminOrderPage(List<AdminOrderSummary> items,int page,int pageSize,long total) { }
    public record OrderOrigin(UUID id,UUID orderResourceId,UUID resourceId,UUID versionId,int versionNumber,List<String> locales,String state,Instant startsAt,Instant expiresAt,Instant revokedAt) { }
    public record PaymentReference(UUID operationId,String operationState,String sessionId,String paymentIntentId,String lastErrorCode) { }
    public record AdminOrderDetail(UUID ownerId,OrderView order,String orderRevisionTag,PaymentReference payment,List<OrderOrigin> origins,long confirmedRefundedMinor,long reservedRefundMinor,boolean refundReviewRequired,boolean canReconcile) { }
    public record RequestOrderReconciliation(String reason,long expectedOrderRevision) { }
    public record OperationReceipt(UUID actionId,String kind,UUID targetId,String state,Instant recordedAt,boolean replayed) { }
    public record IncidentSummary(UUID id,String kind,String state,String lastErrorCode,UUID orderId,UUID operationId,Instant createdAt,Instant updatedAt,Instant nextAttemptAt,boolean canRetry,String retryUnavailableReason) { }
    public record IncidentPage(List<IncidentSummary> items,int page,int pageSize,long total) { }
    public record RetryIncident(String reason,boolean ackDuplicate) { }
    public record AuditEvent(UUID id,String source,UUID actorId,String action,String objectType,UUID objectId,String reasonCode,String result,Instant occurredAt) { }
    public record AuditPage(List<AuditEvent> items,int page,int pageSize,long total) { }
}
