package com.chatgptcourses.payments.service;

/** Deliberately discards SDK exception bodies, URLs, request headers and original causes. */
public final class PaymentGatewayException extends RuntimeException {
    private final String reason;
    private final boolean ambiguous;
    public PaymentGatewayException(String reason,boolean ambiguous){super("Payment provider operation unavailable");this.reason=reason;this.ambiguous=ambiguous;}
    public String reason(){return reason;}
    public boolean ambiguous(){return ambiguous;}
}
