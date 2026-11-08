package com.chatgptcourses.projects.http;

import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/** Server-side CMS preparations only; loading a preset neither saves nor publishes content. */
@RestController
class ProjectPresetController {
    private final List<ProjectPreset> presets;
    ProjectPresetController(ObjectMapper mapper, Validator validator) throws IOException {
        try (var input = new ClassPathResource("editorial/project-presets.json").getInputStream()) {
            presets = List.copyOf(Arrays.asList(mapper.readValue(input, ProjectPreset[].class)));
        }
        if (presets.size() != 4 || presets.stream().anyMatch(value -> !validator.validate(value).isEmpty())
                || presets.stream().map(value -> value.caseCode() + ":" + value.locale()).distinct().count() != 4) {
            throw new IllegalStateException("Invalid server-side project presets");
        }
    }
    @GetMapping("/api/v1/admin/project-presets/{caseCode}")
    ResponseEntity<ProjectPreset> get(@PathVariable @Pattern(regexp = "BR01|BR02") String caseCode,
            @RequestParam @Pattern(regexp = "fr|en") String locale) {
        var preset = presets.stream().filter(value -> value.caseCode().equals(caseCode) && value.locale().equals(locale))
                .findFirst().orElseThrow(() -> new ApiException(ApiError.RESOURCE_NOT_FOUND));
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(preset);
    }
    public record ProjectPreset(@NotNull @Pattern(regexp = "BR01|BR02") String caseCode,
            @NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Valid ProjectDtos.ProjectPolicy policy,
            @NotNull @Size(min = 20, max = 20) List<@NotNull @Valid Criterion> rubric) { }
    public record Criterion(@NotNull @Pattern(regexp = "(fidelity|scope|budget|schedule|presentation)-[1-4]") String key,
            @NotNull @Size(min = 1, max = 2000) String label, @NotNull @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(1) Integer points,
            @NotNull Boolean blocking) { }
}
