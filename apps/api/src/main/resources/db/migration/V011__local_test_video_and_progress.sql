-- Test-only provider metadata, opaque short-lived bearer grants and owner-specific viewing positions.
CREATE TABLE video_media (
 id UUID PRIMARY KEY,
 origin_resource_id UUID NOT NULL,
 origin_version_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 provider VARCHAR(16) NOT NULL DEFAULT 'LOCAL_TEST' CHECK(provider='LOCAL_TEST'),
 duration_seconds DOUBLE PRECISION NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=86400),
 size_bytes BIGINT NOT NULL CHECK(size_bytes>0 AND size_bytes<=134217728),
 sha256 VARCHAR(64) NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 transcript TEXT CHECK(transcript IS NULL OR length(transcript)<=8000),
 captions_vtt TEXT CHECK(captions_vtt IS NULL OR length(captions_vtt)<=8000),
 registered_by UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 FOREIGN KEY(origin_version_id,origin_resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(origin_version_id,locale) REFERENCES content_translations(pedagogical_version_id,locale) ON DELETE RESTRICT
);
CREATE TABLE video_playback_grants (
 id UUID PRIMARY KEY,
 media_id UUID NOT NULL REFERENCES video_media(id) ON DELETE RESTRICT,
 token_hash BYTEA NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
 owner_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),
 expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at) AND expires_at>created_at)
);
CREATE INDEX video_grants_expiry_idx ON video_playback_grants(expires_at);
CREATE TABLE media_progress (
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 media_id UUID NOT NULL REFERENCES video_media(id) ON DELETE RESTRICT,
 position_seconds DOUBLE PRECISION NOT NULL CHECK(position_seconds>=0 AND position_seconds<=86400),
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 updated_at TIMESTAMPTZ NOT NULL CHECK(isfinite(updated_at)),
 PRIMARY KEY(owner_id,media_id)
);
CREATE FUNCTION guard_video_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registered video metadata is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER video_metadata_immutable BEFORE UPDATE OR DELETE ON video_media FOR EACH ROW EXECUTE FUNCTION guard_video_metadata();
CREATE FUNCTION guard_media_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Media progress history requires explicit retention policy' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_id,NEW.media_id) IS DISTINCT FROM (OLD.owner_id,OLD.media_id) THEN RAISE EXCEPTION 'Media progress owner and media are immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM video_media m WHERE m.id=NEW.media_id AND NEW.position_seconds<=m.duration_seconds) THEN RAISE EXCEPTION 'Media position exceeds measured duration' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER media_position_bound BEFORE INSERT OR UPDATE OR DELETE ON media_progress FOR EACH ROW EXECUTE FUNCTION guard_media_position();
INSERT INTO permissions(id,code) VALUES('10200000-0000-0000-0000-000000000001','media.progress.read'),('10200000-0000-0000-0000-000000000002','media.progress.write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='LEARNER' AND p.code IN('media.progress.read','media.progress.write') AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id AND rp.revoked_at IS NULL) ON CONFLICT DO NOTHING;
