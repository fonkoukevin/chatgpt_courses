package com.chatgptcourses.shared.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("courses.runtime")
public record RuntimeProperties(@NotBlank String environment, URI publicOrigin,
                                boolean sessionCookieSecure) {
    @AssertTrue(message = "APP_ENV doit valoir local, test ou production")
    public boolean isKnownEnvironment() {
        return environment != null && Set.of("local", "test", "production").contains(environment);
    }

    @AssertTrue(message = "APP_PUBLIC_ORIGIN doit être une origine HTTP(S), sans chemin, identifiants, requête ou fragment")
    public boolean isValidOrigin() {
        return publicOrigin != null && publicOrigin.getHost() != null
                && Set.of("http", "https").contains(publicOrigin.getScheme())
                && publicOrigin.getUserInfo() == null && publicOrigin.getQuery() == null
                && publicOrigin.getFragment() == null
                && (publicOrigin.getPath() == null || publicOrigin.getPath().isEmpty());
    }

    @AssertTrue(message = "En production : APP_PUBLIC_ORIGIN en HTTPS et SESSION_COOKIE_SECURE=true obligatoires")
    public boolean isProductionSecure() {
        return !"production".equals(environment)
                || (publicOrigin != null && "https".equals(publicOrigin.getScheme()) && sessionCookieSecure);
    }
}
