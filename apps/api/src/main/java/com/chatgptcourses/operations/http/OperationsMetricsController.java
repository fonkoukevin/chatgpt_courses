package com.chatgptcourses.operations.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.operations.service.MetricsTypes.OperationsMetrics;
import com.chatgptcourses.operations.service.OperationsMetricsService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/metrics")
class OperationsMetricsController {
    private final OperationsMetricsService metrics;
    OperationsMetricsController(OperationsMetricsService metrics){this.metrics=metrics;}
    @GetMapping
    ResponseEntity<OperationsMetrics> metrics(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String currency){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow").body(metrics.metrics(actor(principal),from,to,currency));}
    @GetMapping("/export")
    ResponseEntity<byte[]> export(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required=false) String currency){var value=metrics.export(actor(principal),from,to,currency);return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8")).contentLength(value.bytes().length)
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(value.filename()).build().toString())
            .header(HttpHeaders.CACHE_CONTROL,"private, no-store").header("X-Robots-Tag","noindex, nofollow")
            .header("X-Content-SHA256",value.sha256()).header("X-Content-Type-Options","nosniff")
            .header("Referrer-Policy","no-referrer").body(value.bytes());}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
}
