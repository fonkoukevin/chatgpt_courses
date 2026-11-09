-- P14: participation is evidence, never certification; no retention policy or destructive processing is seeded.
ALTER TABLE assets ADD CONSTRAINT assets_id_owner_uq UNIQUE(id,owner_id);
CREATE TABLE support_tickets (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 category VARCHAR(16) NOT NULL CHECK(category IN('TECHNICAL','CONTENT','ACCESS','ORDER','ACCOUNT','OTHER')),
 subject VARCHAR(160) NOT NULL CHECK(length(btrim(subject))>0),locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 context_json JSONB CHECK(context_json IS NULL OR jsonb_typeof(context_json)='object'),
 state VARCHAR(20) NOT NULL CHECK(state IN('OPEN','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,owner_id),CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE INDEX support_tickets_owner_created_idx ON support_tickets(owner_id,created_at DESC,id);
CREATE TABLE support_messages (
 id UUID PRIMARY KEY,ticket_id UUID NOT NULL,owner_id UUID NOT NULL,actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 author_kind VARCHAR(8) NOT NULL CHECK(author_kind IN('USER','SUPPORT')),body TEXT NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 8000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,ticket_id,owner_id),
 FOREIGN KEY(ticket_id,owner_id) REFERENCES support_tickets(id,owner_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at)),CHECK(author_kind<>'USER' OR actor_id=owner_id)
);
CREATE INDEX support_messages_ticket_created_idx ON support_messages(ticket_id,created_at,id);
CREATE TABLE support_message_attachments (
 message_id UUID NOT NULL,ticket_id UUID NOT NULL,owner_id UUID NOT NULL,asset_id UUID NOT NULL,
 PRIMARY KEY(message_id,asset_id),FOREIGN KEY(message_id,ticket_id,owner_id) REFERENCES support_messages(id,ticket_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(asset_id,owner_id) REFERENCES assets(id,owner_id) ON DELETE RESTRICT
);
CREATE TABLE support_ticket_events (
 id UUID PRIMARY KEY,ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,author_kind VARCHAR(8) NOT NULL CHECK(author_kind IN('USER','SUPPORT')),
 event_type VARCHAR(20) NOT NULL CHECK(event_type IN('CREATED','USER_MESSAGE','SUPPORT_REPLY','STATE_CHANGED')),
 from_state VARCHAR(20),to_state VARCHAR(20),reason VARCHAR(2000),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),CHECK(isfinite(created_at))
);
CREATE TABLE account_data_requests (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 request_type VARCHAR(20) NOT NULL CHECK(request_type IN('EXPORT','ERASURE','ACCOUNT_CLOSURE')),
 reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),state VARCHAR(20) NOT NULL CHECK(state IN('WAITING_POLICY','CANCELLED')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),cancelled_at TIMESTAMPTZ,
 UNIQUE(id,owner_id),CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at),
 CHECK((state='CANCELLED')=(cancelled_at IS NOT NULL)),CHECK(cancelled_at IS NULL OR(isfinite(cancelled_at) AND cancelled_at>=created_at))
);
CREATE UNIQUE INDEX account_data_requests_active_uq ON account_data_requests(owner_id,request_type) WHERE state='WAITING_POLICY';
CREATE TABLE account_data_request_events (
 id UUID PRIMARY KEY,request_id UUID NOT NULL,owner_id UUID NOT NULL,event_type VARCHAR(12) NOT NULL CHECK(event_type IN('REQUESTED','CANCELLED')),
 reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,owner_id) REFERENCES account_data_requests(id,owner_id) ON DELETE RESTRICT,CHECK(isfinite(created_at))
);
CREATE TABLE participation_attestations (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL,enrollment_id UUID NOT NULL,attestation_type VARCHAR(20) NOT NULL CHECK(attestation_type='PARTICIPATION'),
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),evidence_fingerprint BYTEA NOT NULL CHECK(octet_length(evidence_fingerprint)=32),
 snapshot_json JSONB NOT NULL CHECK(jsonb_typeof(snapshot_json)='object' AND octet_length(snapshot_json::text)<=2097152),
 document_bytes BYTEA NOT NULL CHECK(octet_length(document_bytes) BETWEEN 1 AND 262144),document_sha256 BYTEA NOT NULL CHECK(octet_length(document_sha256)=32),
 document_size BIGINT NOT NULL CHECK(document_size BETWEEN 1 AND 262144),issued_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(enrollment_id,owner_id) REFERENCES learning_enrollments(id,owner_id) ON DELETE RESTRICT,
 UNIQUE(owner_id,enrollment_id,attestation_type,locale,evidence_fingerprint),CHECK(document_size=octet_length(document_bytes)),CHECK(isfinite(issued_at))
);
CREATE TABLE account_action_keys (
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,scope VARCHAR(40) NOT NULL,idempotency_key UUID NOT NULL,
 request_fingerprint BYTEA NOT NULL CHECK(octet_length(request_fingerprint)=32),
 ticket_id UUID REFERENCES support_tickets(id) ON DELETE RESTRICT,message_id UUID REFERENCES support_messages(id) ON DELETE RESTRICT,
 data_request_id UUID REFERENCES account_data_requests(id) ON DELETE RESTRICT,attestation_id UUID REFERENCES participation_attestations(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,scope,idempotency_key),
 CHECK(num_nonnulls(ticket_id,message_id,data_request_id,attestation_id)=1),CHECK(isfinite(created_at))
);
CREATE INDEX support_attachments_ticket_asset_idx ON support_message_attachments(ticket_id,asset_id);
CREATE INDEX support_events_ticket_created_idx ON support_ticket_events(ticket_id,created_at,id);
CREATE INDEX data_requests_owner_created_idx ON account_data_requests(owner_id,created_at DESC,id);
CREATE INDEX data_request_events_created_idx ON account_data_request_events(request_id,created_at,id);
CREATE INDEX attestations_owner_issued_idx ON participation_attestations(owner_id,issued_at DESC,id);
CREATE FUNCTION guard_support_attachment() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM assets a JOIN support_messages m ON m.id=NEW.message_id WHERE a.id=NEW.asset_id AND a.owner_id=NEW.owner_id AND a.scope='PROJECT_FILE' AND a.state='READY' AND m.author_kind='USER') THEN
  RAISE EXCEPTION 'Only explicitly selected ready owner files may be attached' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER support_attachment_guard BEFORE INSERT ON support_message_attachments FOR EACH ROW EXECUTE FUNCTION guard_support_attachment();
