package com.chatgptcourses.methods.http;

import com.chatgptcourses.methods.service.MethodService;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class MethodTemplatesController {
    private final MethodService service;
    MethodTemplatesController(MethodService service) { this.service = service; }

    @GetMapping("/api/v1/method-templates/{resourceId}/versions/{versionId}")
    ResponseEntity<MethodDtos.Template> template(@PathVariable UUID resourceId, @PathVariable UUID versionId,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(MethodDtos.Template.from(service.template(resourceId, versionId, locale)));
    }
}
