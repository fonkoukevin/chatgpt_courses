package com.chatgptcourses.catalog.http;

import com.chatgptcourses.catalog.service.PublicRouteService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalog")
class PublicRouteController {
    private final PublicRouteService service;
    PublicRouteController(PublicRouteService service){this.service=service;}
    @GetMapping("/publications")
    ResponseEntity<PublicRouteDtos.PublicPublicationPage> publications(@RequestParam @Pattern(regexp="fr|en") String locale,
        @RequestParam(defaultValue="0") @Min(0) @Max(1000000) int page,@RequestParam(defaultValue="100") @Min(1) @Max(100) int pageSize){
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"no-store").body(PublicRouteDtos.PublicPublicationPage.from(service.publications(locale,page,pageSize)));
    }
    @GetMapping("/resources/{courseId}/versions/{courseVersionId}/activities/{activityId}/versions/{activityVersionId}")
    ResponseEntity<PublicRouteDtos.PublicActivityContext> activity(@PathVariable UUID courseId,@PathVariable UUID courseVersionId,
        @PathVariable UUID activityId,@PathVariable UUID activityVersionId,@RequestParam @Pattern(regexp="fr|en") String locale){
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"no-store").header("X-Robots-Tag","noindex, nofollow")
            .body(PublicRouteDtos.PublicActivityContext.from(service.activityContext(courseId,courseVersionId,activityId,activityVersionId,locale)));
    }
}
