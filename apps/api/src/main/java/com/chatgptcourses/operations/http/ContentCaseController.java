package com.chatgptcourses.operations.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.operations.service.ContentCaseTypes.*;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.operations.service.ContentCaseService;
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
@RequestMapping("/api/v1/admin/content-cases")
class ContentCaseController {
    private final ContentCaseService cases;
    ContentCaseController(ContentCaseService cases){this.cases=cases;}
    @GetMapping
    ResponseEntity<ContentCasePage> list(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String state,@RequestParam(required=false) UUID resourceId,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(cases.list(actor(principal),from,to,state,resourceId,page,pageSize));}
    @GetMapping("/{caseId}") ResponseEntity<ContentCaseView> get(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID caseId){return content(cases.get(actor(principal),caseId),200);}
    @PostMapping
    ResponseEntity<ContentCaseView> create(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody ContentCaseDtos.Create command){var value=cases.create(actor(principal),context(account),key,new CreateContentCase(command.ticketId(),command.resourceId(),command.versionId(),command.sourceRevisionId(),command.locale(),command.reason()));return content(value.value(),value.created()?201:200);}
    @PatchMapping("/{caseId}")
    ResponseEntity<ContentCaseView> update(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID caseId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="If-Match",required=false) String tag,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody ContentCaseDtos.Update command){return content(cases.update(actor(principal),context(account),caseId,tag,key,new UpdateContentCase(command.state(),command.assigneeId(),command.correctedRevisionId(),command.reason())),200);}
    @GetMapping("/{caseId}/events") ResponseEntity<ContentCaseEventPage> events(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID caseId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(cases.events(actor(principal),caseId,page,pageSize));}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(value);}
    private static ResponseEntity<ContentCaseView> content(ContentCaseView value,int status){return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").eTag(ContentCaseService.tag(value)).body(value);}
}
