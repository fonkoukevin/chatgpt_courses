package com.chatgptcourses.identity.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.Locale;
import java.util.Objects;

@Entity
@Table(name = "user_accounts")
public class UserAccount extends VersionedEntity {
    public enum Status { ACTIVE, DISABLED, ANONYMIZED }

    @Column(name = "normalized_email", length = 320, unique = true)
    private String normalizedEmail;
    @JsonIgnore
    @Column(name = "password_hash", length = 255)
    private String passwordHash;
    @Column(name = "display_name", length = 120)
    private String displayName;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    protected UserAccount() { }

    public UserAccount(String email, String passwordHash, String displayName) {
        this.normalizedEmail = Objects.requireNonNull(email).strip().toLowerCase(Locale.ROOT);
        this.passwordHash = Objects.requireNonNull(passwordHash);
        this.displayName = displayName;
        this.status = Status.ACTIVE;
    }

    public void changeDisplayName(String displayName) { this.displayName = displayName; }
    public String getNormalizedEmail() { return normalizedEmail; }
    @JsonIgnore
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public Status getStatus() { return status; }
}
