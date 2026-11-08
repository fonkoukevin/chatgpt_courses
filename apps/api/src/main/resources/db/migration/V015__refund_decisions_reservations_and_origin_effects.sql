-- No commercial/legal policy or automatic financial action is installed.
ALTER TABLE orders ADD COLUMN refund_confirmed_minor BIGINT NOT NULL DEFAULT 0 CHECK(refund_confirmed_minor BETWEEN 0 AND total_amount),
 ADD COLUMN refund_review_required BOOLEAN NOT NULL DEFAULT false,ADD COLUMN refund_full BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN refund_reconciled_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION guard_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['order_status','payment_status','fulfillment_status','active_intention_key','revision','payment_operation_id','paid_at','payment_refunded','refund_confirmed_minor','refund_review_required','refund_full','refund_reconciled_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['order_status','payment_status','fulfillment_status','active_intention_key','revision','payment_operation_id','paid_at','payment_refunded','refund_confirmed_minor','refund_review_required','refund_full','refund_reconciled_at'])
 OR NEW.revision<>OLD.revision+1 OR(OLD.payment_operation_id IS NOT NULL AND NEW.payment_operation_id IS DISTINCT FROM OLD.payment_operation_id)
 OR(OLD.payment_status='PAID' AND NEW.payment_status<>'PAID') OR(OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at) OR(OLD.payment_refunded AND NOT NEW.payment_refunded)
 OR(OLD.refund_full AND NOT NEW.refund_full) OR(OLD.order_status IN('EXPIRED','CANCELLED') AND NEW.order_status NOT IN('EXPIRED','CANCELLED')) THEN RAISE EXCEPTION 'Order snapshot and payment guard' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
UPDATE orders SET refund_review_required=true,revision=revision+1 WHERE payment_refunded;
ALTER TABLE checkout_operations ADD COLUMN payment_intent_id VARCHAR(255) CHECK(payment_intent_id IS NULL OR payment_intent_id ~ '^pi_[A-Za-z0-9_]+$');
CREATE OR REPLACE FUNCTION guard_checkout_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Checkout history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','session_id','session_url','lease_token','lease_until','attempts','last_error_code','updated_at','revision','payment_intent_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','session_id','session_url','lease_token','lease_until','attempts','last_error_code','updated_at','revision','payment_intent_id'])
 OR NEW.revision<>OLD.revision+1 OR NEW.attempts<OLD.attempts OR(OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id) OR(OLD.session_url IS NOT NULL AND NEW.session_url IS DISTINCT FROM OLD.session_url)
 OR(OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id) OR(OLD.state='COMPLETE' AND NEW.state<>'COMPLETE') THEN RAISE EXCEPTION 'Checkout origin and request are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;

CREATE TABLE refund_requests (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,order_id UUID NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),state VARCHAR(16) NOT NULL CHECK(state IN('REQUESTED','APPROVED','REJECTED')),
 reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),decision_id UUID UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,order_id,owner_id),FOREIGN KEY(order_id,owner_id) REFERENCES orders(id,owner_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at),CHECK((state='REQUESTED')=(decision_id IS NULL))
);
CREATE UNIQUE INDEX refund_requests_one_open_order ON refund_requests(order_id) WHERE state='REQUESTED';
CREATE TABLE refund_decisions (
 id UUID PRIMARY KEY,request_id UUID NOT NULL UNIQUE REFERENCES refund_requests(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,outcome VARCHAR(8) NOT NULL CHECK(outcome IN('APPROVE','REJECT')),
 reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),amount_minor BIGINT CHECK(amount_minor BETWEEN 1 AND 99999999),currency VARCHAR(3) CHECK(currency IN('EUR','USD','GBP')),
 allocations_json JSONB NOT NULL CHECK(jsonb_typeof(allocations_json)='array' AND jsonb_array_length(allocations_json)<=20),preview_fingerprint VARCHAR(64),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),CHECK(isfinite(created_at)),UNIQUE(id,request_id),
 CHECK((outcome='APPROVE' AND amount_minor IS NOT NULL AND currency IS NOT NULL AND preview_fingerprint IS NOT NULL AND preview_fingerprint ~ '^[a-f0-9]{64}$' AND jsonb_array_length(allocations_json)>0) OR(outcome='REJECT' AND amount_minor IS NULL AND currency IS NULL AND preview_fingerprint IS NULL AND allocations_json='[]'::jsonb))
);
ALTER TABLE refund_requests ADD FOREIGN KEY(decision_id) REFERENCES refund_decisions(id) ON DELETE RESTRICT;
CREATE TABLE refund_operations (
 id UUID PRIMARY KEY,order_id UUID NOT NULL,owner_id UUID NOT NULL,request_id UUID UNIQUE REFERENCES refund_requests(id) ON DELETE RESTRICT,
 decision_id UUID UNIQUE REFERENCES refund_decisions(id) ON DELETE RESTRICT,origin VARCHAR(24) NOT NULL CHECK(origin IN('LOCAL_DECISION','STRIPE_DASHBOARD')),
 account_id VARCHAR(128) NOT NULL CHECK(account_id ~ '^acct_[A-Za-z0-9_]+$'),livemode BOOLEAN NOT NULL DEFAULT false CHECK(livemode=false),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),state VARCHAR(24) NOT NULL CHECK(state IN('PREPARED','CALLING','UNKNOWN','PENDING','REQUIRES_ACTION','SUCCEEDED','FAILED','CANCELED','NEEDS_REVIEW')),
 amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999),currency VARCHAR(3) NOT NULL CHECK(currency IN('EUR','USD','GBP')),
 provider_refund_id VARCHAR(255),payment_intent_id VARCHAR(255),provider_idempotency_key VARCHAR(100) NOT NULL UNIQUE,
 request_json JSONB,request_hash BYTEA,allocations_json JSONB NOT NULL CHECK(jsonb_typeof(allocations_json)='array' AND jsonb_array_length(allocations_json)<=20),
 access_state VARCHAR(16) NOT NULL DEFAULT 'NOT_APPLIED' CHECK(access_state IN('NOT_APPLIED','APPLIED','KEPT','NEEDS_REVIEW')),
 lease_id UUID,lease_until TIMESTAMPTZ,last_error_code VARCHAR(64),confirmed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,order_id,owner_id),UNIQUE(account_id,livemode,provider_refund_id),FOREIGN KEY(order_id,owner_id) REFERENCES orders(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(request_id,order_id,owner_id) REFERENCES refund_requests(id,order_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(decision_id,request_id) REFERENCES refund_decisions(id,request_id) ON DELETE RESTRICT,
 CHECK(provider_refund_id IS NULL OR provider_refund_id ~ '^re_[A-Za-z0-9_]+$'),CHECK(payment_intent_id IS NULL OR payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
 CHECK((origin='LOCAL_DECISION' AND request_id IS NOT NULL AND decision_id IS NOT NULL AND provider_idempotency_key ~ '^cc-refund-[0-9a-f-]{36}$') OR(origin='STRIPE_DASHBOARD' AND request_id IS NULL AND decision_id IS NULL AND provider_refund_id IS NOT NULL)),
 CHECK((request_json IS NULL AND request_hash IS NULL) OR(request_json IS NOT NULL AND request_hash IS NOT NULL AND jsonb_typeof(request_json)='object' AND octet_length(request_json::text)<=4096 AND octet_length(request_hash)=32)),
 CHECK(request_json IS NULL OR(((request_json->>'operationId')::uuid=id AND(request_json->>'orderId')::uuid=order_id AND request_json->>'paymentIntentId'=payment_intent_id AND(request_json->>'amountMinor')::bigint=amount_minor AND request_json->>'currency'=currency) IS TRUE)),
 CHECK((state='CALLING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL) OR(state<>'CALLING' AND lease_id IS NULL AND lease_until IS NULL)),
 CHECK(state<>'SUCCEEDED' OR confirmed_at IS NOT NULL),CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at AND(confirmed_at IS NULL OR isfinite(confirmed_at)))
);
CREATE TABLE refund_reservations (
 operation_id UUID PRIMARY KEY,order_id UUID NOT NULL,owner_id UUID NOT NULL,amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),released_at TIMESTAMPTZ,release_reason VARCHAR(16) CHECK(release_reason IN('SUCCEEDED','FAILED','CANCELED')),
 FOREIGN KEY(operation_id,order_id,owner_id) REFERENCES refund_operations(id,order_id,owner_id) ON DELETE RESTRICT,
 CHECK((released_at IS NULL)=(release_reason IS NULL)),CHECK(isfinite(created_at) AND(released_at IS NULL OR(isfinite(released_at) AND released_at>=created_at)))
);
CREATE TABLE refund_access_decisions (
 operation_id UUID PRIMARY KEY REFERENCES refund_operations(id) ON DELETE RESTRICT,actor_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,
 reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),allocations_json JSONB NOT NULL CHECK(jsonb_typeof(allocations_json)='array' AND jsonb_array_length(allocations_json) BETWEEN 1 AND 20),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at))
);
CREATE TABLE refund_access_blocks (
 order_resource_id UUID PRIMARY KEY REFERENCES order_resources(id) ON DELETE RESTRICT,operation_id UUID NOT NULL REFERENCES refund_operations(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at))
);
CREATE TABLE refund_origin_revocations (
 grant_id UUID PRIMARY KEY REFERENCES access_grants(id) ON DELETE RESTRICT,operation_id UUID NOT NULL REFERENCES refund_operations(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at))
);
CREATE TABLE refund_audit (
 id UUID PRIMARY KEY,actor_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 request_id UUID REFERENCES refund_requests(id) ON DELETE RESTRICT,operation_id UUID REFERENCES refund_operations(id) ON DELETE RESTRICT,
 action VARCHAR(64) NOT NULL CHECK(action ~ '^[A-Z][A-Z0-9_]+$'),result VARCHAR(32) NOT NULL,reason VARCHAR(2000),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at))
);
CREATE TABLE refund_idempotency_keys (
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,scope VARCHAR(32) NOT NULL,idempotency_key UUID NOT NULL,request_hash BYTEA NOT NULL CHECK(octet_length(request_hash)=32),
 request_id UUID REFERENCES refund_requests(id) ON DELETE RESTRICT,operation_id UUID REFERENCES refund_operations(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),PRIMARY KEY(actor_id,scope,idempotency_key),CHECK(request_id IS NOT NULL OR operation_id IS NOT NULL)
);
CREATE TABLE refund_reconciliation_jobs (
 id UUID PRIMARY KEY,order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,state VARCHAR(16) NOT NULL CHECK(state IN('PENDING','PROCESSING','WAITING','RETRY','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),next_attempt_at TIMESTAMPTZ,lease_id UUID,lease_until TIMESTAMPTZ,last_error_code VARCHAR(64),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK((state='PROCESSING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND next_attempt_at IS NULL) OR(state<>'PROCESSING' AND lease_id IS NULL AND lease_until IS NULL)),
 CHECK(state NOT IN('PENDING','WAITING','RETRY') OR next_attempt_at IS NOT NULL),CHECK(isfinite(created_at) AND isfinite(updated_at))
);
CREATE INDEX refund_operations_order_idx ON refund_operations(order_id,created_at,id);
CREATE INDEX refund_jobs_due_idx ON refund_reconciliation_jobs(state,next_attempt_at,id);
CREATE FUNCTION guard_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR(to_jsonb(NEW)-ARRAY['revision','state','decision_id','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state','decision_id','updated_at']) OR NEW.revision<>OLD.revision+1 OR OLD.state<>'REQUESTED' OR NEW.state NOT IN('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Refund request history is immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM refund_decisions d WHERE d.id=NEW.decision_id AND d.request_id=NEW.id AND((d.outcome='APPROVE' AND NEW.state='APPROVED') OR(d.outcome='REJECT' AND NEW.state='REJECTED'))) THEN RAISE EXCEPTION 'Refund decision belongs to request' USING ERRCODE='23514'; END IF;RETURN NEW;END;$$;
CREATE TRIGGER refund_requests_guard BEFORE UPDATE OR DELETE ON refund_requests FOR EACH ROW EXECUTE FUNCTION guard_refund_request();
CREATE FUNCTION guard_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM orders o JOIN checkout_operations p ON p.id=o.payment_operation_id WHERE o.id=NEW.order_id AND o.owner_id=NEW.owner_id AND o.payment_status='PAID' AND o.currency=NEW.currency AND NEW.amount_minor<=o.total_amount AND p.account_id=NEW.account_id AND NOT p.livemode) THEN RAISE EXCEPTION 'Refund requires its verified payment' USING ERRCODE='23514';END IF;
  IF NEW.origin='LOCAL_DECISION' AND NOT EXISTS(SELECT 1 FROM refund_decisions d WHERE d.id=NEW.decision_id AND d.request_id=NEW.request_id AND d.outcome='APPROVE' AND d.amount_minor=NEW.amount_minor AND d.currency=NEW.currency AND d.allocations_json=NEW.allocations_json) THEN RAISE EXCEPTION 'Refund requires its approved decision' USING ERRCODE='23514';END IF;RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR(to_jsonb(NEW)-ARRAY['revision','state','provider_refund_id','payment_intent_id','request_json','request_hash','access_state','lease_id','lease_until','last_error_code','confirmed_at','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state','provider_refund_id','payment_intent_id','request_json','request_hash','access_state','lease_id','lease_until','last_error_code','confirmed_at','updated_at']) OR NEW.revision<>OLD.revision+1
 OR(OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id) OR(OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id) OR(OLD.request_json IS NOT NULL AND(NEW.request_json IS DISTINCT FROM OLD.request_json OR NEW.request_hash IS DISTINCT FROM OLD.request_hash)) OR(OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
 OR(OLD.state IN('FAILED','CANCELED') AND NEW.state NOT IN('FAILED','CANCELED','NEEDS_REVIEW')) THEN RAISE EXCEPTION 'Refund operation identity is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER refund_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON refund_operations FOR EACH ROW EXECUTE FUNCTION guard_refund_operation();
CREATE FUNCTION guard_refund_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history is immutable' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN IF(to_jsonb(NEW)-ARRAY['released_at','release_reason']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['released_at','release_reason']) OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN RAISE EXCEPTION 'Reservation can only be released once' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 PERFORM id FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM refund_operations p WHERE p.id=NEW.operation_id AND p.order_id=NEW.order_id AND p.owner_id=NEW.owner_id AND p.amount_minor=NEW.amount_minor) THEN RAISE EXCEPTION 'Reservation must match operation' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM refund_operations WHERE id=NEW.operation_id AND origin='LOCAL_DECISION') AND NEW.amount_minor+coalesce((SELECT sum(amount_minor) FROM refund_reservations WHERE order_id=NEW.order_id AND released_at IS NULL),0)+coalesce((SELECT sum(amount_minor) FROM refund_operations WHERE order_id=NEW.order_id AND state='SUCCEEDED'),0)>(SELECT total_amount FROM orders WHERE id=NEW.order_id) THEN RAISE EXCEPTION 'Refund amount unavailable' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER refund_reservations_guard BEFORE INSERT OR UPDATE OR DELETE ON refund_reservations FOR EACH ROW EXECUTE FUNCTION guard_refund_reservation();
CREATE FUNCTION guard_refund_effect_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='refund_access_blocks' THEN
  IF NOT EXISTS(SELECT 1 FROM refund_operations p JOIN order_resources r ON r.order_id=p.order_id WHERE p.id=NEW.operation_id AND p.state='SUCCEEDED' AND r.id=NEW.order_resource_id) THEN RAISE EXCEPTION 'Refund affects only its confirmed order origins' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='refund_origin_revocations' THEN
  IF NOT EXISTS(SELECT 1 FROM refund_operations p JOIN order_resources r ON r.order_id=p.order_id JOIN access_grants g ON g.order_resource_id=r.id WHERE p.id=NEW.operation_id AND p.state='SUCCEEDED' AND g.id=NEW.grant_id AND g.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Refund revocation belongs to its order' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM refund_operations p WHERE p.id=NEW.operation_id AND p.state='SUCCEEDED' AND p.origin='STRIPE_DASHBOARD') THEN RAISE EXCEPTION 'External access decision requires confirmed refund' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;END;$$;
CREATE TRIGGER refund_access_blocks_origin BEFORE INSERT ON refund_access_blocks FOR EACH ROW EXECUTE FUNCTION guard_refund_effect_origin();
CREATE TRIGGER refund_origin_revocations_origin BEFORE INSERT ON refund_origin_revocations FOR EACH ROW EXECUTE FUNCTION guard_refund_effect_origin();
CREATE TRIGGER refund_access_decisions_origin BEFORE INSERT ON refund_access_decisions FOR EACH ROW EXECUTE FUNCTION guard_refund_effect_origin();
CREATE TRIGGER refund_decisions_immutable BEFORE UPDATE OR DELETE ON refund_decisions FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER refund_access_decisions_immutable BEFORE UPDATE OR DELETE ON refund_access_decisions FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER refund_access_blocks_immutable BEFORE UPDATE OR DELETE ON refund_access_blocks FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER refund_origin_revocations_immutable BEFORE UPDATE OR DELETE ON refund_origin_revocations FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER refund_audit_immutable BEFORE UPDATE OR DELETE ON refund_audit FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER refund_idempotency_immutable BEFORE UPDATE OR DELETE ON refund_idempotency_keys FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
ALTER TABLE notification_outbox DROP CONSTRAINT notification_outbox_event_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_event_type_check CHECK(event_type IN('ACCOUNT_CREATED','PASSWORD_RESET','ACCESS_ACTIVATED','SUPPORT_REPLY','REFUND_UPDATED'));
INSERT INTO permissions(id,code) VALUES
 ('13100000-0000-0000-0000-000000000001','refunds.read'),('13100000-0000-0000-0000-000000000002','refunds.request'),('13100000-0000-0000-0000-000000000003','entitlements.read'),
 ('13100000-0000-0000-0000-000000000011','refunds.admin.read'),('13100000-0000-0000-0000-000000000012','refunds.decide'),('13100000-0000-0000-0000-000000000013','refunds.execute'),('13100000-0000-0000-0000-000000000014','refunds.reconcile') ON CONFLICT(code) DO NOTHING;
INSERT INTO roles(id,code) VALUES('13100000-0000-0000-0000-000000000100','REFUND_OPERATOR') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE
 (r.code='LEARNER' AND p.code IN('refunds.read','refunds.request','entitlements.read')) OR(r.code='REFUND_OPERATOR' AND p.code IN('refunds.admin.read','refunds.decide','refunds.execute','refunds.reconcile')) ON CONFLICT(role_id,permission_id) WHERE revoked_at IS NULL DO NOTHING;
