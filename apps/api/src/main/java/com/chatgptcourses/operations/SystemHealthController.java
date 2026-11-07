package com.chatgptcourses.operations;

import com.chatgptcourses.shared.http.ApiProblems;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SystemHealthController {
    private final JdbcTemplate jdbc;

    SystemHealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/v1/system/health")
    ResponseEntity<?> health(HttpServletRequest request) {
        try {
            if (!Integer.valueOf(1).equals(jdbc.queryForObject("SELECT 1", Integer.class))) {
                return unavailable(request);
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("status", "UP"));
        } catch (DataAccessException exception) {
            return unavailable(request);
        }
    }

    private ResponseEntity<?> unavailable(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .cacheControl(CacheControl.noStore())
                .body(ApiProblems.create(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE",
                        "Le service est temporairement indisponible.", request.getRequestURI()));
    }
}
