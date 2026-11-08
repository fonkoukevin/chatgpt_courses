package com.chatgptcourses.identity.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.ZoneId;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
public class UserPreferences extends VersionedEntity {
    @Column(name = "user_id", nullable = false, updatable = false, unique = true)
    private UUID userId;
    @Column(nullable = false, length = 2)
    private String locale;
    @Column(name = "time_zone", nullable = false, length = 100)
    private String timeZone;

    protected UserPreferences() { }

    public UserPreferences(UUID userId, String locale, String timeZone) {
        this.userId = Objects.requireNonNull(userId);
        changeLocale(locale);
        changeTimeZone(timeZone);
    }

    public void changeLocale(String locale) {
        if (locale == null || !Set.of("fr", "en").contains(locale)) throw new IllegalArgumentException("Unsupported locale");
        this.locale = locale;
    }

    public void changeTimeZone(String timeZone) {
        this.timeZone = ZoneId.of(timeZone).getId();
    }

    public UUID getUserId() { return userId; }
    public String getLocale() { return locale; }
    public String getTimeZone() { return timeZone; }
}
