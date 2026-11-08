package com.chatgptcourses.payments.refunds;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Financial processing, operator decisions and effective origins are separate facts. */
public final class RefundTypes {
    private RefundTypes(){ }
    public record CreateRefundRequest(String reason){@Override public String toString(){return "CreateRefundRequest[redacted]";}}
    public record RefundAction(String reason){@Override public String toString(){return "RefundAction[redacted]";}}
    public record RefundAllocation(UUID orderResourceId,long amountMinor,String accessAction){ }
    public record PreviewRefund(long amountMinor,List<RefundAllocation> allocations){ }
    public record DecideRefund(String outcome,String reason,String previewFingerprint,Long amountMinor,List<RefundAllocation> allocations){@Override public String toString(){return "DecideRefund[redacted]";}}
    public record ResolveExternalRefund(String reason,List<RefundAllocation> allocations){@Override public String toString(){return "ResolveExternalRefund[redacted]";}}
    public record RefundLine(UUID orderResourceId,UUID resourceId,UUID versionId,int versionNumber,String title,List<String> locales,boolean originRevoked){ }
    public record RefundContext(UUID orderId,long orderRevision,String paymentStatus,String fulfillmentStatus,String currency,long paidAmountMinor,long confirmedRefundedMinor,long reservedMinor,long availableMinor,String reconciliationState,boolean canRequest,String requestUnavailableReason,List<RefundLine> lines){ }
    public record RefundDecisionView(UUID id,String outcome,String reason,Long amountMinor,List<RefundAllocation> allocations,UUID operationId,Instant decidedAt){@Override public String toString(){return "RefundDecisionView[redacted]";}}
    public record RefundRequestView(UUID id,long revision,UUID orderId,String state,String reason,RefundDecisionView decision,Instant createdAt,Instant updatedAt){@Override public String toString(){return "RefundRequestView[redacted]";}}
    public record RefundRequestPage(List<RefundRequestView> items,int page,int pageSize,long total){ }
    public record RefundRequestCreation(RefundRequestView value,boolean created){ }
    public record RefundPreview(UUID requestId,long requestRevision,UUID orderId,long orderRevision,String currency,long amountMinor,long availableMinor,boolean fullRefund,List<RefundAllocation> allocations,List<RefundLine> lines,String fingerprint){ }
    public record RefundDecisionResult(RefundRequestView request,RefundOperationView operation){ }
    public record RefundOperationView(UUID id,long revision,UUID orderId,UUID requestId,String origin,String state,long amountMinor,String currency,List<RefundAllocation> allocations,String accessState,String lastErrorCode,Instant createdAt,Instant updatedAt,Instant confirmedAt,String notificationStatus,boolean canExecute,boolean canCancel,boolean canReconcile,boolean canDecideAccess){ }
    public record RefundOperationPage(List<RefundOperationView> items,int page,int pageSize,long total){ }
    public record EntitlementSummary(UUID id,String originType,UUID orderId,UUID orderResourceId,UUID resourceId,UUID versionId,int versionNumber,String title,List<String> locales,String versionPolicy,String state,String revokedReason,Instant startsAt,Instant expiresAt,Instant revokedAt){ }
    public record EntitlementPage(List<EntitlementSummary> items,int page,int pageSize,long total){ }
    public record RefundParameters(UUID operationId,UUID orderId,String paymentIntentId,long amountMinor,String currency){@Override public String toString(){return "RefundParameters[redacted]";}}
    public record RefundFacts(String refundId,String paymentIntentId,String chargeId,UUID operationId,UUID orderId,long amountMinor,String currency,String status,boolean livemode,String accountId,Instant createdAt,String failureCode){@Override public String toString(){return "RefundFacts[redacted]";}}
    public record RefundPaymentFacts(String paymentIntentId,String chargeId,long amountReceived,String currency,boolean livemode,String accountId,List<RefundFacts> refunds,boolean complete){public RefundPaymentFacts{refunds=List.copyOf(refunds);}@Override public String toString(){return "RefundPaymentFacts[redacted]";}}
}
