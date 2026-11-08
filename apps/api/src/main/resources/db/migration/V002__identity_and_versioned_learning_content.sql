-- P03 : identité, catalogue stable et historique éditorial.
-- Aucune donnée de démonstration, offre commerciale, production ou droit d'accès.
-- Les FK sont RESTRICT : aucune suppression de parent ne cascade sur l'historique.

CREATE TABLE user_accounts (
    id UUID PRIMARY KEY,
    normalized_email VARCHAR(320),
    password_hash VARCHAR(255),
    display_name VARCHAR(120),
    status VARCHAR(20) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_accounts_email_uq UNIQUE (normalized_email),
    CONSTRAINT user_accounts_status_ck CHECK (status IN ('ACTIVE', 'DISABLED', 'ANONYMIZED')),
    CONSTRAINT user_accounts_email_ck CHECK (normalized_email IS NULL OR
        (normalized_email = lower(btrim(normalized_email)) AND position('@' IN normalized_email) > 1)),
    CONSTRAINT user_accounts_credentials_ck CHECK (
        (status = 'ANONYMIZED' AND normalized_email IS NULL AND password_hash IS NULL) OR
        (status <> 'ANONYMIZED' AND normalized_email IS NOT NULL AND password_hash IS NOT NULL AND length(password_hash) > 0)),
    CONSTRAINT user_accounts_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE user_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE RESTRICT,
    locale VARCHAR(2) NOT NULL CHECK (locale IN ('fr', 'en')),
    time_zone VARCHAR(100) NOT NULL CHECK (length(btrim(time_zone)) > 0),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_preferences_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roles_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_.:-]*$'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permissions_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    granted_by UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_roles_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at
        AND (revoked_at IS NULL OR (isfinite(revoked_at) AND revoked_at >= created_at)))
);
CREATE UNIQUE INDEX user_roles_active_uq ON user_roles(user_id, role_id) WHERE revoked_at IS NULL;
CREATE INDEX user_roles_role_idx ON user_roles(role_id);

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT role_permissions_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at
        AND (revoked_at IS NULL OR (isfinite(revoked_at) AND revoked_at >= created_at)))
);
CREATE UNIQUE INDEX role_permissions_active_uq ON role_permissions(role_id, permission_id) WHERE revoked_at IS NULL;
CREATE INDEX role_permissions_permission_idx ON role_permissions(permission_id);

CREATE TABLE learning_resources (
    id UUID PRIMARY KEY,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('COURSE', 'MODULE', 'ACTIVITY')),
    archived_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT learning_resources_id_kind_uq UNIQUE (id, kind),
    CONSTRAINT learning_resources_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at
        AND (archived_at IS NULL OR (isfinite(archived_at) AND archived_at >= created_at)))
);

CREATE TABLE pedagogical_versions (
    id UUID PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    objectives TEXT NOT NULL CHECK (length(btrim(objectives)) > 0),
    evaluation_definition TEXT NOT NULL CHECK (length(btrim(evaluation_definition)) > 0),
    frozen_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pedagogical_versions_number_uq UNIQUE (resource_id, version_number),
    CONSTRAINT pedagogical_versions_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at
        AND (frozen_at IS NULL OR (isfinite(frozen_at) AND frozen_at >= created_at)))
);

CREATE TABLE version_compositions (
    id UUID PRIMARY KEY,
    parent_version_id UUID NOT NULL REFERENCES pedagogical_versions(id) ON DELETE RESTRICT,
    child_version_id UUID NOT NULL REFERENCES pedagogical_versions(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position > 0),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT version_compositions_child_uq UNIQUE (parent_version_id, child_version_id),
    CONSTRAINT version_compositions_position_uq UNIQUE (parent_version_id, position),
    CONSTRAINT version_compositions_not_self_ck CHECK (parent_version_id <> child_version_id),
    CONSTRAINT version_compositions_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);
CREATE INDEX version_compositions_child_idx ON version_compositions(child_version_id);

