package com.chatgptcourses.shared.config;

import static org.assertj.core.api.Assertions.*;
import jakarta.validation.Validation;
import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class StagingConfigurationTest {
    @Test void stagingRequiresTheSameHttpsAndSecureCookieBoundaryAsProduction() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (String stage : new String[]{"staging", "production"}) {
                assertThat(validator.validate(new RuntimeProperties(stage, URI.create("https://courses.invalid"), true))).isEmpty();
                assertThat(validator.validate(new RuntimeProperties(stage, URI.create("http://courses.invalid"), true))).isNotEmpty();
                assertThat(validator.validate(new RuntimeProperties(stage, URI.create("https://courses.invalid"), false))).isNotEmpty();
            }
            assertThat(validator.validate(new RuntimeProperties("local", URI.create("http://localhost:3000"), false))).isEmpty();
        }
    }

    @Test void exactlyOneMatchingRuntimeProfileIsRequired() {
        var runtime = new RuntimeProperties("staging", URI.create("https://courses.invalid"), true);
        var environment = new MockEnvironment().withProperty("unused", "none");
        environment.setActiveProfiles("staging");
        assertThatCode(() -> new ProfileConfiguration(environment, runtime)).doesNotThrowAnyException();
        environment.setActiveProfiles("production");
        assertThatThrownBy(() -> new ProfileConfiguration(environment, runtime)).isInstanceOf(IllegalStateException.class);
        environment.setActiveProfiles("staging", "production");
        assertThatThrownBy(() -> new ProfileConfiguration(environment, runtime)).isInstanceOf(IllegalStateException.class);
    }
}
