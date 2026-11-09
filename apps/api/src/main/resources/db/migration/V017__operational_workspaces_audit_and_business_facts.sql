-- P15: operational metadata and observed business facts, never a second payment engine.
CREATE TABLE support_workspaces (
 ticket_id UUID PRIMARY KEY REFERENCES support_tickets(id) ON DELETE RESTRICT,
 assignee_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 updated_at TIMESTAMPTZ NOT NULL CHECK(isfinite(updated_at))
);
CREATE TABLE support_reply_drafts (
 ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),body TEXT NOT NULL CHECK(length(body)<=8000),
 state VARCHAR(12) NOT NULL CHECK(state IN('EMPTY','DRAFT','PUBLISHED')),published_message_id UUID REFERENCES support_messages(id) ON DELETE RESTRICT,
 updated_at TIMESTAMPTZ NOT NULL CHECK(isfinite(updated_at)),PRIMARY KEY(ticket_id,author_id),CHECK(state<>'PUBLISHED' OR published_message_id IS NOT NULL)
);
CREATE TABLE support_internal_notes (
 id UUID PRIMARY KEY,ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 body TEXT NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),entry_number BIGINT NOT NULL CHECK(entry_number>0),created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),UNIQUE(ticket_id,entry_number)
);
CREATE TABLE support_time_entries (
 id UUID PRIMARY KEY,ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 0 AND 1440),reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),
 entry_number BIGINT NOT NULL CHECK(entry_number>0),created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),UNIQUE(ticket_id,entry_number)
);
CREATE TABLE support_reply_publications (
 id UUID PRIMARY KEY,ticket_id UUID NOT NULL,author_id UUID NOT NULL,draft_revision BIGINT NOT NULL CHECK(draft_revision>0),
 message_id UUID NOT NULL UNIQUE REFERENCES support_messages(id) ON DELETE RESTRICT,published_at TIMESTAMPTZ NOT NULL CHECK(isfinite(published_at)),
 FOREIGN KEY(ticket_id,author_id) REFERENCES support_reply_drafts(ticket_id,author_id) ON DELETE RESTRICT,UNIQUE(ticket_id,author_id,draft_revision)
);
CREATE TABLE editorial_cases (
 id UUID PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),ticket_id UUID REFERENCES support_tickets(id) ON DELETE RESTRICT,
 resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE RESTRICT,version_id UUID NOT NULL,translation_id UUID NOT NULL,
 source_revision_id UUID REFERENCES editorial_revisions(id) ON DELETE RESTRICT,locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),title VARCHAR(240) NOT NULL,
 state VARCHAR(16) NOT NULL CHECK(state IN('OPEN','IN_PROGRESS','RESOLVED','DISMISSED')),assignee_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,
 corrected_revision_id UUID REFERENCES editorial_revisions(id) ON DELETE RESTRICT,created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(version_id,resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(translation_id,version_id,locale) REFERENCES content_translations(id,pedagogical_version_id,locale) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at),CHECK(state<>'RESOLVED' OR corrected_revision_id IS NOT NULL)
);
CREATE UNIQUE INDEX editorial_case_ticket_uq ON editorial_cases(ticket_id,resource_id,version_id,locale) WHERE ticket_id IS NOT NULL;
CREATE TABLE editorial_case_events (
 id UUID PRIMARY KEY,case_id UUID NOT NULL REFERENCES editorial_cases(id) ON DELETE RESTRICT,actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 action VARCHAR(20) NOT NULL CHECK(action IN('CREATE','UPDATE')),reason VARCHAR(2000) NOT NULL CHECK(length(btrim(reason))>0),
 corrected_revision_id UUID REFERENCES editorial_revisions(id) ON DELETE RESTRICT,entry_number BIGINT NOT NULL CHECK(entry_number>0),
 created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),UNIQUE(case_id,entry_number)
);
CREATE TABLE operations_audit (
 id UUID PRIMARY KEY,actor_id UUID REFERENCES user_accounts(id) ON DELETE RESTRICT,action VARCHAR(48) NOT NULL,
 object_type VARCHAR(32) NOT NULL,object_id UUID NOT NULL,reason_code VARCHAR(40) NOT NULL,result VARCHAR(32) NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(occurred_at))
);
CREATE INDEX operations_audit_time_idx ON operations_audit(occurred_at DESC,id);
CREATE TABLE operations_action_keys (
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,scope VARCHAR(40) NOT NULL,idempotency_key UUID NOT NULL,
 request_fingerprint BYTEA NOT NULL CHECK(octet_length(request_fingerprint)=32),result_kind VARCHAR(32) NOT NULL,result_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),PRIMARY KEY(actor_id,scope,idempotency_key)
);
CREATE TABLE operations_activity_starts (
 enrollment_id UUID NOT NULL,activity_version_id UUID NOT NULL,owner_id UUID NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(occurred_at)),PRIMARY KEY(enrollment_id,activity_version_id),
 FOREIGN KEY(enrollment_id,owner_id) REFERENCES learning_enrollments(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_id,activity_version_id) REFERENCES learning_enrollment_activities(enrollment_id,activity_version_id) ON DELETE RESTRICT
);
CREATE TABLE operations_personal_revision_events (
 object_type VARCHAR(12) NOT NULL CHECK(object_type IN('METHOD','NOTE','PROJECT')),object_id UUID NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 occurred_at TIMESTAMPTZ NOT NULL CHECK(isfinite(occurred_at)),PRIMARY KEY(object_type,object_id,revision)
);
CREATE INDEX operational_starts_time_idx ON operations_activity_starts(occurred_at);
CREATE INDEX operational_saves_time_idx ON operations_personal_revision_events(occurred_at);
CREATE FUNCTION guard_operational_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operational history is preserved' USING ERRCODE='23514';END IF;
 IF NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Operational revision must advance' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='support_workspaces' THEN IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN RAISE EXCEPTION 'Workspace origin is immutable' USING ERRCODE='23514';END IF;END IF;
 IF TG_TABLE_NAME='support_reply_drafts' THEN IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'Draft origin is immutable' USING ERRCODE='23514';END IF;END IF;
 IF TG_TABLE_NAME='editorial_cases' AND(to_jsonb(NEW)-ARRAY['revision','state','assignee_id','corrected_revision_id','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state','assignee_id','corrected_revision_id','updated_at']) THEN RAISE EXCEPTION 'Case origin is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;END;$$;
