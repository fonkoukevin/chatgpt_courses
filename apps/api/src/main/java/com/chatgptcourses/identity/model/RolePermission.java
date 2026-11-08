package com.chatgptcourses.identity.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "role_permissions")
public class RolePermission extends VersionedEntity {
    @Column(name = "role_id", nullable = false, updatable = false)
    private UUID roleId;
    @Column(name = "permission_id", nullable = false, updatable = false)
    private UUID permissionId;
    @Column(name = "revoked_at", columnDefinition = "timestamptz")
    private Instant revokedAt;
    protected RolePermission() { }
    public RolePermission(UUID roleId, UUID permissionId) {
        this.roleId = Objects.requireNonNull(roleId);
        this.permissionId = Objects.requireNonNull(permissionId);
    }
    public void revoke(Instant at) {
        if (revokedAt != null) throw new IllegalStateException("Grant already revoked");
        revokedAt = Objects.requireNonNull(at);
    }
    public UUID getRoleId() { return roleId; }
    public UUID getPermissionId() { return permissionId; }
    public Instant getRevokedAt() { return revokedAt; }
}
