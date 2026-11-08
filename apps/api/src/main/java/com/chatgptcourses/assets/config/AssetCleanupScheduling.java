package com.chatgptcourses.assets.config;

import com.chatgptcourses.assets.service.AssetStagingCleanup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Bounded operational cleanup; no bucket listing and no READY object deletion. */
@Configuration(proxyBeanMethods=false) @EnableScheduling
@ConditionalOnProperty(prefix="courses.assets",name="enabled",havingValue="true")
public class AssetCleanupScheduling {
    private static final Logger LOG=LoggerFactory.getLogger(AssetCleanupScheduling.class);
    private final AssetStagingCleanup cleanup;private final boolean enabled;
    public AssetCleanupScheduling(AssetStagingCleanup cleanup,@Value("${courses.assets.staging-cleanup-worker-enabled:true}") boolean enabled){this.cleanup=cleanup;this.enabled=enabled;}
    @Bean
    ThreadPoolTaskScheduler assetStagingCleanupScheduler(){var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("asset-staging-cleanup-");scheduler.setRemoveOnCancelPolicy(true);scheduler.setWaitForTasksToCompleteOnShutdown(false);scheduler.setAwaitTerminationSeconds(20);return scheduler;}
    @Scheduled(initialDelayString="${courses.assets.staging-cleanup-poll-delay:60s}",fixedDelayString="${courses.assets.staging-cleanup-poll-delay:60s}",scheduler="assetStagingCleanupScheduler")
    public void clean(){if(!enabled)return;try{if(cleanup.cleanBatch(25).failed()>0)LOG.warn("ASSET_STAGING_CLEANUP_UNAVAILABLE");}catch(RuntimeException unavailable){LOG.warn("ASSET_STAGING_CLEANUP_UNAVAILABLE");}}
}
