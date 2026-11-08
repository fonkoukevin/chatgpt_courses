package com.chatgptcourses.payments.inbox;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("courses.payments.inbox")
public record PaymentInboxSettings(@DefaultValue("true")boolean workerEnabled,@DefaultValue("1s")Duration pollDelay,
        @DefaultValue("75s")Duration leaseDuration,@DefaultValue("5")int maxAttempts,@DefaultValue("5s")Duration retryBase,
        @DefaultValue("5m")Duration retryMax,@DefaultValue("30s")Duration waitingDelay) {
    public PaymentInboxSettings {
        if(!between(pollDelay,Duration.ofMillis(100),Duration.ofMinutes(1))||!between(leaseDuration,Duration.ofSeconds(15),Duration.ofMinutes(5))
                ||maxAttempts<1||maxAttempts>20||!between(retryBase,Duration.ofSeconds(1),Duration.ofMinutes(5))
                ||!between(retryMax,retryBase,Duration.ofHours(1))||!between(waitingDelay,Duration.ofSeconds(5),Duration.ofHours(1)))throw new IllegalArgumentException("Invalid payment inbox timing configuration");
    }
    private static boolean between(Duration value,Duration minimum,Duration maximum){return value!=null&&value.compareTo(minimum)>=0&&value.compareTo(maximum)<=0;}
}
