package com.chatgptcourses.editorial.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

@Immutable
@Entity
@Table(name = "editorial_revisions")
public class EditorialRevision {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "translation_id", nullable = false, updatable = false)
    private UUID translationId;
    @Column(name = "revision_number", nullable = false, updatable = false)
    private int revisionNumber;
    @Column(nullable = false, updatable = false, length = 240)
    private String title;
    @Column(nullable = false, updatable = false, columnDefinition = "text")
    private String summary;
    @Column(nullable = false, updatable = false, columnDefinition = "text")
    private String body;
    @Column(name = "author_id", updatable = false)
    private UUID authorId;
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;
    protected EditorialRevision() { }
    public EditorialRevision(UUID translationId, int revisionNumber, String title, String summary, String body, UUID authorId) {
        this.translationId = Objects.requireNonNull(translationId);
        this.revisionNumber = revisionNumber;
        this.title = Objects.requireNonNull(title);
        this.summary = Objects.requireNonNull(summary);
        this.body = Objects.requireNonNull(body);
        this.authorId = authorId;
    }
    @PrePersist
    private void initializeTimestamp() { createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS); }
    public UUID getId() { return id; }
    public UUID getTranslationId() { return translationId; }
    public int getRevisionNumber() { return revisionNumber; }
    public String getTitle() { return title; }
    public String getSummary() { return summary; }
    public String getBody() { return body; }
    public UUID getAuthorId() { return authorId; }
    public Instant getCreatedAt() { return createdAt; }
}
