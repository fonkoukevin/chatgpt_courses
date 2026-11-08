package com.chatgptcourses.identity.config;

import java.security.SecureRandom;
import java.util.Map;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(IdentitySettings.class)
public class IdentityConfiguration {
    public static final String PASSWORD_ENCODER_ID = "pbkdf2@SpringSecurity_v5_8";
    @Bean
    PasswordEncoder passwordEncoder() {
        // Versioned Spring preset: PBKDF2-HMAC-SHA256, 310000 iterations, 16-byte salt, 256-bit output.
        var encoder = new DelegatingPasswordEncoder(PASSWORD_ENCODER_ID,
                Map.of(PASSWORD_ENCODER_ID, Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8()));
        encoder.setDefaultPasswordEncoderForMatches(new PasswordEncoder() {
            @Override public String encode(CharSequence rawPassword) { throw new UnsupportedOperationException("Unsupported encoding"); }
            @Override public boolean matches(CharSequence rawPassword, String encodedPassword) { return false; }
        });
        return encoder;
    }
    @Bean SecureRandom identitySecureRandom() { return new SecureRandom(); }
}
