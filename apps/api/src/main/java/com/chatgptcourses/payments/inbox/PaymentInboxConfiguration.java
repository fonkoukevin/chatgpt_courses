package com.chatgptcourses.payments.inbox;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import com.chatgptcourses.payments.config.StripeSettings;
import java.time.Duration;

@Configuration(proxyBeanMethods=false)
@EnableConfigurationProperties(PaymentInboxSettings.class)
@EnableScheduling
class PaymentInboxConfiguration {
    @Bean ThreadPoolTaskScheduler paymentInboxScheduler(PaymentInboxSettings inbox,StripeSettings stripe){
        // First use verifies the merchant, then at most three lists, retrieve and line items.
        Duration networkBound=stripe.connectTimeout().plus(stripe.readTimeout()).multipliedBy(6).plusSeconds(5);
        if(inbox.workerEnabled()&&stripe.enabled()&&inbox.leaseDuration().compareTo(networkBound)<0)throw new IllegalArgumentException("Payment inbox lease must cover six configured provider requests plus five seconds");
        var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("payments-inbox-");scheduler.setWaitForTasksToCompleteOnShutdown(true);scheduler.setAwaitTerminationSeconds(15);return scheduler;
    }
}
