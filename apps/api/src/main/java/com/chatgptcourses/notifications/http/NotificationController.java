package com.chatgptcourses.notifications.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.notifications.NotificationOperations;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/notifications")
class NotificationController {
    private final NotificationOperations service;
    NotificationController(NotificationOperations service){this.service=service;}
    @GetMapping
    ResponseEntity<NotificationDtos.Page> list(@AuthenticationPrincipal IdentityUserDetails principal,
            @RequestParam(required=false) @Pattern(regexp="PENDING|PROCESSING|RETRY|SENT|DEAD|INDETERMINATE") String status,
            @RequestParam(defaultValue="0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(100) int pageSize){
        return privateResponse(NotificationDtos.Page.from(service.list(actor(principal),status,page,pageSize)));
    }
    @PostMapping("/{id}/retry")
    ResponseEntity<NotificationDtos.Summary> retry(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,
            @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,
            @Valid @RequestBody NotificationDtos.Retry request){
        return privateResponse(NotificationDtos.Summary.from(service.retry(actor(principal),accountContext==null?null:UUID.fromString(accountContext),id,request.reason(),request.ackDuplicate())));
    }
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static <T>ResponseEntity<T> privateResponse(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
}
