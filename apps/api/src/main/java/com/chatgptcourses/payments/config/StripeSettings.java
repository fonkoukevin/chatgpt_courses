package com.chatgptcourses.payments.config;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("courses.stripe")
public record StripeSettings(boolean enabled,String mode,String apiKey,String webhookSecret,String accountId,URI apiBase,Duration connectTimeout,Duration readTimeout,Duration recoveryWindow){
    public static final String API_VERSION="2026-10-28.endive";
    public StripeSettings{
        mode=mode==null||mode.isBlank()?"TEST":mode.strip().toUpperCase(java.util.Locale.ROOT);
        apiKey=apiKey==null?"":apiKey;webhookSecret=webhookSecret==null?"":webhookSecret;accountId=accountId==null?"":accountId;
        apiBase=apiBase==null?URI.create("https://api.stripe.com"):apiBase;
        connectTimeout=connectTimeout==null?Duration.ofSeconds(3):connectTimeout;readTimeout=readTimeout==null?Duration.ofSeconds(8):readTimeout;recoveryWindow=recoveryWindow==null?Duration.ofMinutes(10):recoveryWindow;
        if(connectTimeout.compareTo(Duration.ofMillis(100))<0||connectTimeout.compareTo(Duration.ofSeconds(15))>0||readTimeout.compareTo(Duration.ofMillis(100))<0||readTimeout.compareTo(Duration.ofSeconds(15))>0||recoveryWindow.compareTo(Duration.ofMinutes(1))<0||recoveryWindow.compareTo(Duration.ofMinutes(15))>0)throw new IllegalArgumentException("Invalid Stripe time bounds");
    }
    @Override public String toString(){return "StripeSettings[redacted]";}
}