-- Un slug résout l'identité stable, jamais le numéro d'une version pédagogique.
CREATE TABLE resource_slugs (
    id UUID PRIMARY KEY,
    resource_id UUID NOT NULL,
    resource_kind VARCHAR(16) NOT NULL,
    locale VARCHAR(2) NOT NULL CHECK (locale IN ('fr', 'en')),
    slug VARCHAR(180) NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT resource_slugs_resource_fk FOREIGN KEY (resource_id, resource_kind)
        REFERENCES learning_resources(id, kind) ON DELETE RESTRICT,
    CONSTRAINT resource_slugs_resource_locale_uq UNIQUE (resource_id, locale),
    CONSTRAINT resource_slugs_namespace_uq UNIQUE (resource_kind, locale, slug),
    CONSTRAINT resource_slugs_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE content_translations (
    id UUID PRIMARY KEY,
    pedagogical_version_id UUID NOT NULL REFERENCES pedagogical_versions(id) ON DELETE RESTRICT,
    locale VARCHAR(2) NOT NULL CHECK (locale IN ('fr', 'en')),
    editorial_state VARCHAR(20) NOT NULL CHECK (editorial_state IN ('DRAFT', 'TO_REVIEW', 'READY', 'PUBLISHED', 'STALE', 'ARCHIVED')),
    current_revision_id UUID,
    published_revision_id UUID,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT content_translations_locale_uq UNIQUE (pedagogical_version_id, locale),
    CONSTRAINT content_translations_published_ck CHECK (editorial_state <> 'PUBLISHED' OR published_revision_id IS NOT NULL),
    CONSTRAINT content_translations_dates_ck CHECK (isfinite(created_at) AND isfinite(updated_at) AND updated_at >= created_at)
);

CREATE TABLE editorial_revisions (
    id UUID PRIMARY KEY,
    translation_id UUID NOT NULL REFERENCES content_translations(id) ON DELETE RESTRICT,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    title VARCHAR(240) NOT NULL CHECK (length(btrim(title)) > 0),
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    author_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(created_at)),
    CONSTRAINT editorial_revisions_number_uq UNIQUE (translation_id, revision_number),
    CONSTRAINT editorial_revisions_id_translation_uq UNIQUE (id, translation_id)
);

-- La révision courante/publiée appartient obligatoirement à cette traduction.
ALTER TABLE content_translations ADD CONSTRAINT content_translations_current_fk
    FOREIGN KEY (current_revision_id, id) REFERENCES editorial_revisions(id, translation_id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_published_fk
    FOREIGN KEY (published_revision_id, id) REFERENCES editorial_revisions(id, translation_id) ON DELETE RESTRICT;

CREATE FUNCTION reject_editorial_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Editorial revisions are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER editorial_revisions_immutable BEFORE UPDATE OR DELETE ON editorial_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_editorial_revision_mutation();

CREATE FUNCTION guard_permission_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Revoke permission grants without deleting their history' USING ERRCODE = '23514';
    END IF;
    IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at
        OR NEW.role_id <> OLD.role_id
        OR (TG_TABLE_NAME = 'user_roles' AND
            (to_jsonb(NEW)->'user_id' IS DISTINCT FROM to_jsonb(OLD)->'user_id'
             OR to_jsonb(NEW)->'granted_by' IS DISTINCT FROM to_jsonb(OLD)->'granted_by'))
        OR (TG_TABLE_NAME = 'role_permissions' AND
            to_jsonb(NEW)->'permission_id' IS DISTINCT FROM to_jsonb(OLD)->'permission_id')
        OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
        RAISE EXCEPTION 'Permission grant origin and revocation are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER user_roles_history BEFORE UPDATE OR DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION guard_permission_grant();
CREATE TRIGGER role_permissions_history BEFORE UPDATE OR DELETE ON role_permissions
    FOR EACH ROW EXECUTE FUNCTION guard_permission_grant();

CREATE FUNCTION guard_resource_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.kind <> OLD.kind OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Learning resource identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER learning_resources_identity BEFORE UPDATE ON learning_resources
    FOR EACH ROW EXECUTE FUNCTION guard_resource_identity();

CREATE FUNCTION guard_translation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.pedagogical_version_id <> OLD.pedagogical_version_id
        OR NEW.locale <> OLD.locale OR NEW.created_at <> OLD.created_at) THEN
        RAISE EXCEPTION 'Translation identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pedagogical_versions WHERE id = NEW.pedagogical_version_id AND frozen_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'A publication must reference frozen pedagogy' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER content_translations_identity BEFORE INSERT OR UPDATE ON content_translations
    FOR EACH ROW EXECUTE FUNCTION guard_translation_identity();

