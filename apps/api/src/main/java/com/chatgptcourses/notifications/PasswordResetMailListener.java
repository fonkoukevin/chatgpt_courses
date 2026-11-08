package com.chatgptcourses.notifications;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** P04 delivery is asynchronous but not durable; P10 will replace this boundary with an outbox. */
@Component
class PasswordResetMailListener {
    private static final Logger LOG = LoggerFactory.getLogger(PasswordResetMailListener.class);
    private final PasswordResetNotifier notifier;
    private final TaskExecutor executor;
    PasswordResetMailListener(PasswordResetNotifier notifier, @Qualifier("passwordResetMailExecutor") TaskExecutor executor) {
        this.notifier = notifier;
        this.executor = executor;
    }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void deliver(PasswordResetNotification notification) {
        try {
            executor.execute(() -> {
                try { notifier.send(notification.email(), notification.locale(), notification.token(), notification.expiresAt()); }
                catch (RuntimeException failure) { LOG.warn("Password recovery notification could not be delivered"); }
            });
        } catch (RuntimeException failure) { LOG.warn("Password recovery notification could not be scheduled"); }
    }
}
