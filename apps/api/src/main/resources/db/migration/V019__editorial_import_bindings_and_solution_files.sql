-- P18: explicit local/test imports only. No content, account, review, publication or offer is seeded.
ALTER TABLE assets ADD COLUMN content_role VARCHAR(8) NOT NULL DEFAULT 'RESOURCE'
 CHECK(content_role IN('RESOURCE','SOLUTION'));
ALTER TABLE assets ADD CONSTRAINT assets_solution_role_ck CHECK(content_role<>'SOLUTION' OR(scope='EDITORIAL' AND kind='FILE'));

CREATE TABLE editorial_import_resources(
 namespace VARCHAR(100) NOT NULL CHECK(namespace~'^[a-z0-9][a-z0-9._-]{0,99}$'),
 logical_key VARCHAR(100) NOT NULL CHECK(logical_key~'^[a-z0-9][a-z0-9._/-]{0,99}$'),
 resource_id UUID NOT NULL UNIQUE REFERENCES learning_resources(id) ON DELETE RESTRICT,
 version_id UUID NOT NULL UNIQUE,kind VARCHAR(20) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 PRIMARY KEY(namespace,logical_key),
 FOREIGN KEY(version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(resource_id,kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT
);
CREATE TABLE editorial_import_translations(
 namespace VARCHAR(100) NOT NULL,logical_key VARCHAR(100) NOT NULL,locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 translation_id UUID NOT NULL UNIQUE REFERENCES content_translations(id) ON DELETE RESTRICT,
 last_revision_id UUID NOT NULL,source_sha256 BYTEA NOT NULL CHECK(octet_length(source_sha256)=32),
 applied_sha256 BYTEA NOT NULL CHECK(octet_length(applied_sha256)=32),complete BOOLEAN NOT NULL DEFAULT false,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(namespace,logical_key,locale),
 FOREIGN KEY(namespace,logical_key) REFERENCES editorial_import_resources(namespace,logical_key) ON DELETE RESTRICT,
 FOREIGN KEY(last_revision_id,translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE TABLE editorial_import_files(
 id UUID PRIMARY KEY,namespace VARCHAR(100) NOT NULL CHECK(namespace~'^[a-z0-9][a-z0-9._-]{0,99}$'),logical_key VARCHAR(100) NOT NULL CHECK(logical_key~'^[a-z0-9][a-z0-9._/-]{0,99}$'),
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),purpose VARCHAR(8) NOT NULL CHECK(purpose IN('RESOURCE','SOLUTION')),
 source_sha256 BYTEA NOT NULL CHECK(octet_length(source_sha256)=32),asset_id UUID NOT NULL UNIQUE REFERENCES assets(id) ON DELETE RESTRICT,
 attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 1000000),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 UNIQUE(namespace,logical_key,locale,source_sha256,attempt)
);
CREATE TRIGGER editorial_import_resources_immutable BEFORE UPDATE OR DELETE ON editorial_import_resources FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER editorial_import_files_immutable BEFORE UPDATE OR DELETE ON editorial_import_files FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE FUNCTION guard_editorial_import_translation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Import binding history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND((to_jsonb(NEW)-ARRAY['source_sha256','applied_sha256','last_revision_id','complete','revision','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['source_sha256','applied_sha256','last_revision_id','complete','revision','updated_at']) OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at) THEN RAISE EXCEPTION 'Import origin is immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM editorial_import_resources r JOIN content_translations t ON t.pedagogical_version_id=r.version_id WHERE r.namespace=NEW.namespace AND r.logical_key=NEW.logical_key AND t.id=NEW.translation_id AND t.locale=NEW.locale) THEN RAISE EXCEPTION 'Import translation must match its identity/version/language' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER editorial_import_translations_guard BEFORE INSERT OR UPDATE OR DELETE ON editorial_import_translations FOR EACH ROW EXECUTE FUNCTION guard_editorial_import_translation();
