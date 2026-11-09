package com.chatgptcourses.support.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.support.service.SupportTypes.*;
import com.chatgptcourses.support.service.SupportService;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.service.AssetTypes.DownloadAccess;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
class SupportController {
    private final SupportService support;private final AssetService assets;
    SupportController(SupportService support,AssetService assets){this.support=support;this.assets=assets;}
    @GetMapping("/{scope:me|admin}/support-tickets") ResponseEntity<SupportTicketPage> list(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@RequestParam(required=false)String state,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(support.list(actor(p),admin(scope),state,page,pageSize));}
    @PostMapping("/me/support-tickets") ResponseEntity<SupportTicketView> create(@AuthenticationPrincipal IdentityUserDetails p,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody SupportDtos.Create c){var result=support.create(actor(p),context(ctx),key,new CreateSupportTicket(c.category(),c.subject(),c.message(),c.locale(),c.context()==null?null:c.context().domain(),c.attachmentIds()));return ResponseEntity.status(result.created()?201:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(SupportService.tag(result.value())).body(result.value());}
    @GetMapping("/{scope:me|admin}/support-tickets/{id}") ResponseEntity<SupportTicketView> get(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@PathVariable UUID id){return ticket(support.get(actor(p),id,admin(scope)));}
    @GetMapping("/{scope:me|admin}/support-tickets/{id}/messages") ResponseEntity<SupportMessagePage> messages(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@PathVariable UUID id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(support.messages(actor(p),id,admin(scope),page,pageSize));}
    @GetMapping("/{scope:me|admin}/support-tickets/{id}/events") ResponseEntity<SupportEventPage> events(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@PathVariable UUID id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(support.events(actor(p),id,admin(scope),page,pageSize));}
    @PostMapping("/{scope:me|admin}/support-tickets/{id}/messages") ResponseEntity<SupportConversationUpdate> add(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="If-Match",required=false)String match,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody SupportDtos.Message c){var result=support.addMessage(actor(p),context(ctx),id,admin(scope),match,key,new AddSupportMessage(c.message(),c.attachmentIds()));return ResponseEntity.status(result.created()?201:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(result.value());}
    @PostMapping("/admin/support-tickets/{id}/state-changes") ResponseEntity<SupportTicketView> state(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="If-Match",required=false)String match,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody SupportDtos.State c){return ticket(support.changeState(actor(p),context(ctx),id,match,key,new ChangeSupportState(c.state(),c.reason())));}
    @PostMapping("/{scope:me|admin}/support-tickets/{id}/attachments/{assetId}/download-access") ResponseEntity<DownloadAccess> download(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable String scope,@PathVariable UUID id,@PathVariable UUID assetId,@RequestHeader(value="X-Account-Context",required=false)String ctx){return response(assets.supportDownload(actor(p),context(ctx),id,assetId,admin(scope)));}
    private static boolean admin(String scope){return "admin".equals(scope);}
    private static UUID actor(IdentityUserDetails p){if(p==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return p.getUserId();}
    private static <T>ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
    private static ResponseEntity<SupportTicketView> ticket(SupportTicketView value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(SupportService.tag(value)).body(value);}
}