CREATE FUNCTION guard_support_ticket() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Support history is preserved' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND((to_jsonb(NEW)-ARRAY['revision','state','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state','updated_at']) OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at) THEN
  RAISE EXCEPTION 'Support identity is immutable and revisioned' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER support_ticket_guard BEFORE UPDATE OR DELETE ON support_tickets FOR EACH ROW EXECUTE FUNCTION guard_support_ticket();
CREATE FUNCTION guard_account_data_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Data request history is preserved' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND((to_jsonb(NEW)-ARRAY['revision','state','updated_at','cancelled_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state','updated_at','cancelled_at']) OR OLD.state<>'WAITING_POLICY' OR NEW.state<>'CANCELLED' OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at) THEN
  RAISE EXCEPTION 'Only a traced cancellation is available' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER account_data_request_guard BEFORE UPDATE OR DELETE ON account_data_requests FOR EACH ROW EXECUTE FUNCTION guard_account_data_request();
CREATE TRIGGER support_messages_immutable BEFORE UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER support_attachments_immutable BEFORE UPDATE OR DELETE ON support_message_attachments FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER support_events_immutable BEFORE UPDATE OR DELETE ON support_ticket_events FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER data_request_events_immutable BEFORE UPDATE OR DELETE ON account_data_request_events FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER participation_attestations_immutable BEFORE UPDATE OR DELETE ON participation_attestations FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER account_action_keys_immutable BEFORE UPDATE OR DELETE ON account_action_keys FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
INSERT INTO permissions(id,code) VALUES
 ('14100000-0000-0000-0000-000000000001','identity.profile.read'),('14100000-0000-0000-0000-000000000002','identity.profile.write'),
 ('14100000-0000-0000-0000-000000000003','support.read'),('14100000-0000-0000-0000-000000000004','support.write'),
 ('14100000-0000-0000-0000-000000000005','account.data.read'),('14100000-0000-0000-0000-000000000006','account.data.write'),
 ('14100000-0000-0000-0000-000000000007','attestations.read'),('14100000-0000-0000-0000-000000000008','attestations.issue'),
 ('14100000-0000-0000-0000-000000000011','support.admin.read'),('14100000-0000-0000-0000-000000000012','support.reply'),('14100000-0000-0000-0000-000000000013','support.manage') ON CONFLICT(code) DO NOTHING;
INSERT INTO roles(id,code) VALUES('14100000-0000-0000-0000-000000000100','SUPPORT_OPERATOR') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE
 (r.code='LEARNER' AND p.code IN('identity.profile.read','identity.profile.write','support.read','support.write','account.data.read','account.data.write','attestations.read','attestations.issue'))
 OR(r.code='SUPPORT_OPERATOR' AND p.code IN('support.admin.read','support.reply','support.manage')) ON CONFLICT(role_id,permission_id) WHERE revoked_at IS NULL DO NOTHING;
