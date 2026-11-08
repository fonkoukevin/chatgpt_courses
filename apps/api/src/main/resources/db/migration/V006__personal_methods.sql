-- P07: private, independent user copies. No user, price, AI call or paid entitlement seeded.
ALTER TABLE content_translations ADD CONSTRAINT content_translations_id_version_locale_uq UNIQUE(id,pedagogical_version_id,locale);
CREATE TABLE personal_methods (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    title VARCHAR(240) NOT NULL CHECK(length(btrim(title))>0),
    locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
    body TEXT NOT NULL CHECK(length(btrim(body))>0 AND length(body)<=32000),
    parameters JSONB NOT NULL CHECK(jsonb_typeof(parameters)='object' AND octet_length(parameters::text)<=65536),
    generated_from JSONB CHECK(generated_from IS NULL OR (jsonb_typeof(generated_from)='object' AND octet_length(generated_from::text)<=65536)),
    notes TEXT NOT NULL CHECK(length(notes)<=8000),
    category VARCHAR(80) CHECK(category IS NULL OR length(btrim(category))>0),
    source_resource_id UUID,
    source_version_id UUID,
    source_translation_id UUID,
    source_revision_id UUID,
    source_locale VARCHAR(2),
    source_title VARCHAR(240),
    source_slug VARCHAR(180),
    revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT personal_methods_dates_ck CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at),
    CONSTRAINT personal_methods_origin_ck CHECK(
      (source_resource_id IS NULL AND source_version_id IS NULL AND source_translation_id IS NULL AND source_revision_id IS NULL AND source_locale IS NULL AND source_title IS NULL AND source_slug IS NULL)
      OR (source_resource_id IS NOT NULL AND source_version_id IS NOT NULL AND source_translation_id IS NOT NULL AND source_revision_id IS NOT NULL
        AND source_locale IS NOT NULL AND source_locale IN('fr','en') AND source_title IS NOT NULL AND length(btrim(source_title))>0
        AND source_slug IS NOT NULL AND source_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT personal_methods_source_version_fk FOREIGN KEY(source_version_id,source_resource_id)
      REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
    CONSTRAINT personal_methods_source_translation_fk FOREIGN KEY(source_translation_id,source_version_id,source_locale)
      REFERENCES content_translations(id,pedagogical_version_id,locale) ON DELETE RESTRICT,
    CONSTRAINT personal_methods_source_revision_fk FOREIGN KEY(source_revision_id,source_translation_id)
      REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT
);
CREATE INDEX personal_methods_owner_updated_idx ON personal_methods(owner_id,updated_at DESC,id);
CREATE INDEX personal_methods_source_idx ON personal_methods(source_resource_id);
CREATE FUNCTION guard_personal_method_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.created_at<>OLD.created_at
      OR NEW.source_resource_id IS DISTINCT FROM OLD.source_resource_id OR NEW.source_version_id IS DISTINCT FROM OLD.source_version_id
      OR NEW.source_translation_id IS DISTINCT FROM OLD.source_translation_id OR NEW.source_revision_id IS DISTINCT FROM OLD.source_revision_id
      OR NEW.source_locale IS DISTINCT FROM OLD.source_locale OR NEW.source_title IS DISTINCT FROM OLD.source_title OR NEW.source_slug IS DISTINCT FROM OLD.source_slug THEN
        RAISE EXCEPTION 'Personal method owner and source snapshot are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER personal_methods_origin BEFORE UPDATE ON personal_methods FOR EACH ROW EXECUTE FUNCTION guard_personal_method_origin();

INSERT INTO permissions(id,code) VALUES
 ('07000000-0000-0000-0000-000000000001','methods.read'),('07000000-0000-0000-0000-000000000002','methods.write')
 ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.code='LEARNER' AND p.code IN('methods.read','methods.write')
 AND NOT EXISTS(SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.revoked_at IS NULL)
 ON CONFLICT DO NOTHING;
COMMENT ON TABLE personal_methods IS 'Owner-controlled personal text, parameters and notes; immutable FK-backed source origin. Source withdrawal never overwrites or deletes the copy.';
