package com.chatgptcourses.notifications;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;

public record PasswordResetNotification(String email, String locale, @JsonIgnore String token, Instant expiresAt) {
    @Override public String toString() { return "PasswordResetNotification[redacted]"; }
}
