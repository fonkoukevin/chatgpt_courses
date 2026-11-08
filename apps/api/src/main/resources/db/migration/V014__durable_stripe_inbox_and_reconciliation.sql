-- Verified event metadata only. Raw Stripe payloads, customer data and signatures are not retained.
CREATE TABLE stripe_event_inbox (
 id UUID PRIMARY KEY,
 provider VARCHAR(12) NOT NULL DEFAULT 'STRIPE' CHECK(provider='STRIPE'),
 account_id VARCHAR(128) NOT NULL,livemode BOOLEAN NOT NULL,
 event_id VARCHAR(255) NOT NULL,event_type VARCHAR(100) NOT NULL,object_id VARCHAR(255) NOT NULL,
 api_version VARCHAR(100) NOT NULL,event_created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(event_created_at)),
 canonical_hash BYTEA NOT NULL CHECK(octet_length(canonical_hash)=32),
 order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,operation_id UUID,
 state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','PROCESSING','RETRY','PROCESSED','IGNORED','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),total_claims BIGINT NOT NULL DEFAULT 0 CHECK(total_claims>=0),
 next_attempt_at TIMESTAMPTZ DEFAULT clock_timestamp(),lease_id UUID,lease_until TIMESTAMPTZ,
 last_error_code VARCHAR(64) CHECK(last_error_code IS NULL OR last_error_code~'^[A-Z][A-Z0-9_]{0,63}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),processed_at TIMESTAMPTZ,
 UNIQUE(provider,account_id,livemode,event_id),
 FOREIGN KEY(operation_id,order_id) REFERENCES checkout_operations(id,order_id) ON DELETE RESTRICT,
 CHECK((order_id IS NULL)=(operation_id IS NULL)),
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at AND(next_attempt_at IS NULL OR isfinite(next_attempt_at)) AND(lease_until IS NULL OR isfinite(lease_until)) AND(processed_at IS NULL OR isfinite(processed_at))),
 CHECK((state='PROCESSING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND next_attempt_at IS NULL)
    OR(state IN('PENDING','RETRY') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NOT NULL)
    OR(state IN('PROCESSED','IGNORED','DEAD') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NULL)),
 CHECK((state IN('PROCESSED','IGNORED'))=(processed_at IS NOT NULL))
);
CREATE INDEX stripe_inbox_due_idx ON stripe_event_inbox(next_attempt_at,created_at,id) WHERE state IN('PENDING','RETRY');

-- This is a reconciliation task for an actual persisted Checkout operation, never a synthetic Stripe event.
CREATE TABLE payment_reconciliation_jobs (
 id UUID PRIMARY KEY,operation_id UUID NOT NULL UNIQUE,order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','PROCESSING','RETRY','WAITING','PROCESSED','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),total_claims BIGINT NOT NULL DEFAULT 0 CHECK(total_claims>=0),
 next_attempt_at TIMESTAMPTZ DEFAULT clock_timestamp(),lease_id UUID,lease_until TIMESTAMPTZ,
 last_error_code VARCHAR(64) CHECK(last_error_code IS NULL OR last_error_code~'^[A-Z][A-Z0-9_]{0,63}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),processed_at TIMESTAMPTZ,
 FOREIGN KEY(operation_id,order_id) REFERENCES checkout_operations(id,order_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at AND(next_attempt_at IS NULL OR isfinite(next_attempt_at)) AND(lease_until IS NULL OR isfinite(lease_until)) AND(processed_at IS NULL OR isfinite(processed_at))),
 CHECK((state='PROCESSING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND next_attempt_at IS NULL)
    OR(state IN('PENDING','RETRY','WAITING') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NOT NULL)
    OR(state IN('PROCESSED','DEAD') AND lease_id IS NULL AND lease_until IS NULL AND next_attempt_at IS NULL)),
 CHECK((state='PROCESSED')=(processed_at IS NOT NULL))
);
CREATE INDEX payment_jobs_due_idx ON payment_reconciliation_jobs(next_attempt_at,created_at,id) WHERE state IN('PENDING','RETRY','WAITING');

CREATE TABLE payment_work_retries (
 id UUID PRIMARY KEY,inbox_id UUID REFERENCES stripe_event_inbox(id) ON DELETE RESTRICT,
 reconciliation_id UUID REFERENCES payment_reconciliation_jobs(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 reason VARCHAR(32) NOT NULL CHECK(reason IN('PROVIDER_RECOVERED','MANUAL_RECONCILIATION')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 CHECK((inbox_id IS NULL)<>(reconciliation_id IS NULL))
);
CREATE FUNCTION guard_payment_inbox_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment event history is immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['order_id','operation_id','state','attempts','total_claims','next_attempt_at','lease_id','lease_until','last_error_code','updated_at','processed_at'])
    IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['order_id','operation_id','state','attempts','total_claims','next_attempt_at','lease_id','lease_until','last_error_code','updated_at','processed_at'])
    OR(OLD.operation_id IS NOT NULL AND(NEW.operation_id,NEW.order_id) IS DISTINCT FROM(OLD.operation_id,OLD.order_id)) THEN
    RAISE EXCEPTION 'Verified payment event origin is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER stripe_inbox_identity BEFORE UPDATE OR DELETE ON stripe_event_inbox FOR EACH ROW EXECUTE FUNCTION guard_payment_inbox_identity();
CREATE FUNCTION guard_payment_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR(NEW.id,NEW.operation_id,NEW.order_id,NEW.created_at) IS DISTINCT FROM(OLD.id,OLD.operation_id,OLD.order_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Payment reconciliation origin is immutable' USING ERRCODE='23514'; END IF;RETURN NEW; END; $$;
CREATE TRIGGER payment_job_identity BEFORE UPDATE OR DELETE ON payment_reconciliation_jobs FOR EACH ROW EXECUTE FUNCTION guard_payment_job_identity();
CREATE TRIGGER payment_retries_immutable BEFORE UPDATE OR DELETE ON payment_work_retries FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();

INSERT INTO roles(id,code) VALUES('12200000-0000-0000-0000-000000000001','PAYMENTS_OPERATOR') ON CONFLICT(code) DO NOTHING;
INSERT INTO permissions(id,code) VALUES('12200000-0000-0000-0000-000000000011','payments.events.read'),('12200000-0000-0000-0000-000000000012','payments.events.retry') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.code='PAYMENTS_OPERATOR' AND p.code IN('payments.events.read','payments.events.retry')
 AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id AND rp.revoked_at IS NULL);
