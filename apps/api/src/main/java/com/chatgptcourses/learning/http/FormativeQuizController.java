package com.chatgptcourses.learning.http;

import com.chatgptcourses.learning.service.LearningService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class FormativeQuizController {
    private final LearningService service;
    FormativeQuizController(LearningService service) { this.service = service; }

    @PostMapping("/api/v1/learning/activities/{resourceId}/versions/{versionId}/quiz-checks")
    ResponseEntity<LearningDtos.QuizCheckResult> check(@PathVariable UUID resourceId, @PathVariable UUID versionId,
            @Valid @RequestBody LearningDtos.QuizCheck request) {
        // Public authorization does not bypass the default Spring CSRF/session-token protection.
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(LearningDtos.QuizCheckResult.from(service.checkQuiz(resourceId, versionId, request.command())));
    }
}
