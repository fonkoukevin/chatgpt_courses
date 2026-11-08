-- P05 additive editorial workflow. Historical V001-V003 and snapshots stay intact.
ALTER TABLE learning_resources DROP CONSTRAINT learning_resources_kind_check;
ALTER TABLE learning_resources ADD CONSTRAINT learning_resources_kind_check CHECK (kind IN ('COURSE','MODULE','ACTIVITY','GUIDE','METHOD_TEMPLATE'));
ALTER TABLE learning_resources ADD COLUMN duplicated_from_id UUID REFERENCES learning_resources(id) ON DELETE RESTRICT;
ALTER TABLE pedagogical_versions ADD CONSTRAINT pedagogical_versions_id_resource_uq UNIQUE(id,resource_id);
ALTER TABLE pedagogical_versions ADD COLUMN replaces_version_id UUID;
ALTER TABLE pedagogical_versions ADD CONSTRAINT pedagogical_versions_replaces_fk FOREIGN KEY(replaces_version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT;
ALTER TABLE pedagogical_versions ADD CONSTRAINT pedagogical_versions_not_self_ck CHECK(replaces_version_id IS DISTINCT FROM id);
CREATE FUNCTION guard_editorial_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_TABLE_NAME='learning_resources' AND to_jsonb(NEW)->'duplicated_from_id' IS DISTINCT FROM to_jsonb(OLD)->'duplicated_from_id')
       OR (TG_TABLE_NAME='pedagogical_versions' AND to_jsonb(NEW)->'replaces_version_id' IS DISTINCT FROM to_jsonb(OLD)->'replaces_version_id') THEN
        RAISE EXCEPTION 'Editorial origin is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER learning_resources_origin BEFORE UPDATE ON learning_resources FOR EACH ROW EXECUTE FUNCTION guard_editorial_origin();
CREATE TRIGGER pedagogical_versions_origin BEFORE UPDATE ON pedagogical_versions FOR EACH ROW EXECUTE FUNCTION guard_editorial_origin();

ALTER TABLE editorial_revisions ADD COLUMN document_json JSONB;
ALTER TABLE editorial_revisions ADD COLUMN reason VARCHAR(1000) NOT NULL DEFAULT 'Historical P03 snapshot';
ALTER TABLE editorial_revisions ADD COLUMN replaces_revision_id UUID;
ALTER TABLE editorial_revisions ADD CONSTRAINT editorial_revisions_document_ck CHECK (document_json IS NULL OR (jsonb_typeof(document_json)='object' AND octet_length(document_json::text)<=65536));
ALTER TABLE editorial_revisions ADD CONSTRAINT editorial_revisions_reason_ck CHECK(length(btrim(reason))>0);
ALTER TABLE editorial_revisions ADD CONSTRAINT editorial_revisions_replaces_fk FOREIGN KEY(replaces_revision_id,translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT;
ALTER TABLE editorial_revisions ADD CONSTRAINT editorial_revisions_not_self_ck CHECK(replaces_revision_id IS DISTINCT FROM id);

ALTER TABLE content_translations ADD COLUMN source_translation_id UUID REFERENCES content_translations(id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD COLUMN source_revision_id UUID;
ALTER TABLE content_translations ADD COLUMN reviewed_source_revision_id UUID;
ALTER TABLE content_translations ADD COLUMN reviewed_revision_id UUID;
ALTER TABLE content_translations ADD COLUMN verified_at TIMESTAMPTZ;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_source_fk FOREIGN KEY(source_revision_id,source_translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_reviewed_source_fk FOREIGN KEY(reviewed_source_revision_id,source_translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_reviewed_fk FOREIGN KEY(reviewed_revision_id,id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_source_pair_ck CHECK ((source_translation_id IS NULL AND source_revision_id IS NULL AND reviewed_source_revision_id IS NULL) OR (source_translation_id IS NOT NULL AND source_revision_id IS NOT NULL AND source_translation_id<>id));
ALTER TABLE content_translations ADD CONSTRAINT content_translations_verified_ck CHECK (verified_at IS NULL OR (isfinite(verified_at) AND verified_at>=created_at));

CREATE FUNCTION guard_translation_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND (NEW.source_translation_id IS DISTINCT FROM OLD.source_translation_id OR NEW.source_revision_id IS DISTINCT FROM OLD.source_revision_id) THEN
        RAISE EXCEPTION 'Translation source origin is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.source_translation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_translations s WHERE s.id=NEW.source_translation_id AND s.pedagogical_version_id=NEW.pedagogical_version_id AND s.locale<>NEW.locale) THEN
        RAISE EXCEPTION 'Translations must share the pedagogical version and differ in locale' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER content_translations_source BEFORE INSERT OR UPDATE ON content_translations FOR EACH ROW EXECUTE FUNCTION guard_translation_source();

CREATE TABLE editorial_events (
    id UUID PRIMARY KEY,
    translation_id UUID NOT NULL REFERENCES content_translations(id) ON DELETE RESTRICT,
    revision_id UUID,
    actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    event_type VARCHAR(32) NOT NULL CHECK(event_type IN ('CREATE','REVISE','NEW_VERSION','DUPLICATE','TRANSLATE','TO_REVIEW','READY','PUBLISH','STALE','SOURCE_STALE','ARCHIVE','COMPOSITION')),
    reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(created_at)),
    CONSTRAINT editorial_events_revision_fk FOREIGN KEY(revision_id,translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT
);
CREATE INDEX editorial_events_translation_idx ON editorial_events(translation_id,created_at);
CREATE TRIGGER editorial_events_immutable BEFORE UPDATE OR DELETE ON editorial_events FOR EACH ROW EXECUTE FUNCTION reject_editorial_revision_mutation();

CREATE TABLE editorial_resource_references (
    revision_id UUID NOT NULL REFERENCES editorial_revisions(id) ON DELETE RESTRICT,
    resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE RESTRICT,
    PRIMARY KEY(revision_id,resource_id)
);
CREATE TRIGGER editorial_resource_references_immutable BEFORE UPDATE OR DELETE ON editorial_resource_references FOR EACH ROW EXECUTE FUNCTION reject_editorial_revision_mutation();

INSERT INTO roles(id,code) VALUES('05000000-0000-0000-0000-000000000001','EDITOR') ON CONFLICT(code) DO NOTHING;
INSERT INTO permissions(id,code) VALUES
 ('05000000-0000-0000-0000-000000000011','content.read'),('05000000-0000-0000-0000-000000000012','content.write'),
 ('05000000-0000-0000-0000-000000000013','content.review'),('05000000-0000-0000-0000-000000000014','content.publish'),
 ('05000000-0000-0000-0000-000000000015','content.archive') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.code='EDITOR' AND p.code IN('content.read','content.write','content.review','content.publish','content.archive')
 AND NOT EXISTS(SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.revoked_at IS NULL) ON CONFLICT DO NOTHING;
COMMENT ON COLUMN editorial_revisions.document_json IS 'Bounded plain-text structured document. NULL means legacy snapshot requiring explicit conversion before publication.';
COMMENT ON TABLE editorial_events IS 'Append-only actor, reason and exact revision; no destructive content deletion endpoint.';
