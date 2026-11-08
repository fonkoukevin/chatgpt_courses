package com.chatgptcourses.payments.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Minimal server facts. No SDK model, customer/card data or signed payload is exposed. */
public final class PaymentTypes {
    private PaymentTypes(){ }
    public record CreateCheckout(String acceptedTermsVersion){ }
    public record CheckoutAccess(UUID orderId,UUID operationId,String state,String url,Instant expiresAt,Integer retryAfterSeconds,String unavailableReason){@Override public String toString(){return "CheckoutAccess[redacted]";}}
    public record OrderPaymentStatus(UUID orderId,long orderRevision,String orderStatus,String paymentStatus,String fulfillmentStatus,String checkoutState,boolean checkoutAvailable,String checkoutUnavailableReason,Instant sessionExpiresAt,boolean canRetry,String notificationStatus){ }
    public record CheckoutParameters(UUID operationId,UUID orderId,UUID offerRevisionId,String locale,String title,long amountMinor,String currency,String successUrl,String cancelUrl,Instant expiresAt){@Override public String toString(){return "CheckoutParameters[redacted]";}}
    public record CreatedCheckout(String sessionId,String url,Instant expiresAt,boolean livemode,String accountId){@Override public String toString(){return "CreatedCheckout[redacted]";}}
    public record CheckoutLine(String productReference,long amountMinor,String currency,long quantity){ }
    public record CheckoutFacts(String sessionId,UUID operationId,UUID orderId,String clientReferenceId,boolean livemode,String accountId,String apiVersion,String sessionMode,String sessionStatus,String paymentStatus,String paymentIntentId,String paymentIntentStatus,Long amountTotal,Long amountReceived,String currency,List<CheckoutLine> lines,long refundedAmount,Instant paidAt,Instant expiresAt,String url){public CheckoutFacts{lines=List.copyOf(lines);}@Override public String toString(){return "CheckoutFacts[redacted]";}}
}
