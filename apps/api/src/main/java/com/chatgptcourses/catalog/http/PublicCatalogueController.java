package com.chatgptcourses.catalog.http;

import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
class PublicCatalogueController {
    private final PublicCatalogueService service;
    PublicCatalogueController(PublicCatalogueService service) { this.service = service; }

    @GetMapping
    ResponseEntity<CatalogDtos.Page> search(@RequestParam @Pattern(regexp = "fr|en") String locale,
            @RequestParam(required = false) @Size(max = 240) String q,
            @RequestParam(required = false) ResourceKind type,
            @RequestParam(required = false) @Pattern(regexp = "understand-brief|define-scope|prepare-prompt|build-proposal|check-output|reuse-method") String goal,
            @RequestParam(required = false) @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String level,
            @RequestParam(required = false) @Pattern(regexp = "FREE|PROTECTED") String access,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize,
            @RequestParam(defaultValue = "TITLE") @Pattern(regexp = "TITLE|RECENT") String sort) {
        return response(CatalogDtos.Page.from(service.search(new CatalogTypes.CatalogueQuery(q, type, goal, level, locale, access, page, pageSize, sort))));
    }
    @GetMapping("/facets")
    ResponseEntity<CatalogDtos.Facets> facets(@RequestParam @Pattern(regexp = "fr|en") String locale) {
        return response(CatalogDtos.Facets.from(service.facets(locale)));
    }
    @GetMapping("/resources/{resourceId}")
    ResponseEntity<CatalogDtos.Detail> detail(@PathVariable UUID resourceId, @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return response(CatalogDtos.Detail.from(service.detail(resourceId, locale)));
    }
    @GetMapping("/by-slug/{kind}/{slug}")
    ResponseEntity<CatalogDtos.Detail> slug(@PathVariable ResourceKind kind,
            @PathVariable @Size(max = 180) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return response(CatalogDtos.Detail.from(service.bySlug(kind, slug, locale)));
    }
    @GetMapping("/resources/{resourceId}/versions/{versionId}")
    ResponseEntity<CatalogDtos.Detail> version(@PathVariable UUID resourceId, @PathVariable UUID versionId,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        return response(CatalogDtos.Detail.from(service.version(resourceId, versionId, locale)));
    }
    private static <T> ResponseEntity<T> response(T value) {
        // P06 deliberately stays uncached until publication invalidation is established.
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(value);
    }
}
