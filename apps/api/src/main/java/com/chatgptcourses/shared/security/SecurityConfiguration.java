package com.chatgptcourses.shared.security;

import com.chatgptcourses.shared.http.ApiProblems;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, ObjectMapper mapper) throws Exception {
        return http
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.GET, "/api/v1/system/**").permitAll()
                        .anyRequest().denyAll())
                .csrf(Customizer.withDefaults())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .requestCache(cache -> cache.disable())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> ApiProblems.write(
                                mapper, request, response, HttpStatus.UNAUTHORIZED,
                                "AUTHENTICATION_REQUIRED", "Une authentification est nécessaire."))
                        .accessDeniedHandler((request, response, exception) -> ApiProblems.write(
                                mapper, request, response, HttpStatus.FORBIDDEN,
                                "ACCESS_DENIED", "Cette action n’est pas autorisée.")))
                .build();
    }

    // P04 remplacera ce refus explicite par l'identité persistée ; aucun compte généré.
    @Bean
    UserDetailsService unavailableIdentity() {
        return username -> { throw new UsernameNotFoundException("Authentication unavailable"); };
    }
}
