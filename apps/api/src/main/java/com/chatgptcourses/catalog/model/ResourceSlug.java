package com.chatgptcourses.catalog.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "resource_slugs")
public class ResourceSlug extends VersionedEntity {
    @Column(name = "resource_id", nullable = false, updatable = false)
    private UUID resourceId;
    @Enumerated(EnumType.STRING)
    @Column(name = "resource_kind", nullable = false, updatable = false, length = 16)
    private ResourceKind resourceKind;
    @Column(nullable = false, updatable = false, length = 2)
    private String locale;
    @Column(nullable = false, length = 180)
    private String slug;
    protected ResourceSlug() { }
    public ResourceSlug(LearningResource resource, String locale, String slug) {
        this.resourceId = Objects.requireNonNull(resource.getId());
        this.resourceKind = resource.getKind();
        this.locale = Objects.requireNonNull(locale);
        this.slug = Objects.requireNonNull(slug);
    }
    public void rename(String slug) { this.slug = Objects.requireNonNull(slug); }
    public UUID getResourceId() { return resourceId; }
    public ResourceKind getResourceKind() { return resourceKind; }
    public String getLocale() { return locale; }
    public String getSlug() { return slug; }
}
