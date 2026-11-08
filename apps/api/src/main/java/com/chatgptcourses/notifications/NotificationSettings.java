package com.chatgptcourses.notifications;

import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("courses.notifications")
public record NotificationSettings(@Pattern(regexp = "local|smtp|disabled") String mailMode, String mailFrom) { }
