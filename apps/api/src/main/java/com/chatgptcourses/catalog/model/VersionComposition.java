package com.chatgptcourses.catalog.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "version_compositions")
public class VersionComposition extends VersionedEntity {
    @Column(name = "parent_version_id", nullable = false, updatable = false)
    private UUID parentVersionId;
    @Column(name = "child_version_id", nullable = false, updatable = false)
    private UUID childVersionId;
    @Column(nullable = false)
    private int position;
    protected VersionComposition() { }
    public VersionComposition(UUID parentVersionId, UUID childVersionId, int position) {
        this.parentVersionId = Objects.requireNonNull(parentVersionId);
        this.childVersionId = Objects.requireNonNull(childVersionId);
        this.position = position;
    }
    /** PostgreSQL checks the parent's freeze under the same row lock as a concurrent freeze. */
    public void changePosition(int position) { this.position = position; }
    public UUID getParentVersionId() { return parentVersionId; }
    public UUID getChildVersionId() { return childVersionId; }
    public int getPosition() { return position; }
}
