package com.chatgptcourses.payments.http;

import com.chatgptcourses.payments.service.PaymentTypes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class CheckoutDtos {
    private CheckoutDtos(){ }
    public record CreateCheckout(@NotBlank @Size(max=100) String acceptedTermsVersion){public PaymentTypes.CreateCheckout command(){return new PaymentTypes.CreateCheckout(acceptedTermsVersion);}}
    public record CheckoutAccess(UUID orderId,UUID operationId,String state,String url,Instant expiresAt,Integer retryAfterSeconds,String unavailableReason){
        public static CheckoutAccess from(PaymentTypes.CheckoutAccess p){return new CheckoutAccess(p.orderId(),p.operationId(),p.state(),p.url(),p.expiresAt(),p.retryAfterSeconds(),p.unavailableReason());}
        @Override public String toString(){return "CheckoutAccess[redacted]";}
    }
    public record OrderPaymentStatus(UUID orderId,long orderRevision,String orderStatus,String paymentStatus,String fulfillmentStatus,String checkoutState,boolean checkoutAvailable,String checkoutUnavailableReason,Instant sessionExpiresAt,boolean canRetry,String notificationStatus){
        public static OrderPaymentStatus from(PaymentTypes.OrderPaymentStatus p){return new OrderPaymentStatus(p.orderId(),p.orderRevision(),p.orderStatus(),p.paymentStatus(),p.fulfillmentStatus(),p.checkoutState(),p.checkoutAvailable(),p.checkoutUnavailableReason(),p.sessionExpiresAt(),p.canRetry(),p.notificationStatus());}
    }
}
