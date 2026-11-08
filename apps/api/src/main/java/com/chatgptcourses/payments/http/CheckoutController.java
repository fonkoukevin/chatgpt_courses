package com.chatgptcourses.payments.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.payments.service.CheckoutService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/me/orders")
class CheckoutController {
    private final CheckoutService service;
    CheckoutController(CheckoutService service){this.service=service;}
    @PostMapping("/{id}/checkout")
    ResponseEntity<CheckoutDtos.CheckoutAccess> checkout(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String context,@RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody CheckoutDtos.CreateCheckout body){
        var result=service.checkout(actor(principal),context==null?null:UUID.fromString(context),id,ifMatch,key,body.command());
        boolean pending=Set.of("PREPARED","CALLING","UNKNOWN","NEEDS_REVIEW").contains(result.state());
        return ResponseEntity.status(pending?202:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(CheckoutDtos.CheckoutAccess.from(result));
    }
    @GetMapping("/{id}/payment-status")
    ResponseEntity<CheckoutDtos.OrderPaymentStatus> status(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(CheckoutDtos.OrderPaymentStatus.from(service.status(actor(principal),id)));}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
}
