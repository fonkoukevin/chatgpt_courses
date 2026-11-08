-- Registry only: object keys, validation state and ownership are server-controlled.
CREATE TABLE assets (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 scope VARCHAR(16) NOT NULL CHECK(scope IN('PROJECT_FILE','EDITORIAL')),
 kind VARCHAR(8) NOT NULL CHECK(kind IN('FILE','IMAGE')),
 project_id UUID,
 origin_resource_id UUID,
 origin_version_id UUID,
 locale VARCHAR(2) CHECK(locale IN('fr','en')),
 bucket_name VARCHAR(63) NOT NULL,
 staging_key VARCHAR(200) NOT NULL UNIQUE CHECK(staging_key ~ '^staging/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
 ready_key VARCHAR(200) NOT NULL UNIQUE CHECK(ready_key ~ '^ready/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
 filename VARCHAR(180) NOT NULL CHECK(length(btrim(filename))>0 AND position('/' in filename)=0 AND position(chr(92) in filename)=0 AND filename !~ '[[:cntrl:]]'),
 declared_content_type VARCHAR(80) NOT NULL CHECK(declared_content_type IN('text/plain','application/pdf','image/png','image/jpeg')),
 declared_size BIGINT NOT NULL CHECK(declared_size BETWEEN 1 AND 20971520),
 verified_content_type VARCHAR(80),
 verified_size BIGINT CHECK(verified_size BETWEEN 1 AND 20971520),
 content_sha256 BYTEA CHECK(octet_length(content_sha256)=32),
 state VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','READY','REJECTED','EXPIRED')),
 rejection_code VARCHAR(48),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ready_at TIMESTAMPTZ,
 staging_cleanup_claim_token UUID,
 staging_cleanup_claim_until TIMESTAMPTZ,
 staging_cleaned_at TIMESTAMPTZ,
 FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(origin_version_id,origin_resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 CHECK((scope='PROJECT_FILE' AND project_id IS NOT NULL AND origin_resource_id IS NULL AND origin_version_id IS NULL AND locale IS NULL AND kind='FILE')
    OR(scope='EDITORIAL' AND project_id IS NULL AND origin_resource_id IS NOT NULL AND origin_version_id IS NOT NULL AND locale IS NOT NULL)),
 CHECK((kind='FILE' AND declared_content_type IN('text/plain','application/pdf')) OR(kind='IMAGE' AND declared_content_type IN('image/png','image/jpeg'))),
 CHECK(isfinite(created_at) AND isfinite(expires_at) AND expires_at>created_at AND (ready_at IS NULL OR(isfinite(ready_at) AND ready_at>=created_at))),
 CHECK((state='READY' AND ready_at IS NOT NULL AND verified_content_type IS NOT NULL AND verified_size IS NOT NULL AND content_sha256 IS NOT NULL AND rejection_code IS NULL)
    OR(state<>'READY' AND ready_at IS NULL AND verified_content_type IS NULL AND verified_size IS NULL AND content_sha256 IS NULL)),
 CHECK((state='REJECTED')=(rejection_code IS NOT NULL)),
 CHECK(verified_content_type IS NULL OR verified_content_type=declared_content_type),
 CHECK((staging_cleanup_claim_token IS NULL)=(staging_cleanup_claim_until IS NULL)),
 CHECK(staging_cleanup_claim_until IS NULL OR(isfinite(staging_cleanup_claim_until) AND staging_cleanup_claim_until>expires_at)),
 CHECK(staging_cleaned_at IS NULL OR(isfinite(staging_cleaned_at) AND staging_cleaned_at>=expires_at AND staging_cleanup_claim_token IS NULL))
);
CREATE INDEX assets_project_idx ON assets(project_id,created_at DESC,id);
CREATE INDEX assets_owner_pending_idx ON assets(owner_id,expires_at) WHERE state='PENDING';
CREATE INDEX assets_origin_idx ON assets(origin_version_id,locale);
CREATE FUNCTION guard_asset_registry() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Asset history is immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'staging_cleanup_claim_token'-'staging_cleanup_claim_until'-'staging_cleaned_at')
    IS NOT DISTINCT FROM (to_jsonb(OLD)-'staging_cleanup_claim_token'-'staging_cleanup_claim_until'-'staging_cleaned_at') THEN
    IF OLD.staging_cleaned_at IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Staging cleanup is already recorded' USING ERRCODE='23514'; END IF;
    RETURN NEW;
 END IF;
 IF OLD.state<>'PENDING' THEN RAISE EXCEPTION 'Asset history is immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'state'-'verified_content_type'-'verified_size'-'content_sha256'-'rejection_code'-'ready_at'-'revision')
    IS DISTINCT FROM (to_jsonb(OLD)-'state'-'verified_content_type'-'verified_size'-'content_sha256'-'rejection_code'-'ready_at'-'revision') THEN
    RAISE EXCEPTION 'Asset identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.state='PENDING' OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid asset transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assets_history BEFORE UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION guard_asset_registry();
INSERT INTO permissions(id,code) VALUES
 ('10000000-0000-0000-0000-000000000001','assets.read'),('10000000-0000-0000-0000-000000000002','assets.write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='LEARNER' AND p.code IN('assets.read','assets.write')
 AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id AND rp.revoked_at IS NULL);
COMMENT ON TABLE assets IS 'Immutable validated object registry. FORMAT_VERIFIED means bounded format validation, not an antivirus verdict. Staging PUT URLs never address READY objects.';
