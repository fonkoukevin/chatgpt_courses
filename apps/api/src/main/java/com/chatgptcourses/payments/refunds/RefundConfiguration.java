package com.chatgptcourses.payments.refunds;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import com.chatgptcourses.payments.config.StripeSettings;

@Configuration(proxyBeanMethods=false)
@EnableConfigurationProperties(RefundSettings.class)
class RefundConfiguration {
    @Bean ThreadPoolTaskScheduler refundScheduler(RefundSettings settings,StripeSettings stripe){if(stripe.enabled()&&settings.leaseDuration().compareTo(stripe.connectTimeout().plus(stripe.readTimeout()).multipliedBy(7).plusSeconds(5))<0)throw new IllegalArgumentException("Refund lease must cover seven provider requests plus five seconds");var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("refund-reconciliation-");scheduler.setWaitForTasksToCompleteOnShutdown(false);scheduler.setAwaitTerminationSeconds(5);return scheduler;}
}
