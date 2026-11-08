package com.chatgptcourses.notifications;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({NotificationSettings.class,OutboxSettings.class})
@EnableScheduling
class NotificationConfiguration {
    @Bean
    ThreadPoolTaskScheduler notificationOutboxScheduler(){
        var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("notification-outbox-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);scheduler.setAwaitTerminationSeconds(12);return scheduler;
    }
}
