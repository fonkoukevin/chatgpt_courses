package com.chatgptcourses.account.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.account.service.AccountTypes.*;
import com.chatgptcourses.account.service.AccountService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
class AccountController {
    private final AccountService accounts;
    AccountController(AccountService accounts){this.accounts=accounts;}
    @GetMapping("/profile") ResponseEntity<ProfileView> profile(@AuthenticationPrincipal IdentityUserDetails p){return profileResponse(accounts.profile(actor(p)));}
    @PatchMapping("/profile") ResponseEntity<ProfileView> save(@AuthenticationPrincipal IdentityUserDetails p,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="If-Match",required=false)String match,@Valid @RequestBody AccountDtos.ProfilePatch command){return profileResponse(accounts.saveProfile(actor(p),context(ctx),match,new SaveProfile(command.displayName())));}
    @GetMapping("/orders/{id}/documents") ResponseEntity<CommercialDocuments> documents(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id){return response(accounts.commercialDocuments(actor(p),id));}
    @GetMapping("/data-requests") ResponseEntity<DataRequestPage> requests(@AuthenticationPrincipal IdentityUserDetails p,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(accounts.listDataRequests(actor(p),page,pageSize));}
    @PostMapping("/data-requests") ResponseEntity<DataRequestView> create(@AuthenticationPrincipal IdentityUserDetails p,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody AccountDtos.DataRequest command){var result=accounts.createDataRequest(actor(p),context(ctx),key,new CreateDataRequest(command.type(),command.reason()));return ResponseEntity.status(result.created()?201:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(AccountService.tag(result.value())).body(result.value());}
    @GetMapping("/data-requests/{id}") ResponseEntity<DataRequestView> request(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id){var value=accounts.dataRequest(actor(p),id);return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(AccountService.tag(value)).body(value);}
    @GetMapping("/data-requests/{id}/events") ResponseEntity<DataRequestEventPage> events(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(accounts.dataRequestEvents(actor(p),id,page,pageSize));}
    @PostMapping("/data-requests/{id}/cancellations") ResponseEntity<DataRequestView> cancel(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="If-Match",required=false)String match,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody AccountDtos.Cancellation command){var value=accounts.cancelDataRequest(actor(p),context(ctx),id,match,key,new CancelDataRequest(command.reason()));return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(AccountService.tag(value)).body(value);}
    private static UUID actor(IdentityUserDetails p){if(p==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return p.getUserId();}
    private static <T>ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
    private static ResponseEntity<ProfileView> profileResponse(ProfileView value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(EntityTags.forRevision("profile",value.id(),value.revision())).body(value);}
}
