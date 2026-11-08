ALTER TABLE user_accounts ADD COLUMN authentication_version BIGINT NOT NULL DEFAULT 0
    CHECK (authentication_version BETWEEN 0 AND 9007199254740991);

CREATE FUNCTION guard_account_authentication_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.authentication_version < OLD.authentication_version THEN
        RAISE EXCEPTION 'Authentication version cannot decrease' USING ERRCODE = '23514';
    END IF;
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.authentication_version := greatest(NEW.authentication_version, OLD.authentication_version + 1);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER user_accounts_authentication_version BEFORE UPDATE ON user_accounts
    FOR EACH ROW EXECUTE FUNCTION guard_account_authentication_version();

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    authentication_version BIGINT NOT NULL CHECK (authentication_version BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT password_reset_dates_ck CHECK (isfinite(created_at) AND isfinite(expires_at) AND expires_at > created_at
        AND (consumed_at IS NULL OR (isfinite(consumed_at) AND consumed_at >= created_at)))
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id);
CREATE INDEX password_reset_expiry_idx ON password_reset_tokens(expires_at);

CREATE TABLE identity_rate_limits (
    bucket_key CHAR(64) PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
    window_started_at TIMESTAMPTZ NOT NULL CHECK (isfinite(window_started_at)),
    request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 1000000)
);
CREATE INDEX identity_rate_limit_window_idx ON identity_rate_limits(window_started_at);

-- P03 allowed accounts without preferences; create only missing technical defaults.
INSERT INTO user_preferences(id, user_id, locale, time_zone)
    SELECT gen_random_uuid(), account.id, 'fr', 'UTC' FROM user_accounts account
    WHERE account.status <> 'ANONYMIZED'
      AND NOT EXISTS (SELECT 1 FROM user_preferences preference WHERE preference.user_id = account.id)
    ON CONFLICT (user_id) DO NOTHING;

-- Reference permissions only: never a known login or administrator account.
INSERT INTO roles(id, code) VALUES ('04000000-0000-4000-8000-000000000001', 'LEARNER')
    ON CONFLICT (code) DO NOTHING;
INSERT INTO permissions(id, code) VALUES ('04000000-0000-4000-8000-000000000002', 'identity.preferences.write')
    ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions(id, role_id, permission_id)
    SELECT '04000000-0000-4000-8000-000000000003', r.id, p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code = 'LEARNER' AND p.code = 'identity.preferences.write'
      AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.revoked_at IS NULL)
    ON CONFLICT (role_id, permission_id) WHERE revoked_at IS NULL DO NOTHING;

COMMENT ON TABLE password_reset_tokens IS 'Only SHA-256 digests of 32-byte random tokens; consumption and account epoch change occur in one transaction.';
COMMENT ON TABLE identity_rate_limits IS 'Atomic fixed-window counters keyed by SHA-256, with no raw email/IP. Operational cleanup is separate from request authorization.';
