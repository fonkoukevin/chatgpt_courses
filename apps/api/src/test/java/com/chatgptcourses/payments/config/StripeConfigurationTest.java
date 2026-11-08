package com.chatgptcourses.payments.config;

import static org.assertj.core.api.Assertions.*;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class StripeConfigurationTest {
    @Test void existingLowercaseModeIsAcceptedAndSecretsNeverAppearInSettingsToString(){
        String secret="sk_test_local_"+UUID.randomUUID();var settings=settings(false," test ",secret,URI.create("https://api.stripe.com"));
        assertThat(settings.mode()).isEqualTo("TEST");assertThat(settings.toString().contains(secret)).isFalse();assertThat(new StripeConfiguration().paymentGateway(settings,runtime("local")).configured()).isFalse();
    }
    @Test void liveModeAndApiOverridesOutsideTheExplicitTestEnvironmentFailClosed(){
        var factory=new StripeConfiguration();var live=settings(true,"LIVE","sk_live_"+UUID.randomUUID(),URI.create("https://api.stripe.com"));
        assertThat(catchThrowable(()->factory.paymentGateway(live,runtime("local")))).isInstanceOf(IllegalStateException.class);
        var loopback=settings(true,"TEST","sk_test_"+UUID.randomUUID(),URI.create("http://127.0.0.1:9876"));
        assertThat(catchThrowable(()->factory.paymentGateway(loopback,runtime("production")))).isInstanceOf(IllegalStateException.class);
        assertThat(catchThrowable(()->factory.paymentGateway(loopback,runtime("local")))).isInstanceOf(IllegalStateException.class);
        assertThat(factory.paymentGateway(loopback,runtime("test")).configured()).isTrue();
        assertThat(catchThrowable(()->factory.paymentGateway(settings(false,"TEST","",URI.create("https://invalid.example")),runtime("test")))).isInstanceOf(IllegalStateException.class);
    }
    @Test void testPaymentsAreUnavailableInProductionButRemainAvailableInStaging(){
        var factory=new StripeConfiguration();var enabled=settings(true,"TEST","sk_test_"+UUID.randomUUID(),URI.create("https://api.stripe.com"));
        assertThat(catchThrowable(()->factory.paymentGateway(enabled,runtime("production")))).isInstanceOf(IllegalStateException.class).hasMessage("Stripe payments are unavailable in production");
        assertThat(factory.paymentGateway(settings(false,"TEST","",URI.create("https://api.stripe.com")),runtime("production")).configured()).isFalse();
        assertThat(factory.paymentGateway(enabled,runtime("staging")).configured()).isTrue();
    }
    private static StripeSettings settings(boolean enabled,String mode,String key,URI base){return new StripeSettings(enabled,mode,key,"whsec_local_only","acct_local_test",base,Duration.ofSeconds(3),Duration.ofSeconds(8),Duration.ofMinutes(10));}
    private static RuntimeProperties runtime(String environment){return new RuntimeProperties(environment,URI.create("https://courses.invalid"),true);}
}
