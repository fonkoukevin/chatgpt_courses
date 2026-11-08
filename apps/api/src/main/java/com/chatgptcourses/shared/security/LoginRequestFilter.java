package com.chatgptcourses.shared.security;

import com.chatgptcourses.shared.http.ApiProblems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Validates the form envelope; Spring's authentication filter remains responsible for authentication. */
final class LoginRequestFilter extends OncePerRequestFilter {
    private final ObjectMapper mapper;
    LoginRequestFilter(ObjectMapper mapper) { this.mapper = mapper; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !"/api/v1/auth/login".equals(request.getServletPath());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean valid;
        try {
            valid = request.getQueryString() == null && request.getContentType() != null
                    && MediaType.APPLICATION_FORM_URLENCODED.isCompatibleWith(MediaType.parseMediaType(request.getContentType()));
        } catch (IllegalArgumentException malformed) { valid = false; }
        if (valid) {
            for (var entry : request.getParameterMap().entrySet()) {
                if (!Set.of("email", "password", "_csrf").contains(entry.getKey()) || entry.getValue().length != 1) {
                    valid = false;
                    break;
                }
            }
            String email = request.getParameter("email");
            String password = request.getParameter("password");
            valid &= (email == null || email.length() <= 320)
                    && (password == null || password.getBytes(StandardCharsets.UTF_8).length <= 1024);
        }
        if (!valid) {
            ApiProblems.write(mapper, request, response, HttpStatus.BAD_REQUEST,
                    "INVALID_REQUEST", "La connexion attend uniquement un formulaire email et password.");
            return;
        }
        chain.doFilter(request, response);
    }
}
