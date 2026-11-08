package com.chatgptcourses.catalog.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "pedagogical_versions")
public class PedagogicalVersion extends VersionedEntity {
    @Column(name = "resource_id", nullable = false, updatable = false)
    private UUID resourceId;
    @Column(name = "version_number", nullable = false, updatable = false)
    private int versionNumber;
    @Column(nullable = false, columnDefinition = "text")
    private String objectives;
    @Column(name = "evaluation_definition", nullable = false, columnDefinition = "text")
    private String evaluationDefinition;
    @Column(name = "frozen_at", columnDefinition = "timestamptz")
    private Instant frozenAt;
    protected PedagogicalVersion() { }
    public PedagogicalVersion(UUID resourceId, int versionNumber, String objectives, String evaluationDefinition) {
        this.resourceId = Objects.requireNonNull(resourceId);
        this.versionNumber = versionNumber;
        reviseDraft(objectives, evaluationDefinition);
    }
    public void reviseDraft(String objectives, String evaluationDefinition) {
        if (frozenAt != null) throw new IllegalStateException("Frozen pedagogy requires a new version");
        this.objectives = Objects.requireNonNull(objectives);
        this.evaluationDefinition = Objects.requireNonNull(evaluationDefinition);
    }
    public void freeze(Instant at) {
        if (frozenAt != null) throw new IllegalStateException("Pedagogy already frozen");
        frozenAt = Objects.requireNonNull(at);
    }
    public UUID getResourceId() { return resourceId; }
    public int getVersionNumber() { return versionNumber; }
    public String getObjectives() { return objectives; }
    public String getEvaluationDefinition() { return evaluationDefinition; }
    public Instant getFrozenAt() { return frozenAt; }
}
