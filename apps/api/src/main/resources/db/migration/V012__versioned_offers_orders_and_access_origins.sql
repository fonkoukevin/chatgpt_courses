-- Structural commerce only. No offer, price, account, payment or access fixture is seeded.
CREATE TABLE products (
 id UUID PRIMARY KEY,code VARCHAR(80) NOT NULL UNIQUE CHECK(code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 kind VARCHAR(8) NOT NULL CHECK(kind IN('COURSE','PACK')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at))
);
CREATE TABLE offers (
 id UUID PRIMARY KEY,product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 state VARCHAR(8) NOT NULL CHECK(state IN('DRAFT','ACTIVE','INACTIVE')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 current_revision_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE TABLE offer_revisions (
 id UUID PRIMARY KEY,offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
 revision_number INTEGER NOT NULL CHECK(revision_number>=1),fields_json JSONB NOT NULL CHECK(jsonb_typeof(fields_json)='object' AND octet_length(fields_json::text)<=65536),
 author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 UNIQUE(offer_id,revision_number),UNIQUE(id,offer_id)
);
ALTER TABLE offers ADD FOREIGN KEY(current_revision_id,id) REFERENCES offer_revisions(id,offer_id) ON DELETE RESTRICT;
CREATE TABLE offer_revision_resources (
 revision_id UUID NOT NULL REFERENCES offer_revisions(id) ON DELETE RESTRICT,
 resource_id UUID NOT NULL,version_id UUID NOT NULL,resource_kind VARCHAR(8) NOT NULL DEFAULT 'COURSE' CHECK(resource_kind='COURSE'),
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 19),PRIMARY KEY(revision_id,resource_id),UNIQUE(revision_id,position),
 FOREIGN KEY(version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(resource_id,resource_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT
);
CREATE TABLE offer_events (
 id UUID PRIMARY KEY,offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,revision_id UUID NOT NULL,
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,event_type VARCHAR(12) NOT NULL CHECK(event_type IN('CREATE','SAVE','ACTIVATE','DEACTIVATE')),
 reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 FOREIGN KEY(revision_id,offer_id) REFERENCES offer_revisions(id,offer_id) ON DELETE RESTRICT
);
CREATE TABLE orders (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,offer_revision BIGINT NOT NULL CHECK(offer_revision BETWEEN 0 AND 9007199254740991),offer_revision_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),total_amount BIGINT NOT NULL CHECK(total_amount BETWEEN 0 AND 9007199254740991),currency VARCHAR(3) NOT NULL CHECK(currency IN('EUR','USD','GBP')),
 order_status VARCHAR(12) NOT NULL CHECK(order_status IN('PREPARED','EXPIRED','CANCELLED')),
 payment_status VARCHAR(16) NOT NULL CHECK(payment_status='NOT_STARTED'),fulfillment_status VARCHAR(16) NOT NULL CHECK(fulfillment_status='NOT_STARTED'),
 snapshot_json JSONB NOT NULL CHECK(jsonb_typeof(snapshot_json)='object'),accepted_terms_version VARCHAR(100) NOT NULL CHECK(length(btrim(accepted_terms_version))>0),
 accepted_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),active_intention_key VARCHAR(64),
 FOREIGN KEY(offer_revision_id,offer_id) REFERENCES offer_revisions(id,offer_id) ON DELETE RESTRICT,
 CHECK(isfinite(accepted_at) AND isfinite(created_at) AND isfinite(expires_at) AND accepted_at=created_at AND expires_at>created_at),
 CHECK((order_status='PREPARED' AND active_intention_key IS NOT NULL AND active_intention_key ~ '^[a-f0-9]{64}$') OR(order_status IN('EXPIRED','CANCELLED') AND active_intention_key IS NULL)),
 CHECK(((snapshot_json->'total'->>'amountMinor')::bigint=total_amount AND snapshot_json->'total'->>'currency'=currency) IS TRUE)
);
CREATE UNIQUE INDEX orders_active_intention_uq ON orders(owner_id,active_intention_key) WHERE active_intention_key IS NOT NULL;
CREATE INDEX orders_owner_idx ON orders(owner_id,created_at DESC,id);
CREATE TABLE order_resources (
 id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,resource_id UUID NOT NULL,version_id UUID NOT NULL,
 locales JSONB NOT NULL CHECK(jsonb_typeof(locales)='array' AND jsonb_array_length(locales) BETWEEN 1 AND 2 AND locales <@ '["fr","en"]'::jsonb AND (jsonb_array_length(locales)=1 OR locales->>0<>locales->>1)),
 UNIQUE(order_id,resource_id),UNIQUE(id,resource_id,version_id),
 FOREIGN KEY(version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT
);
CREATE TABLE order_idempotency_keys (
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,idempotency_key UUID NOT NULL,request_hash BYTEA NOT NULL CHECK(octet_length(request_hash)=32),
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),PRIMARY KEY(owner_id,idempotency_key)
);
CREATE TABLE access_grants (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,resource_id UUID NOT NULL,version_id UUID NOT NULL,
 origin_type VARCHAR(12) NOT NULL CHECK(origin_type IN('ORDER_LINE','MANUAL_TEST')),order_resource_id UUID,manual_origin_id UUID UNIQUE,
 locales JSONB NOT NULL CHECK(jsonb_typeof(locales)='array' AND jsonb_array_length(locales) BETWEEN 1 AND 2 AND locales <@ '["fr","en"]'::jsonb AND (jsonb_array_length(locales)=1 OR locales->>0<>locales->>1)),
 version_policy VARCHAR(24) NOT NULL CHECK(version_policy IN('PINNED','UPDATES_DURING_PERIOD')),
 starts_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ,updates_until TIMESTAMPTZ,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(order_resource_id,resource_id,version_id) REFERENCES order_resources(id,resource_id,version_id) ON DELETE RESTRICT,
 CHECK((origin_type='ORDER_LINE' AND order_resource_id IS NOT NULL AND manual_origin_id IS NULL) OR(origin_type='MANUAL_TEST' AND order_resource_id IS NULL AND manual_origin_id IS NOT NULL)),
 CHECK(isfinite(created_at) AND isfinite(starts_at) AND (expires_at IS NULL OR(isfinite(expires_at) AND expires_at>starts_at)) AND (updates_until IS NULL OR(isfinite(updates_until) AND updates_until>=starts_at)) AND (revoked_at IS NULL OR(isfinite(revoked_at) AND revoked_at>=created_at))),
 CHECK(version_policy<>'UPDATES_DURING_PERIOD' OR updates_until IS NOT NULL)
);
CREATE UNIQUE INDEX access_grants_order_origin_uq ON access_grants(order_resource_id,resource_id) WHERE order_resource_id IS NOT NULL;
CREATE INDEX access_grants_owner_idx ON access_grants(owner_id,resource_id);

CREATE FUNCTION reject_commerce_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commerce history is immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER products_immutable BEFORE UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER offer_revisions_immutable BEFORE UPDATE OR DELETE ON offer_revisions FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER offer_revision_resources_immutable BEFORE UPDATE OR DELETE ON offer_revision_resources FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER offer_events_immutable BEFORE UPDATE OR DELETE ON offer_events FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER order_resources_immutable BEFORE UPDATE OR DELETE ON order_resources FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER order_idempotency_immutable BEFORE UPDATE OR DELETE ON order_idempotency_keys FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE FUNCTION guard_offer_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offer history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Offer identity and revision guard' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER offers_guard BEFORE UPDATE OR DELETE ON offers FOR EACH ROW EXECUTE FUNCTION guard_offer_identity();
CREATE FUNCTION guard_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['order_status','active_intention_key','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['order_status','active_intention_key','revision']) OR NEW.revision<>OLD.revision+1 OR OLD.order_status<>'PREPARED' OR NEW.order_status NOT IN('EXPIRED','CANCELLED') THEN RAISE EXCEPTION 'Order snapshot and state guard' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER orders_guard BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION guard_order_snapshot();
CREATE FUNCTION guard_access_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Access origin history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Access origin is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.origin_type='ORDER_LINE' AND NOT EXISTS(SELECT 1 FROM order_resources x JOIN orders o ON o.id=x.order_id WHERE x.id=NEW.order_resource_id AND o.owner_id=NEW.owner_id AND o.payment_status='PAID' AND NEW.locales <@ x.locales) THEN RAISE EXCEPTION 'Access requires a verified owner payment origin' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER access_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON access_grants FOR EACH ROW EXECUTE FUNCTION guard_access_origin();

INSERT INTO roles(id,code) VALUES('11100000-0000-0000-0000-000000000001','COMMERCE_MANAGER') ON CONFLICT(code) DO NOTHING;
INSERT INTO permissions(id,code) VALUES
 ('11100000-0000-0000-0000-000000000011','commerce.offers.read'),('11100000-0000-0000-0000-000000000012','commerce.offers.write'),('11100000-0000-0000-0000-000000000013','commerce.offers.activate'),
 ('11100000-0000-0000-0000-000000000021','commerce.orders.read'),('11100000-0000-0000-0000-000000000022','commerce.orders.write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE
 ((r.code='COMMERCE_MANAGER' AND p.code IN('commerce.offers.read','commerce.offers.write','commerce.offers.activate')) OR(r.code='LEARNER' AND p.code IN('commerce.orders.read','commerce.orders.write')))
 AND NOT EXISTS(SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.revoked_at IS NULL) ON CONFLICT DO NOTHING;
