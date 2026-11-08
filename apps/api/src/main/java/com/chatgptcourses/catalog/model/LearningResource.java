package com.chatgptcourses.catalog.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "learning_resources")
public class LearningResource extends VersionedEntity {
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 16)
    private ResourceKind kind;
    @Column(name = "archived_at", columnDefinition = "timestamptz")
    private Instant archivedAt;
    protected LearningResource() { }
    public LearningResource(ResourceKind kind) { this.kind = Objects.requireNonNull(kind); }
    public void archive(Instant at) { archivedAt = Objects.requireNonNull(at); }
    public ResourceKind getKind() { return kind; }
    public Instant getArchivedAt() { return archivedAt; }
}
