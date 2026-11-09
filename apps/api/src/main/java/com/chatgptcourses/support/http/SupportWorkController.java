package com.chatgptcourses.support.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.support.service.SupportWorkTypes.*;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.support.service.SupportWorkService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
class SupportWorkController {
    private final SupportWorkService work;
    SupportWorkController(SupportWorkService work){this.work=work;}
    @GetMapping("/support-assignees") ResponseEntity<SupportAssigneePage> assignees(@AuthenticationPrincipal IdentityUserDetails principal,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(work.assignees(actor(principal),page,pageSize));}
    @GetMapping("/support-tickets/{ticketId}/assignment") ResponseEntity<SupportAssignmentView> assignment(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId){return assignment(work.assignment(actor(principal),ticketId));}
    @PutMapping("/support-tickets/{ticketId}/assignment")
    ResponseEntity<SupportAssignmentView> assign(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="If-Match",required=false) String tag,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody SupportWorkDtos.Assignment command){return assignment(work.assign(actor(principal),context(account),ticketId,tag,key,new AssignSupport(command.assigneeId(),command.reason())));}
    @GetMapping("/support-tickets/{ticketId}/reply-draft") ResponseEntity<SupportDraftView> draft(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId){return draft(work.draft(actor(principal),ticketId));}
    @PutMapping("/support-tickets/{ticketId}/reply-draft")
    ResponseEntity<SupportDraftView> saveDraft(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="If-Match",required=false) String tag,
        @Valid @RequestBody SupportWorkDtos.Draft command){return draft(work.saveDraft(actor(principal),context(account),ticketId,tag,new SaveSupportDraft(command.text())));}
    @PostMapping("/support-tickets/{ticketId}/reply-draft/publications")
    ResponseEntity<PublishedSupportReply> publish(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="If-Match",required=false) String tag,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody SupportWorkDtos.Publication command){var value=work.publishDraft(actor(principal),context(account),ticketId,tag,key,new PublishSupportDraft(command.expectedTicketRevision(),command.reason()));return created(value.value(),value.created());}
    @GetMapping("/support-tickets/{ticketId}/internal-notes") ResponseEntity<InternalNotePage> notes(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(work.notes(actor(principal),ticketId,page,pageSize));}
    @PostMapping("/support-tickets/{ticketId}/internal-notes")
    ResponseEntity<InternalNote> addNote(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody SupportWorkDtos.Note command){var value=work.addNote(actor(principal),context(account),ticketId,key,new AddInternalNote(command.text()));return created(value.value(),value.created());}
    @GetMapping("/support-tickets/{ticketId}/time-entries") ResponseEntity<SupportTimePage> times(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int pageSize){return response(work.times(actor(principal),ticketId,page,pageSize));}
    @PostMapping("/support-tickets/{ticketId}/time-entries")
    ResponseEntity<SupportTimeEntry> recordTime(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID ticketId,
        @RequestHeader(value="X-Account-Context",required=false) String account,
        @RequestHeader(value="Idempotency-Key",required=false) String key,
        @Valid @RequestBody SupportWorkDtos.Time command){var value=work.recordTime(actor(principal),context(account),ticketId,key,new RecordSupportTime(command.minutes(),command.reason()));return created(value.value(),value.created());}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(value);}
    private static <T> ResponseEntity<T> created(T value,boolean created){return ResponseEntity.status(created?201:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(value);}
    private static ResponseEntity<SupportAssignmentView> assignment(SupportAssignmentView value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").eTag(SupportWorkService.assignmentTag(value)).body(value);}
    private static ResponseEntity<SupportDraftView> draft(SupportDraftView value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").eTag(SupportWorkService.draftTag(value)).body(value);}
}
