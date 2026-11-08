package com.chatgptcourses.payments.inbox.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.payments.inbox.PaymentInboxOperations;
import com.chatgptcourses.payments.inbox.PaymentInboxTypes;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/payment-events")
class PaymentInboxController {
    private final PaymentInboxOperations service;
    PaymentInboxController(PaymentInboxOperations service){this.service=service;}
    @GetMapping
    ResponseEntity<PaymentInboxTypes.PaymentEventPage> list(@AuthenticationPrincipal IdentityUserDetails principal,@RequestParam(required=false)@Pattern(regexp="PENDING|PROCESSING|RETRY|WAITING|PROCESSED|IGNORED|DEAD")String state,@RequestParam(defaultValue="0")@Min(0)@Max(1000000)int page,@RequestParam(defaultValue="20")@Min(1)@Max(100)int pageSize){return response(service.list(actor(principal),state,page,pageSize));}
    @PostMapping("/{id}/retry")
    ResponseEntity<PaymentInboxTypes.PaymentEventSummary> retry(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String context,@Valid @RequestBody Retry body){return response(service.retry(actor(principal),context==null?null:UUID.fromString(context),id,body.reason()));}
    public record Retry(@NotNull @Pattern(regexp="PROVIDER_RECOVERED|MANUAL_RECONCILIATION")String reason){ }
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static <T>ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
}
