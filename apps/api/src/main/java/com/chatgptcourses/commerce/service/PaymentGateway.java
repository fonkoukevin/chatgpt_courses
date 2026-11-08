package com.chatgptcourses.commerce.service;

import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.UUID;

/** P12 supplies a verified payment adapter. No browser-controlled transition to paid exists. */
public interface PaymentGateway {
    boolean configured();
    String unavailableReason();
    default void prepare(UUID orderId){throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
}