CREATE FUNCTION guard_support_publication_origin() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.published_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM support_messages m WHERE m.id=NEW.published_message_id AND m.ticket_id=NEW.ticket_id AND m.actor_id=NEW.author_id AND m.author_kind='SUPPORT') THEN RAISE EXCEPTION 'Draft publication must belong to its ticket and author' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER support_draft_publication_origin BEFORE INSERT OR UPDATE ON support_reply_drafts FOR EACH ROW EXECUTE FUNCTION guard_support_publication_origin();
CREATE TRIGGER support_assignment_revision BEFORE UPDATE OR DELETE ON support_workspaces FOR EACH ROW EXECUTE FUNCTION guard_operational_revision();
CREATE TRIGGER support_draft_revision BEFORE UPDATE OR DELETE ON support_reply_drafts FOR EACH ROW EXECUTE FUNCTION guard_operational_revision();
CREATE TRIGGER editorial_case_revision BEFORE UPDATE OR DELETE ON editorial_cases FOR EACH ROW EXECUTE FUNCTION guard_operational_revision();
CREATE TRIGGER support_notes_history BEFORE UPDATE OR DELETE ON support_internal_notes FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER support_time_history BEFORE UPDATE OR DELETE ON support_time_entries FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER support_publication_history BEFORE UPDATE OR DELETE ON support_reply_publications FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER editorial_case_history BEFORE UPDATE OR DELETE ON editorial_case_events FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER operations_audit_history BEFORE UPDATE OR DELETE ON operations_audit FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER operations_keys_history BEFORE UPDATE OR DELETE ON operations_action_keys FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER operations_starts_history BEFORE UPDATE OR DELETE ON operations_activity_starts FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER operations_saves_history BEFORE UPDATE OR DELETE ON operations_personal_revision_events FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
INSERT INTO permissions(id,code) VALUES
 ('15100000-0000-0000-0000-000000000001','operations.read'),('15100000-0000-0000-0000-000000000002','operations.incidents.read'),
 ('15100000-0000-0000-0000-000000000003','commerce.orders.admin.read'),('15100000-0000-0000-0000-000000000004','operations.audit.read'),
 ('15100000-0000-0000-0000-000000000005','operations.metrics.read'),('15100000-0000-0000-0000-000000000006','operations.metrics.export'),
 ('15100000-0000-0000-0000-000000000007','support.assign'),('15100000-0000-0000-0000-000000000008','support.drafts'),
 ('15100000-0000-0000-0000-000000000009','support.internal.read'),('15100000-0000-0000-0000-000000000010','support.internal.write'),
 ('15100000-0000-0000-0000-000000000011','support.time.read'),('15100000-0000-0000-0000-000000000012','support.time.write'),
 ('15100000-0000-0000-0000-000000000013','content.cases.read'),('15100000-0000-0000-0000-000000000014','content.cases.manage') ON CONFLICT(code) DO NOTHING;
INSERT INTO roles(id,code) VALUES('15100000-0000-0000-0000-000000000100','OPERATIONS_READER'),('15100000-0000-0000-0000-000000000101','OPERATIONS_MANAGER') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id) SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE
 (r.code IN('OPERATIONS_READER','OPERATIONS_MANAGER') AND p.code IN('operations.read','operations.incidents.read','commerce.orders.admin.read','operations.audit.read','operations.metrics.read','notifications.read','payments.events.read','refunds.admin.read','support.admin.read','content.cases.read')) OR
 (r.code='OPERATIONS_MANAGER' AND p.code IN('operations.metrics.export','payments.events.retry','notifications.manage','refunds.reconcile','support.assign','support.drafts','support.reply','support.manage','support.internal.read','support.internal.write','support.time.read','support.time.write','content.cases.manage','commerce.offers.read','commerce.offers.write','commerce.offers.activate')) OR
 (r.code='SUPPORT_OPERATOR' AND p.code IN('support.assign','support.drafts','support.internal.read','support.internal.write','support.time.read','support.time.write')) OR
 (r.code='EDITOR' AND p.code IN('content.cases.read','content.cases.manage')) ON CONFLICT(role_id,permission_id) WHERE revoked_at IS NULL DO NOTHING;
