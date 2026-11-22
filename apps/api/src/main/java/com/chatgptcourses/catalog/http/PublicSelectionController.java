package com.chatgptcourses.catalog.http;

import com.chatgptcourses.catalog.service.PublicSelectionService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
class PublicSelectionController {
    record Change(@NotNull UUID revisionId,@NotBlank @Pattern(regexp="EDITORIAL|RECIPE") String provenance,
            @NotNull Boolean approved,@NotBlank @Size(max=1000) String reason){
        PublicSelectionService.ChangeSelection command(){return new PublicSelectionService.ChangeSelection(revisionId,provenance,approved,reason);}
    }
    private final PublicSelectionService service;
    PublicSelectionController(PublicSelectionService service){this.service=service;}
    @GetMapping("/contents/{id}/public-selection")
    ResponseEntity<PublicSelectionService.Selection> content(@AuthenticationPrincipal IdentityUserDetails user,@PathVariable UUID id){return response("content-selection",service.content(actor(user),id));}
    @PutMapping("/contents/{id}/public-selection")
    ResponseEntity<PublicSelectionService.Selection> selectContent(@AuthenticationPrincipal IdentityUserDetails user,@PathVariable UUID id,
            @RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String context,
            @RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody Change body){return response("content-selection",service.selectContent(actor(user),context==null?null:UUID.fromString(context),id,ifMatch,body.command()));}
    @GetMapping("/offers/{id}/public-selection")
    ResponseEntity<PublicSelectionService.Selection> offer(@AuthenticationPrincipal IdentityUserDetails user,@PathVariable UUID id){return response("offer-selection",service.offer(actor(user),id));}
    @PutMapping("/offers/{id}/public-selection")
    ResponseEntity<PublicSelectionService.Selection> selectOffer(@AuthenticationPrincipal IdentityUserDetails user,@PathVariable UUID id,
            @RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String context,
            @RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody Change body){return response("offer-selection",service.selectOffer(actor(user),context==null?null:UUID.fromString(context),id,ifMatch,body.command()));}
    private static UUID actor(IdentityUserDetails user){if(user==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return user.getUserId();}
    private static ResponseEntity<PublicSelectionService.Selection> response(String kind,PublicSelectionService.Selection value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").eTag(PublicSelectionService.tag(kind,value)).body(value);}
}
