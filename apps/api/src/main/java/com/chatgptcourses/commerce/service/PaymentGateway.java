package com.chatgptcourses.commerce.service;

import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.UUID;
import java.util.Optional;
import static com.chatgptcourses.payments.service.PaymentTypes.*;
import static com.chatgptcourses.payments.refunds.RefundTypes.*;

/** P12 supplies a verified payment adapter. No browser-controlled transition to paid exists. */
public interface PaymentGateway {
    boolean configured();
    String unavailableReason();
    default void prepare(UUID orderId){throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
    default boolean supportsAmount(long amount,String currency){long minimum=switch(currency==null?"":currency){case "EUR","USD"->50;case "GBP"->30;default->Long.MAX_VALUE;};return amount>=minimum&&amount<=99_999_999L;}
    default CreatedCheckout createCheckout(CheckoutParameters parameters,String providerIdempotencyKey){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
    default CheckoutFacts retrieveCheckoutFacts(String sessionId){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
    default Optional<CheckoutFacts> findCheckoutFacts(CheckoutParameters parameters){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
    default RefundFacts createRefund(RefundParameters parameters,String providerIdempotencyKey){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
    default RefundPaymentFacts retrieveRefunds(String paymentIntentId){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
    default RefundPaymentFacts retrieveRefundPayment(String objectId,String eventType){throw new com.chatgptcourses.payments.service.PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);}
}
