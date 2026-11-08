-- Persist an immutable provider operation before any network request. No payment/access fixture.
ALTER TABLE orders ALTER COLUMN order_status TYPE VARCHAR(20);
ALTER TABLE orders ADD CONSTRAINT orders_id_owner_v013 UNIQUE(id,owner_id);
CREATE TABLE checkout_operations (
 id UUID PRIMARY KEY,order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,order_revision BIGINT NOT NULL CHECK(order_revision BETWEEN 0 AND 9007199254740991),
 provider VARCHAR(8) NOT NULL DEFAULT 'STRIPE' CHECK(provider='STRIPE'),account_id VARCHAR(128) NOT NULL CHECK(account_id ~ '^acct_[A-Za-z0-9_]+$'),livemode BOOLEAN NOT NULL CHECK(livemode=false),
 provider_idempotency_key VARCHAR(100) NOT NULL UNIQUE CHECK(provider_idempotency_key ~ '^cc-checkout-[0-9a-f-]{36}$'),request_json JSONB NOT NULL CHECK(jsonb_typeof(request_json)='object' AND octet_length(request_json::text)<=16384),request_hash BYTEA NOT NULL CHECK(octet_length(request_hash)=32),
 amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999),currency VARCHAR(3) NOT NULL CHECK(currency IN('EUR','USD','GBP')),
 state VARCHAR(20) NOT NULL CHECK(state IN('PREPARED','CALLING','OPEN','UNKNOWN','COMPLETE','EXPIRED','FAILED','NEEDS_REVIEW')),
 session_id VARCHAR(255) UNIQUE,session_url TEXT,checkout_expires_at TIMESTAMPTZ NOT NULL,retry_until TIMESTAMPTZ NOT NULL,
 lease_token UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),last_error_code VARCHAR(48),
 created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 UNIQUE(id,order_id),UNIQUE(id,order_id,owner_id),UNIQUE(id,owner_id),
 FOREIGN KEY(order_id,owner_id) REFERENCES orders(id,owner_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at AND isfinite(checkout_expires_at) AND checkout_expires_at=created_at+interval '1 hour' AND isfinite(retry_until) AND retry_until>=created_at+interval '1 minute' AND retry_until<=created_at+interval '15 minutes'),
 CHECK((state='CALLING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR(state<>'CALLING' AND lease_token IS NULL AND lease_until IS NULL)),
 CHECK(lease_until IS NULL OR(isfinite(lease_until) AND lease_until>created_at)),
 CHECK(state NOT IN('OPEN','COMPLETE') OR session_id IS NOT NULL),
 CHECK(session_url IS NULL OR(session_id IS NOT NULL AND session_url ~ '^https://checkout[.]stripe[.]com/c/pay/')),
 CHECK((currency IN('EUR','USD') AND amount_minor>=50) OR(currency='GBP' AND amount_minor>=30)),
 CHECK(((request_json->>'operationId')::uuid=id AND(request_json->>'orderId')::uuid=order_id AND(request_json->>'amountMinor')::bigint=amount_minor AND request_json->>'currency'=currency) IS TRUE)
);
CREATE TABLE checkout_idempotency_keys (
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,idempotency_key UUID NOT NULL,order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 operation_id UUID NOT NULL,request_hash BYTEA NOT NULL CHECK(octet_length(request_hash)=32),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 PRIMARY KEY(owner_id,idempotency_key),FOREIGN KEY(operation_id,order_id,owner_id) REFERENCES checkout_operations(id,order_id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX checkout_operations_reconcile_idx ON checkout_operations(state,updated_at,id);
ALTER TABLE orders ADD COLUMN payment_operation_id UUID,ADD COLUMN paid_at TIMESTAMPTZ,ADD COLUMN payment_refunded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD FOREIGN KEY(payment_operation_id,id,owner_id) REFERENCES checkout_operations(id,order_id,owner_id) ON DELETE RESTRICT;
ALTER TABLE orders DROP CONSTRAINT orders_order_status_check,DROP CONSTRAINT orders_payment_status_check,DROP CONSTRAINT orders_fulfillment_status_check,DROP CONSTRAINT orders_check1;
ALTER TABLE orders ADD CONSTRAINT orders_status_v013 CHECK(order_status IN('PREPARED','AWAITING_PAYMENT','CONFIRMED','EXPIRED','CANCELLED','NEEDS_REVIEW')),
 ADD CONSTRAINT orders_payment_v013 CHECK(payment_status IN('NOT_STARTED','REQUIRES_PAYMENT','PROCESSING','PAID','FAILED','EXPIRED','UNKNOWN')),
 ADD CONSTRAINT orders_fulfillment_v013 CHECK(fulfillment_status IN('NOT_STARTED','PENDING','READY','RETRYING','NEEDS_REVIEW')),
 ADD CONSTRAINT orders_intention_v013 CHECK((order_status IN('PREPARED','AWAITING_PAYMENT','CONFIRMED','NEEDS_REVIEW') AND active_intention_key IS NOT NULL AND active_intention_key ~ '^[a-f0-9]{64}$') OR(order_status IN('EXPIRED','CANCELLED') AND active_intention_key IS NULL)),
 ADD CONSTRAINT orders_paid_date_v013 CHECK((payment_status='PAID' AND paid_at IS NOT NULL AND isfinite(paid_at) AND paid_at>=created_at) OR(payment_status<>'PAID' AND paid_at IS NULL));

CREATE TRIGGER checkout_idempotency_immutable BEFORE UPDATE OR DELETE ON checkout_idempotency_keys FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE FUNCTION guard_checkout_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Checkout history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','session_id','session_url','lease_token','lease_until','attempts','last_error_code','updated_at','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','session_id','session_url','lease_token','lease_until','attempts','last_error_code','updated_at','revision'])
 OR NEW.revision<>OLD.revision+1 OR NEW.attempts<OLD.attempts OR(OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id) OR(OLD.session_url IS NOT NULL AND NEW.session_url IS DISTINCT FROM OLD.session_url)
 OR(OLD.state='COMPLETE' AND NEW.state<>'COMPLETE') THEN RAISE EXCEPTION 'Checkout origin and request are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER checkout_operations_guard BEFORE UPDATE OR DELETE ON checkout_operations FOR EACH ROW EXECUTE FUNCTION guard_checkout_operation();
CREATE OR REPLACE FUNCTION guard_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['order_status','payment_status','fulfillment_status','active_intention_key','revision','payment_operation_id','paid_at','payment_refunded']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['order_status','payment_status','fulfillment_status','active_intention_key','revision','payment_operation_id','paid_at','payment_refunded'])
 OR NEW.revision<>OLD.revision+1 OR(OLD.payment_operation_id IS NOT NULL AND NEW.payment_operation_id IS DISTINCT FROM OLD.payment_operation_id)
 OR(OLD.payment_status='PAID' AND NEW.payment_status<>'PAID') OR(OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at) OR(OLD.payment_refunded AND NOT NEW.payment_refunded)
 OR(OLD.order_status IN('EXPIRED','CANCELLED') AND NEW.order_status NOT IN('EXPIRED','CANCELLED')) THEN RAISE EXCEPTION 'Order snapshot and payment guard' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
