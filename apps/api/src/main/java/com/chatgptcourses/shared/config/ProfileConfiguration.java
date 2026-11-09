package com.chatgptcourses.shared.config;

import java.util.Arrays;
import java.util.Set;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
class ProfileConfiguration {
    ProfileConfiguration(Environment environment, RuntimeProperties properties) {
        var runtimeProfiles = Arrays.stream(environment.getActiveProfiles())
                .filter(Set.of("local", "test", "staging", "production")::contains).toList();
        if (runtimeProfiles.size() != 1 || !runtimeProfiles.getFirst().equals(properties.environment())) {
            throw new IllegalStateException("Activer exactement un profil Spring local, test, staging ou production correspondant à APP_ENV");
        }
    }
}
