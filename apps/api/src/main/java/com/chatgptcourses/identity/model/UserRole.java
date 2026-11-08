package com.chatgptcourses.identity.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A revoked grant stays in history; a new grant gets a new UUID. */
@Entity
@Table(name = "user_roles")
public class UserRole extends VersionedEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Column(name = "role_id", nullable = false, updatable = false)
    private UUID roleId;
    @Column(name = "granted_by", updatable = false)
    private UUID grantedBy;
    @Column(name = "revoked_at", columnDefinition = "timestamptz")
    private Instant revokedAt;
    protected UserRole() { }
    public UserRole(UUID userId, UUID roleId, UUID grantedBy) {
        this.userId = Objects.requireNonNull(userId);
        this.roleId = Objects.requireNonNull(roleId);
        this.grantedBy = grantedBy;
    }
    public void revoke(Instant at) {
        if (revokedAt != null) throw new IllegalStateException("Grant already revoked");
        revokedAt = Objects.requireNonNull(at);
    }
    public UUID getUserId() { return userId; }
    public UUID getRoleId() { return roleId; }
    public UUID getGrantedBy() { return grantedBy; }
    public Instant getRevokedAt() { return revokedAt; }
}
