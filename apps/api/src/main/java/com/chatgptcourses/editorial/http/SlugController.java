package com.chatgptcourses.editorial.http;

import com.chatgptcourses.account.service.AccountOperations;
import com.chatgptcourses.editorial.service.ContentTypes.RenameContentSlug;
import com.chatgptcourses.editorial.service.EditorialService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/contents")
class SlugController {
    private final EditorialService service;
    SlugController(EditorialService service){this.service=service;}
    record Rename(@NotBlank @Size(max=180) @Pattern(regexp="[a-z0-9]+(-[a-z0-9]+)*") String slug,@NotBlank @Size(max=1000) String reason){
        @Override public String toString(){return "RenameContentSlug[redacted]";}
    }
    @PatchMapping("/{id}/slug")
    ResponseEntity<EditorialDtos.Content> rename(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,
        @RequestHeader(value="If-Match",required=false) String ifMatch,@RequestHeader(value="X-Account-Context",required=false) String account,
        @Valid @RequestBody Rename request){
        if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        var value=service.renameSlug(principal.getUserId(),AccountOperations.context(account),id,ifMatch,new RenameContentSlug(request.slug(),request.reason()));
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow")
            .eTag(EntityTags.forRevision("content",value.id(),value.revision())).body(EditorialDtos.Content.from(value));
    }
}
