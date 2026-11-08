package com.chatgptcourses.operations;

import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
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
    ResponseEntity<SystemHealthResponse> health() {
        try {
            if (!Integer.valueOf(1).equals(jdbc.queryForObject("SELECT 1", Integer.class))) {
                throw new ApiException(ApiError.SERVICE_UNAVAILABLE);
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(new SystemHealthResponse(SystemHealthResponse.Status.UP));
        } catch (DataAccessException exception) {
            throw new ApiException(ApiError.SERVICE_UNAVAILABLE);
        }
    }

}
