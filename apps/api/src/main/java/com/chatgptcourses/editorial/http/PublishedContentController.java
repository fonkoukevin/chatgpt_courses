package com.chatgptcourses.editorial.http;

import com.chatgptcourses.editorial.service.EditorialService;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Minimal published projection for P05; this does not implement the public catalogue P06. */
@RestController
class PublishedContentController {
    private final EditorialService service;
    PublishedContentController(EditorialService service) { this.service = service; }

    @GetMapping("/api/v1/contents/{resourceId}")
    ResponseEntity<EditorialDtos.PublicContent> get(@PathVariable UUID resourceId,
                                                   @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(EditorialDtos.PublicContent.from(service.publicContent(resourceId, locale)));
    }
}
