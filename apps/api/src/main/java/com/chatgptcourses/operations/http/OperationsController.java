package com.chatgptcourses.operations.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.operations.service.OperationsTypes.*;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.operations.service.OperationsService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
class OperationsController {
    private final OperationsService operations;
    OperationsController(OperationsService operations){this.operations=operations;}
    @GetMapping("/operations/dashboard")
    ResponseEntity<OperationsDashboard> dashboard(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to){return response(operations.dashboard(actor(principal),from,to));}
    @GetMapping("/orders")
    ResponseEntity<AdminOrderPage> orders(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String paymentStatus,@RequestParam(required=false) String fulfillmentStatus,
        @RequestParam(required=false) UUID offerId,@RequestParam(required=false) String currency,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(operations.orders(actor(principal),new AdminOrderQuery(from,to,paymentStatus,fulfillmentStatus,offerId,currency,page,pageSize)));}
    @GetMapping("/orders/{orderId}")
    ResponseEntity<AdminOrderDetail> order(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID orderId){return response(operations.order(actor(principal),orderId));}
    @PostMapping("/orders/{orderId}/reconciliation-requests")
    ResponseEntity<OperationReceipt> reconcile(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID orderId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody OperationsDtos.Reconciliation command){return receipt(operations.reconcileOrder(actor(principal),context(account),orderId,key,new RequestOrderReconciliation(command.reason(),command.expectedOrderRevision())));}
    @GetMapping("/incidents")
    ResponseEntity<IncidentPage> incidents(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String kind,@RequestParam(required=false) String state,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(operations.incidents(actor(principal),from,to,kind,state,page,pageSize));}
    @PostMapping("/incidents/{kind}/{id}/retry")
    ResponseEntity<OperationReceipt> retry(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable String kind,@PathVariable UUID id,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody OperationsDtos.IncidentRetry command){return receipt(operations.retryIncident(actor(principal),context(account),kind,id,key,new RetryIncident(command.reason(),command.ackDuplicate())));}
    @GetMapping("/audit")
    ResponseEntity<AuditPage> audit(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String source,@RequestParam(required=false) String action,
        @RequestParam(required=false) UUID actorId,@RequestParam(required=false) UUID objectId,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(operations.audit(actor(principal),from,to,source,action,actorId,objectId,page,pageSize));}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(value);}
    private static ResponseEntity<OperationReceipt> receipt(OperationReceipt value){return ResponseEntity.status(value.replayed()?200:202).header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(value);}
}
