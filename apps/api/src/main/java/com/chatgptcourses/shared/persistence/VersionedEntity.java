package com.chatgptcourses.shared.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Version;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Persistence metadata only; an entity is never an HTTP request/response DTO. */
@MappedSuperclass
public abstract class VersionedEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Version
    @Min(0)
    @Max(9_007_199_254_740_991L)
    @Column(nullable = false)
    private Long revision;

    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
    private Instant updatedAt;

    @PrePersist
    protected void initializeTimestamps() {
        createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void updateTimestamp() {
        var now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = now.isBefore(createdAt) ? createdAt : now;
    }

    public UUID getId() { return id; }
    public Long getRevision() { return revision; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
