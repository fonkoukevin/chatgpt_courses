package com.chatgptcourses.commerce.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
@EnableConfigurationProperties(CommerceSettings.class)
public class CommerceConfiguration {
    @Bean @ConditionalOnMissingBean(PaymentGateway.class)
    PaymentGateway paymentGateway(){return new PaymentGateway(){
        public boolean configured(){return false;}
        public String unavailableReason(){return "PAYMENT_NOT_CONFIGURED";}
    };}
}
