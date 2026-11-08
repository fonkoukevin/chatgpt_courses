package com.chatgptcourses.shared.security;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.shared.http.ApiProblems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Re-checks authoritative account/version/permissions before any session-authenticated API request. */
final class AuthSessionRefreshFilter extends OncePerRequestFilter {
    private final IdentityService identities;
    private final SecurityContextRepository contexts;
    private final ObjectMapper mapper;

    AuthSessionRefreshFilter(IdentityService identities, SecurityContextRepository contexts, ObjectMapper mapper) {
        this.identities = identities;
        this.contexts = contexts;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated() && !(authentication instanceof AnonymousAuthenticationToken)) {
            if (!(authentication.getPrincipal() instanceof IdentityUserDetails principal)) {
                invalidate(request, response);
            } else {
                try {
                    var current = identities.loadSessionUser(principal.getUserId());
                    if (current.isEmpty() || !current.get().active()
                            || current.get().authenticationVersion() != principal.getAuthenticationVersion()) {
                        invalidate(request, response);
                    } else {
                        var refreshed = IdentityUserDetails.fromSession(current.get());
                        var context = SecurityContextHolder.createEmptyContext();
                        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(refreshed, null, refreshed.getAuthorities()));
                        SecurityContextHolder.setContext(context);
                        contexts.saveContext(context, request, response);
                    }
                } catch (DataAccessException failure) {
                    ApiProblems.write(mapper, request, response, HttpStatus.SERVICE_UNAVAILABLE,
                            "SERVICE_UNAVAILABLE", "La session ne peut pas être vérifiée pour le moment.");
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }

    private void invalidate(HttpServletRequest request, HttpServletResponse response) {
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        var empty = SecurityContextHolder.createEmptyContext();
        SecurityContextHolder.setContext(empty);
        contexts.saveContext(empty, request, response);
    }
}
