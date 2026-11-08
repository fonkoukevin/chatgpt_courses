package com.chatgptcourses.identity.model;

import com.chatgptcourses.shared.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.Objects;

@Entity
@Table(name = "roles")
public class Role extends VersionedEntity {
    @Column(nullable = false, unique = true, length = 64, updatable = false)
    private String code;
    protected Role() { }
    public Role(String code) { this.code = Objects.requireNonNull(code); }
    public String getCode() { return code; }
}
