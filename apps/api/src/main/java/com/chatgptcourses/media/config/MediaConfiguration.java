package com.chatgptcourses.media.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
@EnableConfigurationProperties(MediaProperties.class)
class MediaConfiguration { }