CREATE FUNCTION guard_pedagogical_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.frozen_at IS NOT NULL THEN
        RAISE EXCEPTION 'Frozen pedagogical versions are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.id <> OLD.id OR NEW.resource_id <> OLD.resource_id OR NEW.version_number <> OLD.version_number
        OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Pedagogical version identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.frozen_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM version_compositions c JOIN pedagogical_versions child ON child.id = c.child_version_id
        WHERE c.parent_version_id = OLD.id AND child.frozen_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Freeze child versions before their parent' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER pedagogical_versions_freeze BEFORE UPDATE OR DELETE ON pedagogical_versions
    FOR EACH ROW EXECUTE FUNCTION guard_pedagogical_version();

CREATE FUNCTION guard_version_composition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_id UUID;
    parent_frozen TIMESTAMPTZ;
    parent_kind VARCHAR(16);
    child_kind VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN parent_id := OLD.parent_version_id; ELSE parent_id := NEW.parent_version_id; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.parent_version_id <> OLD.parent_version_id OR NEW.child_version_id <> OLD.child_version_id
        OR NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at) THEN
        RAISE EXCEPTION 'Composition identity is immutable' USING ERRCODE = '23514';
    END IF;
    -- Même verrou de ligne que le gel : un ajout concurrent ne peut passer après frozen_at.
    SELECT v.frozen_at, r.kind INTO parent_frozen, parent_kind
        FROM pedagogical_versions v JOIN learning_resources r ON r.id = v.resource_id
        WHERE v.id = parent_id FOR UPDATE OF v;
    IF parent_frozen IS NOT NULL THEN
        RAISE EXCEPTION 'Frozen version compositions are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT r.kind INTO child_kind FROM pedagogical_versions v JOIN learning_resources r ON r.id = v.resource_id
        WHERE v.id = NEW.child_version_id;
    IF parent_kind IS NOT NULL AND child_kind IS NOT NULL AND NOT (
        (parent_kind = 'COURSE' AND child_kind = 'MODULE') OR (parent_kind = 'MODULE' AND child_kind = 'ACTIVITY')
    ) THEN
        RAISE EXCEPTION 'Composition must link COURSE to MODULE or MODULE to ACTIVITY' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER version_compositions_guard BEFORE INSERT OR UPDATE OR DELETE ON version_compositions
    FOR EACH ROW EXECUTE FUNCTION guard_version_composition();

COMMENT ON TABLE learning_resources IS 'Stable UUID identity for courses, modules and activities; GUIDEs/templates are future migrations.';
COMMENT ON TABLE pedagogical_versions IS 'Pedagogical objectives and assessment requirements. Freeze after construction; a new objective needs a new version UUID.';
COMMENT ON TABLE editorial_revisions IS 'Append-only translated content snapshots. Minor editorial corrections append a row under the same pedagogical version.';
COMMENT ON TABLE resource_slugs IS 'Canonical localized slug for stable resource identity; unique within resource kind and locale, independent of versions.';
COMMENT ON TABLE content_translations IS 'One translation per pedagogical version and locale, with revision pointers constrained to that same translation.';
