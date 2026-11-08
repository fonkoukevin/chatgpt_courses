package com.chatgptcourses.payments.config;

import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.payments.gateway.StripePaymentGateway;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.util.Set;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false) @EnableConfigurationProperties(StripeSettings.class)
public class StripeConfiguration {
    @Bean PaymentGateway paymentGateway(StripeSettings settings,RuntimeProperties runtime){
        if(settings.enabled()&&"production".equals(runtime.environment()))throw new IllegalStateException("Stripe payments are unavailable in production");
        var base=settings.apiBase();boolean standard="https://api.stripe.com".equals(base.toString());
        boolean loopback="test".equals(runtime.environment())&&"http".equals(base.getScheme())&&base.getHost()!=null&&Set.of("localhost","127.0.0.1","::1","[::1]").contains(base.getHost())&&base.getUserInfo()==null&&base.getQuery()==null&&base.getFragment()==null&&(base.getPath()==null||base.getPath().isEmpty());
        if(!standard&&!loopback)throw new IllegalStateException("Stripe API endpoint is unavailable for this environment");
        if(!Set.of("TEST","LIVE").contains(settings.mode())||(settings.enabled()&&(!"TEST".equals(settings.mode())||(!settings.apiKey().isBlank()&&!settings.apiKey().startsWith("sk_test_")))))throw new IllegalStateException("Stripe mode configuration is unavailable");
        return new StripePaymentGateway(settings);
    }
}
