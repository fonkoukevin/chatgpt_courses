package com.chatgptcourses.editorial.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "content_translations")
public class ContentTranslation extends VersionedEntity {
    @Column(name = "pedagogical_version_id", nullable = false, updatable = false)
    private UUID pedagogicalVersionId;
    @Column(nullable = false, updatable = false, length = 2)
    private String locale;
    @Enumerated(EnumType.STRING)
    @Column(name = "editorial_state", nullable = false, length = 20)
    private EditorialState editorialState;
    @Column(name = "current_revision_id")
    private UUID currentRevisionId;
    @Column(name = "published_revision_id")
    private UUID publishedRevisionId;
    protected ContentTranslation() { }
    public ContentTranslation(UUID pedagogicalVersionId, String locale) {
        this.pedagogicalVersionId = Objects.requireNonNull(pedagogicalVersionId);
        this.locale = Objects.requireNonNull(locale);
        this.editorialState = EditorialState.DRAFT;
    }
    public void pointToDraft(EditorialRevision revision) {
        if (!getId().equals(revision.getTranslationId())) throw new IllegalArgumentException("Revision belongs to another translation");
        currentRevisionId = Objects.requireNonNull(revision.getId());
        editorialState = EditorialState.DRAFT;
    }
    public UUID getPedagogicalVersionId() { return pedagogicalVersionId; }
    public String getLocale() { return locale; }
    public EditorialState getEditorialState() { return editorialState; }
    public UUID getCurrentRevisionId() { return currentRevisionId; }
    public UUID getPublishedRevisionId() { return publishedRevisionId; }
}
