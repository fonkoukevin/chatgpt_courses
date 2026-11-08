package com.chatgptcourses.notifications;

import com.chatgptcourses.notifications.NotificationTypes.Payload;
import com.chatgptcourses.notifications.NotificationTypes.Type;
import java.util.UUID;

/** Delivery port. SMTP offers no exactly-once or provider idempotency guarantee. Never log payload arguments. */
public interface NotificationSender {
    void send(UUID notificationId, Type type, Payload payload);
}
