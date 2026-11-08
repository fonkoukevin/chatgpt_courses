package com.chatgptcourses.notifications;

import java.time.Instant;

/** Delivery port; callers must never log arguments or serialize the raw token. */
public interface PasswordResetNotifier {
    void send(String email, String locale, String token, Instant expiresAt);
}
