package com.chatgptcourses;

import com.chatgptcourses.shared.config.RuntimeProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(RuntimeProperties.class)
public class CoursesApplication {
    public static void main(String[] args) {
        SpringApplication.run(CoursesApplication.class, args);
    }
}
