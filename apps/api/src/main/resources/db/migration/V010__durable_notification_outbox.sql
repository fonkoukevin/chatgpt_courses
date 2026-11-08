-- Sensitive recipient and content are authenticated ciphertext. Minimal tombstones preserve deduplication.
CREATE TABLE notification_outbox (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 business_key VARCHAR(200) NOT NULL UNIQUE,
 event_type VARCHAR(32) NOT NULL CHECK(event_type IN('ACCOUNT_CREATED','PASSWORD_RESET','ACCESS_ACTIVATED','SUPPORT_REPLY')),
 payload_fingerprint BYTEA NOT NULL CHECK(octet_length(payload_fingerprint)=32),
 payload_ciphertext BYTEA CHECK(payload_ciphertext IS NULL OR octet_length(payload_ciphertext) BETWEEN 28 AND 32768),
 status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','PROCESSING','RETRY','SENT','DEAD','INDETERMINATE')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 cycle_attempts INTEGER NOT NULL DEFAULT 0 CHECK(cycle_attempts>=0),
 requeue_count INTEGER NOT NULL DEFAULT 0 CHECK(requeue_count>=0),
 next_attempt_at TIMESTAMPTZ DEFAULT clock_timestamp(),
 lease_id UUID,
 lease_until TIMESTAMPTZ,
 last_error_code VARCHAR(40) CHECK(last_error_code IS NULL OR last_error_code IN('SMTP_CONNECT','SMTP_AUTH','SMTP_UNCERTAIN','SMTP_INVALID','PAYLOAD_EXPIRED','PAYLOAD_INVALID','LEASE_EXPIRED','DELIVERY_UNCERTAIN')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL,
 sent_at TIMESTAMPTZ,
 purged_at TIMESTAMPTZ,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND isfinite(expires_at) AND updated_at>=created_at AND expires_at>created_at),
 CHECK((status='PROCESSING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND next_attempt_at IS NULL)
    OR(status IN('PENDING','RETRY') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NOT NULL)
    OR(status IN('SENT','DEAD','INDETERMINATE') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NULL)),
 CHECK((payload_ciphertext IS NULL)=(purged_at IS NOT NULL)),
 CHECK((status='SENT')=(sent_at IS NOT NULL)),
 CHECK(status<>'SENT' OR payload_ciphertext IS NULL),
 CHECK(status NOT IN('PENDING','RETRY','PROCESSING') OR payload_ciphertext IS NOT NULL),
 CHECK(next_attempt_at IS NULL OR isfinite(next_attempt_at)),
 CHECK(lease_until IS NULL OR isfinite(lease_until)),
 CHECK(sent_at IS NULL OR isfinite(sent_at)),
 CHECK(purged_at IS NULL OR isfinite(purged_at))
);
CREATE INDEX notification_outbox_due_idx ON notification_outbox(next_attempt_at,created_at,id) WHERE status IN('PENDING','RETRY');
CREATE INDEX notification_outbox_status_idx ON notification_outbox(status,created_at DESC,id);
CREATE TABLE notification_outbox_requeues (
 id UUID PRIMARY KEY,
 notification_id UUID NOT NULL REFERENCES notification_outbox(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 previous_status VARCHAR(24) NOT NULL CHECK(previous_status IN('RETRY','DEAD','INDETERMINATE')),
 reason VARCHAR(32) NOT NULL CHECK(reason IN('CONFIGURATION_FIXED','MANUAL_RECONCILIATION')),
 duplicate_acknowledged BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 CHECK(previous_status<>'INDETERMINATE' OR duplicate_acknowledged)
);
CREATE FUNCTION guard_notification_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['payload_ciphertext','status','attempts','cycle_attempts','requeue_count','next_attempt_at','lease_id','lease_until','last_error_code','updated_at','sent_at','purged_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payload_ciphertext','status','attempts','cycle_attempts','requeue_count','next_attempt_at','lease_id','lease_until','last_error_code','updated_at','sent_at','purged_at']) THEN
   RAISE EXCEPTION 'Notification origin is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.payload_ciphertext IS NULL AND NEW.payload_ciphertext IS NOT NULL THEN RAISE EXCEPTION 'Purged payload cannot be restored' USING ERRCODE='23514'; END IF;
 IF NEW.payload_ciphertext IS NOT NULL AND NEW.payload_ciphertext IS DISTINCT FROM OLD.payload_ciphertext THEN RAISE EXCEPTION 'Notification ciphertext is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER notification_outbox_identity BEFORE UPDATE OR DELETE ON notification_outbox FOR EACH ROW EXECUTE FUNCTION guard_notification_identity();
CREATE FUNCTION guard_notification_requeues() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Notification operation history is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER notification_requeues_immutable BEFORE UPDATE OR DELETE ON notification_outbox_requeues FOR EACH ROW EXECUTE FUNCTION guard_notification_requeues();
INSERT INTO permissions(id,code) VALUES
 ('10100000-0000-0000-0000-000000000001','notifications.read'),('10100000-0000-0000-0000-000000000002','notifications.manage')
 ON CONFLICT(code) DO NOTHING;
COMMENT ON TABLE notification_outbox IS 'Durable mail queue; authenticated ciphertext purged after delivery or expiry. SMTP delivery is not exactly once.';
