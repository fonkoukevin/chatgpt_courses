package com.chatgptcourses.payments.refunds;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("courses.payments.refunds")
public record RefundSettings(boolean workerEnabled,Duration pollDelay,Duration leaseDuration,Duration retryDelay,int maxAttempts){
    public RefundSettings{
        if(pollDelay==null)pollDelay=Duration.ofSeconds(2);if(leaseDuration==null)leaseDuration=Duration.ofMinutes(2);if(retryDelay==null)retryDelay=Duration.ofSeconds(10);if(maxAttempts==0)maxAttempts=5;
        if(pollDelay.isNegative()||pollDelay.isZero()||leaseDuration.compareTo(Duration.ofSeconds(30))<0||leaseDuration.compareTo(Duration.ofMinutes(10))>0||retryDelay.isNegative()||retryDelay.isZero()||maxAttempts<1||maxAttempts>20)throw new IllegalArgumentException("Refund worker configuration invalid");
    }
}
