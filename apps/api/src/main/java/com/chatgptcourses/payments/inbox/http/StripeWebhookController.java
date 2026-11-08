package com.chatgptcourses.payments.inbox.http;

import com.chatgptcourses.payments.inbox.PaymentInboxTypes.WebhookReceipt;
import com.chatgptcourses.payments.inbox.StripeWebhookService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
class StripeWebhookController {
    private final StripeWebhookService service;
    StripeWebhookController(StripeWebhookService service){this.service=service;}
    @PostMapping(value="/api/v1/webhooks/stripe",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<WebhookReceipt> receive(HttpServletRequest request,@RequestHeader(value="Stripe-Signature",required=false)String signature)throws IOException{
        if(request.getContentLengthLong()>65536)throw new ApiException(ApiError.REQUEST_TOO_LARGE);
        byte[] bytes=request.getInputStream().readNBytes(65537);if(bytes.length>65536)throw new ApiException(ApiError.REQUEST_TOO_LARGE);
        var receipt=service.receive(bytes,signature);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(receipt);
    }
}
