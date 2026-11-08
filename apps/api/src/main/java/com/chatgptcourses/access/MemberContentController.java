package com.chatgptcourses.access;

import com.chatgptcourses.catalog.http.CatalogDtos;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/resources")
class MemberContentController {
    private final MemberContentService content;
    MemberContentController(MemberContentService content){this.content=content;}
    @GetMapping("/{resourceId}/versions/{versionId}")
    ResponseEntity<CatalogDtos.Detail> read(@AuthenticationPrincipal IdentityUserDetails principal,
        @PathVariable UUID resourceId,@PathVariable UUID versionId,@RequestParam @Pattern(regexp="fr|en")String locale){
        if(principal==null)throw new com.chatgptcourses.shared.http.ApiException(com.chatgptcourses.shared.http.ApiError.AUTHENTICATION_REQUIRED);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store")
            .body(CatalogDtos.Detail.from(content.read(principal.getUserId(),resourceId,versionId,locale)));
    }
}
