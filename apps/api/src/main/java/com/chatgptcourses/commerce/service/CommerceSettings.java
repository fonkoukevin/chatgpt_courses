package com.chatgptcourses.commerce.service;

import java.time.Duration;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** No commercial currency is activated by default. ISO scales are explicit for this first scope. */
@ConfigurationProperties("courses.commerce")
public record CommerceSettings(boolean enabled,Set<String> allowedCurrencies,Duration orderTtl) {
    public static final Set<String> SUPPORTED_CURRENCIES=Set.of("EUR","USD","GBP");
    public CommerceSettings {
        allowedCurrencies=allowedCurrencies==null?Set.of():Set.copyOf(allowedCurrencies);
        orderTtl=orderTtl==null?Duration.ofMinutes(30):orderTtl;
        if(!SUPPORTED_CURRENCIES.containsAll(allowedCurrencies)||orderTtl.compareTo(Duration.ofMinutes(1))<0||orderTtl.compareTo(Duration.ofHours(24))>0)throw new IllegalArgumentException("Invalid commerce configuration");
    }
}
