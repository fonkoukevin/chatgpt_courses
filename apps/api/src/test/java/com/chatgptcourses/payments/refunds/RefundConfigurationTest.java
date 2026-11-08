package com.chatgptcourses.payments.refunds;

import static org.assertj.core.api.Assertions.*;
import com.chatgptcourses.payments.config.StripeSettings;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Real property binding/bean startup; no gateway, socket or provider credentials are used. */
class RefundConfigurationTest {
    @Test void sevenReadBudgetIsEnforcedEvenWhenTheScheduledWorkerIsOff() {
        var context = context(true, Duration.ofSeconds(3), Duration.ofSeconds(8));
        context.withPropertyValues("courses.payments.refunds.lease-duration=81999ms")
            .run(application -> assertThat(application).hasFailed());
        context.withPropertyValues("courses.payments.refunds.lease-duration=82s")
            .run(application -> assertThat(application).hasNotFailed().hasSingleBean(ThreadPoolTaskScheduler.class));
        context.run(application -> assertThat(application).hasNotFailed().hasSingleBean(ThreadPoolTaskScheduler.class));
    }

    @Test void maximumAllowedNetworkTimeoutsRequireTheirFullLeaseBudget() {
        var enabled = context(true, Duration.ofSeconds(15), Duration.ofSeconds(15));
        enabled.withPropertyValues("courses.payments.refunds.lease-duration=120s")
            .run(application -> assertThat(application).hasFailed());
        enabled.withPropertyValues("courses.payments.refunds.lease-duration=215s")
            .run(application -> assertThat(application).hasNotFailed().hasSingleBean(ThreadPoolTaskScheduler.class));
        context(false, Duration.ofSeconds(15), Duration.ofSeconds(15))
            .withPropertyValues("courses.payments.refunds.lease-duration=30s")
            .run(application -> assertThat(application).hasNotFailed());
    }

    private static ApplicationContextRunner context(boolean enabled, Duration connect, Duration read) {
        return new ApplicationContextRunner().withUserConfiguration(RefundConfiguration.class)
            .withBean(StripeSettings.class, () -> new StripeSettings(enabled, "TEST",
                "sk_test_unit_" + UUID.randomUUID(), "whsec_unit_" + UUID.randomUUID(), "acct_UnitFixture",
                URI.create("https://api.stripe.com"), connect, read, Duration.ofMinutes(10)))
            .withPropertyValues("courses.payments.refunds.worker-enabled=false");
    }
}
