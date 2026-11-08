package com.chatgptcourses.notifications;

import com.chatgptcourses.shared.config.RuntimeProperties;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
class SmtpPasswordResetNotifier implements PasswordResetNotifier {
    private final JavaMailSender mail;
    private final RuntimeProperties runtime;
    private final NotificationSettings settings;
    private final String host;
    SmtpPasswordResetNotifier(JavaMailSender mail, RuntimeProperties runtime, NotificationSettings settings,
                             @Value("${spring.mail.host}") String host) {
        this.mail = mail;
        this.runtime = runtime;
        this.settings = settings;
        this.host = host;
    }
    @Override public void send(String email, String locale, String token, Instant expiresAt) {
        if ("disabled".equals(settings.mailMode())) throw new IllegalStateException("Notification delivery disabled");
        boolean local = "local".equals(settings.mailMode());
        if (local && (!Set.of("local", "test").contains(runtime.environment()) || !Set.of("localhost", "127.0.0.1", "::1").contains(host))) {
            throw new IllegalStateException("Local mail delivery requires an isolated loopback target");
        }
        var from = settings.mailFrom();
        if (from == null || from.isBlank()) {
            if (!local) throw new IllegalStateException("MAIL_FROM is required for SMTP delivery");
            from = "noreply@courses.local.invalid";
        }
        var link = runtime.publicOrigin().toASCIIString() + ("en".equals(locale) ? "/en/reset-password" : "/fr/reinitialisation") + "#token=" + token;
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("en".equals(locale) ? "Reset your ChatGPT Courses password" : "Réinitialiser votre mot de passe ChatGPT Courses");
        message.setText("en".equals(locale)
                ? "A password reset was requested. Open this single-use link:\n\n" + link + "\n\nExpires at " + expiresAt + " (UTC). If you did not request this, ignore this message."
                : "Une réinitialisation a été demandée. Ouvrez ce lien à usage unique :\n\n" + link + "\n\nExpiration : " + expiresAt + " (UTC). Si vous ne l’avez pas demandée, ignorez ce message.");
        mail.send(message);
    }
}
