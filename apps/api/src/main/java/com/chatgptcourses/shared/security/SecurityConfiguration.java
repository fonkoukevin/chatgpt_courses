package com.chatgptcourses.shared.security;

import com.chatgptcourses.shared.http.ApiProblems;
import com.chatgptcourses.identity.http.IdentityDtos.AuthUserResponse;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.identity.service.SessionUserSnapshot;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, ObjectMapper mapper, IdentityService identities,
                                    UserDetailsService users, PasswordEncoder encoder,
                                    SecurityContextRepository contexts) throws Exception {
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return http
                .authenticationProvider(provider)
                .securityContext(context -> context.securityContextRepository(contexts).requireExplicitSave(true))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.GET, "/api/v1/system/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login",
                                "/api/v1/auth/logout", "/api/v1/auth/password-reset-requests", "/api/v1/auth/password-resets").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/me", "/api/v1/me/preferences").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/me/preferences").hasAuthority("identity.preferences.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/methods", "/api/v1/me/methods/*",
                                "/api/v1/me/methods/*/source-update").hasAuthority("methods.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/methods", "/api/v1/me/methods/from-template",
                                "/api/v1/me/methods/*/duplicates").hasAuthority("methods.write")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/me/methods/*").hasAuthority("methods.write")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/me/methods/*").hasAuthority("methods.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/method-templates/*/versions/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/learning", "/api/v1/me/enrollments/*",
                                "/api/v1/me/enrollments/*/activities/*", "/api/v1/me/activity-progress/*",
                                "/api/v1/me/activity-notes/*", "/api/v1/me/activity-notes/by-activity/*",
                                "/api/v1/me/quiz-attempts", "/api/v1/me/quiz-attempts/*").hasAuthority("learning.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/enrollments", "/api/v1/me/enrollments/*/visits",
                                "/api/v1/me/activity-notes", "/api/v1/activities/*/quiz-attempts").hasAuthority("learning.write")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/me/activity-progress/*").hasAuthority("learning.write")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/me/activity-notes/*").hasAuthority("learning.write")
                        .requestMatchers(HttpMethod.POST, "/api/v1/learning/activities/*/versions/*/quiz-checks").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/project-templates/*/versions/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/projects", "/api/v1/me/projects/*",
                                "/api/v1/me/projects/*/revisions", "/api/v1/me/projects/*/revisions/*",
                                "/api/v1/me/projects/*/context", "/api/v1/me/projects/*/status",
                                "/api/v1/me/projects/*/self-assessments", "/api/v1/me/projects/*/self-assessments/*").hasAuthority("projects.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/projects", "/api/v1/me/projects/*/self-assessments",
                                "/api/v1/activities/*/solution-reveals").hasAuthority("projects.write")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/me/projects/*").hasAuthority("projects.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/projects/*/file-policy", "/api/v1/me/projects/*/attachments")
                            .hasAuthority("assets.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/projects/*/upload-intents", "/api/v1/me/projects/*/attachments")
                            .hasAuthority("assets.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/assets/upload-policy", "/api/v1/admin/assets/*")
                            .hasAuthority("content.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/assets/upload-intents", "/api/v1/admin/assets/*/confirmations")
                            .hasAuthority("content.write")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/assets/*/download-access").hasAuthority("content.read")
                        // Public editorial resources still require live publication/access checks and CSRF on POST.
                        .requestMatchers(HttpMethod.POST, "/api/v1/assets/*/download-access", "/api/v1/media/*/playback-access").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/media/*", "/api/v1/media/*/stream").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/api/v1/media/*/stream").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/media-progress/*").hasAuthority("media.progress.read")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/me/media-progress/*").hasAuthority("media.progress.write")
                        .requestMatchers(HttpMethod.POST, "/api/v1/webhooks/stripe").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/orders/*/checkout").hasAuthority("commerce.orders.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/orders/*/payment-status").hasAuthority("commerce.orders.read")
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/payment-events").hasAuthority("payments.events.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/payment-events/*/retry").hasAuthority("payments.events.retry")
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/resources/*/versions/*").hasAuthority("learning.read")
                        .requestMatchers(HttpMethod.GET,"/api/v1/me/orders/*/refund-context","/api/v1/me/refund-requests","/api/v1/me/refund-requests/*","/api/v1/me/refunds","/api/v1/me/refunds/*").hasAuthority("refunds.read")
                        .requestMatchers(HttpMethod.POST,"/api/v1/me/orders/*/refund-requests").hasAuthority("refunds.request")
                        .requestMatchers(HttpMethod.GET,"/api/v1/me/entitlements").hasAuthority("entitlements.read")
                        .requestMatchers(HttpMethod.GET,"/api/v1/admin/orders/*/refund-context","/api/v1/admin/refund-requests","/api/v1/admin/refund-requests/*","/api/v1/admin/refunds","/api/v1/admin/refunds/*").hasAuthority("refunds.admin.read")
                        .requestMatchers(HttpMethod.POST,"/api/v1/admin/refund-requests/*/preview","/api/v1/admin/refund-requests/*/decision","/api/v1/admin/refunds/*/access-decision").hasAuthority("refunds.decide")
                        .requestMatchers(HttpMethod.POST,"/api/v1/admin/refunds/*/execute","/api/v1/admin/refunds/*/cancel").hasAuthority("refunds.execute")
                        .requestMatchers(HttpMethod.POST,"/api/v1/admin/refunds/*/reconciliation-requests").hasAuthority("refunds.reconcile")
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/project-templates/*/versions/*").hasAuthority("projects.read")
                        .requestMatchers(HttpMethod.GET, "/api/v1/offers", "/api/v1/offers/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/offers/*/purchase-context", "/api/v1/me/orders", "/api/v1/me/orders/*").hasAuthority("commerce.orders.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/orders").hasAuthority("commerce.orders.write")
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/offers", "/api/v1/admin/offers/*", "/api/v1/admin/offers/*/readiness").hasAuthority("commerce.offers.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/offers").hasAuthority("commerce.offers.write")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/admin/offers/*").hasAuthority("commerce.offers.write")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/offers/*/activate", "/api/v1/admin/offers/*/deactivate").hasAuthority("commerce.offers.activate")
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/notifications").hasAuthority("notifications.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/notifications/*/retry").hasAuthority("notifications.manage")
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/project-presets/*").hasAuthority("content.read")
                        .requestMatchers(HttpMethod.GET, "/api/v1/contents/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/catalog", "/api/v1/catalog/facets", "/api/v1/catalog/resources/*",
                                "/api/v1/catalog/by-slug/*/*", "/api/v1/catalog/resources/*/versions/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/contents", "/api/v1/admin/contents/**")
                            .hasAuthority("content.read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/contents/*/publish").hasAuthority("content.publish")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/contents/*/archive").hasAuthority("content.archive")
                        // READY needs review permission; other transitions need write. The service checks the target.
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/contents/*/transition")
                            .hasAnyAuthority("content.write", "content.review")
                        .requestMatchers(HttpMethod.POST, "/api/v1/admin/contents", "/api/v1/admin/contents/*/revisions",
                                "/api/v1/admin/contents/*/versions", "/api/v1/admin/contents/*/duplicate",
                                "/api/v1/admin/contents/*/translations").hasAuthority("content.write")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/admin/contents/*/composition", "/api/v1/admin/contents/*/metadata").hasAuthority("content.write")
                        .anyRequest().denyAll())
                // The default session token repository and XOR/BREACH handler are deliberately retained.
                .csrf(csrf -> csrf.ignoringRequestMatchers(request -> "POST".equals(request.getMethod())
                        && "/api/v1/webhooks/stripe".equals(request.getServletPath())))
                .addFilterAfter(new AuthSessionRefreshFilter(identities, contexts, mapper), SecurityContextHolderFilter.class)
                .addFilterBefore(new LoginRequestFilter(mapper), UsernamePasswordAuthenticationFilter.class)
                .formLogin(form -> form.loginPage("/api/v1/auth/login").loginProcessingUrl("/api/v1/auth/login")
                        .usernameParameter("email").passwordParameter("password")
                        .successHandler((request, response, authentication) -> {
                            var principal = (IdentityUserDetails) authentication.getPrincipal();
                            Optional<SessionUserSnapshot> current;
                            try { current = identities.loadSessionUser(principal.getUserId()); }
                            catch (DataAccessException unavailable) {
                                var session = request.getSession(false);
                                if (session != null) session.invalidate();
                                org.springframework.security.core.context.SecurityContextHolder.clearContext();
                                ApiProblems.write(mapper, request, response, HttpStatus.SERVICE_UNAVAILABLE,
                                        "SERVICE_UNAVAILABLE", "Le service de connexion est temporairement indisponible.");
                                return;
                            }
                            if (current.isEmpty() || !current.get().active()
                                    || current.get().authenticationVersion() != principal.getAuthenticationVersion()) {
                                var session = request.getSession(false);
                                if (session != null) session.invalidate();
                                org.springframework.security.core.context.SecurityContextHolder.clearContext();
                                ApiProblems.write(mapper, request, response, HttpStatus.UNAUTHORIZED,
                                        "BAD_CREDENTIALS", "L’adresse ou le mot de passe est incorrect.");
                                return;
                            }
                            response.setStatus(HttpStatus.OK.value());
                            response.setContentType("application/json");
                            response.setHeader("Cache-Control", "private, no-store");
                            mapper.writeValue(response.getOutputStream(), AuthUserResponse.from(current.get().profile()));
                        })
                        .failureHandler((request, response, failure) -> {
                            boolean unavailable = failure instanceof AuthenticationServiceException;
                            ApiProblems.write(mapper, request, response,
                                    unavailable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.UNAUTHORIZED,
                                    unavailable ? "SERVICE_UNAVAILABLE" : "BAD_CREDENTIALS",
                                    unavailable ? "Le service de connexion est temporairement indisponible." : "L’adresse ou le mot de passe est incorrect.");
                        }))
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.logoutUrl("/api/v1/auth/logout")
                        .invalidateHttpSession(true).clearAuthentication(true)
                        .logoutSuccessHandler((request, response, authentication) -> {
                            response.setStatus(HttpStatus.NO_CONTENT.value());
                            response.setHeader("Cache-Control", "private, no-store");
                        }))
                .requestCache(cache -> cache.disable())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> ApiProblems.write(
                                mapper, request, response, HttpStatus.UNAUTHORIZED,
                                "AUTHENTICATION_REQUIRED", "Une authentification est nécessaire."))
                        .accessDeniedHandler((request, response, exception) -> ApiProblems.write(
                                mapper, request, response, HttpStatus.FORBIDDEN,
                                exception instanceof CsrfException ? "CSRF_INVALID" : "ACCESS_DENIED",
                                exception instanceof CsrfException ? "Le contrôle de session est invalide ou a expiré." : "Cette action n’est pas autorisée.")))
                .build();
    }

    @Bean
    SecurityContextRepository securityContexts() {
        return new DelegatingSecurityContextRepository(new RequestAttributeSecurityContextRepository(), new HttpSessionSecurityContextRepository());
    }

    @Bean
    CookieSerializer sessionCookieSerializer(RuntimeProperties runtime) {
        var serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSION");
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(runtime.sessionCookieSecure());
        serializer.setSameSite("Lax");
        return serializer;
    }
}
