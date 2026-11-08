-- P08: progress is not an entitlement, quiz success is not project validation.
CREATE TABLE learning_enrollments (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 course_resource_id UUID NOT NULL,
 course_kind VARCHAR(16) NOT NULL DEFAULT 'COURSE' CHECK(course_kind='COURSE'),
 course_version_id UUID NOT NULL,
 course_version_number INTEGER NOT NULL CHECK(course_version_number>0),
 course_title VARCHAR(240) NOT NULL CHECK(length(btrim(course_title))>0),
 enrolled_locale VARCHAR(2) NOT NULL CHECK(enrolled_locale IN('fr','en')),
 activity_count INTEGER NOT NULL CHECK(activity_count>0 AND activity_count<=10000),
 last_activity_version_id UUID,
 last_visited_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT learning_enrollments_owner_version_uq UNIQUE(owner_id,course_version_id),
 CONSTRAINT learning_enrollments_id_owner_uq UNIQUE(id,owner_id),
 CONSTRAINT learning_enrollments_id_version_uq UNIQUE(id,course_version_id),
 FOREIGN KEY(course_resource_id,course_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT,
 FOREIGN KEY(course_version_id,course_resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND (last_visited_at IS NULL OR (isfinite(last_visited_at) AND last_visited_at>=created_at))),
 CHECK((last_activity_version_id IS NULL)=(last_visited_at IS NULL))
);
CREATE INDEX learning_enrollments_owner_recent_idx ON learning_enrollments(owner_id,last_visited_at DESC,created_at DESC,id);
CREATE TABLE learning_enrollment_activities (
 id UUID PRIMARY KEY,
 enrollment_id UUID NOT NULL,
 course_version_id UUID NOT NULL,
 module_id UUID NOT NULL,
 module_kind VARCHAR(16) NOT NULL DEFAULT 'MODULE' CHECK(module_kind='MODULE'),
 module_version_id UUID NOT NULL,
 activity_id UUID NOT NULL,
 activity_kind VARCHAR(16) NOT NULL DEFAULT 'ACTIVITY' CHECK(activity_kind='ACTIVITY'),
 activity_version_id UUID NOT NULL,
 position INTEGER NOT NULL CHECK(position>0 AND position<=10000),
 activity_title VARCHAR(240) NOT NULL,
 CONSTRAINT learning_items_enrollment_version_uq UNIQUE(enrollment_id,activity_version_id),
 CONSTRAINT learning_items_position_uq UNIQUE(enrollment_id,position),
 FOREIGN KEY(enrollment_id,course_version_id) REFERENCES learning_enrollments(id,course_version_id) ON DELETE RESTRICT,
 FOREIGN KEY(module_id,module_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT,
 FOREIGN KEY(module_version_id,module_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(activity_id,activity_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT,
 FOREIGN KEY(activity_version_id,activity_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(course_version_id,module_version_id) REFERENCES version_compositions(parent_version_id,child_version_id) ON DELETE RESTRICT,
 FOREIGN KEY(module_version_id,activity_version_id) REFERENCES version_compositions(parent_version_id,child_version_id) ON DELETE RESTRICT
);
ALTER TABLE learning_enrollments ADD CONSTRAINT learning_enrollments_last_activity_fk FOREIGN KEY(id,last_activity_version_id)
 REFERENCES learning_enrollment_activities(enrollment_id,activity_version_id) ON DELETE RESTRICT;
CREATE TABLE learning_activity_progress (
 id UUID PRIMARY KEY,
 enrollment_id UUID NOT NULL,
 activity_version_id UUID NOT NULL,
 read_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(enrollment_id,activity_version_id),
 FOREIGN KEY(enrollment_id,activity_version_id) REFERENCES learning_enrollment_activities(enrollment_id,activity_version_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at
   AND (read_at IS NULL OR (isfinite(read_at) AND read_at>=created_at))
   AND (completed_at IS NULL OR (isfinite(completed_at) AND completed_at>=created_at)))
);
CREATE TABLE learning_activity_notes (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 activity_id UUID NOT NULL,
 activity_kind VARCHAR(16) NOT NULL DEFAULT 'ACTIVITY' CHECK(activity_kind='ACTIVITY'),
 activity_version_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 body TEXT NOT NULL CHECK(length(body)<=16000),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,activity_version_id),
 FOREIGN KEY(activity_id,activity_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT,
 FOREIGN KEY(activity_version_id,activity_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE TABLE learning_quiz_attempts (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL,
 submission_id UUID NOT NULL,
 enrollment_id UUID NOT NULL,
 activity_id UUID NOT NULL,
 activity_version_id UUID NOT NULL,
 translation_id UUID NOT NULL,
 revision_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
 score_points INTEGER NOT NULL CHECK(score_points>=0),
 max_points INTEGER NOT NULL CHECK(max_points>0 AND max_points<=20000 AND score_points<=max_points),
 passed BOOLEAN NOT NULL,
 pass_percent INTEGER NOT NULL CHECK(pass_percent BETWEEN 1 AND 100),
 max_attempts INTEGER CHECK(max_attempts BETWEEN 1 AND 50),
 request_fingerprint BYTEA NOT NULL CHECK(octet_length(request_fingerprint)=32),
 quiz_snapshot JSONB NOT NULL CHECK(jsonb_typeof(quiz_snapshot)='array' AND octet_length(quiz_snapshot::text)<=65536),
 answers JSONB NOT NULL CHECK(jsonb_typeof(answers)='array' AND octet_length(answers::text)<=8192),
 results JSONB NOT NULL CHECK(jsonb_typeof(results)='array' AND octet_length(results::text)<=131072),
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(submitted_at)),
 UNIQUE(owner_id,submission_id),
 UNIQUE(owner_id,activity_version_id,attempt_number),
 FOREIGN KEY(enrollment_id,owner_id) REFERENCES learning_enrollments(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_id,activity_version_id) REFERENCES learning_enrollment_activities(enrollment_id,activity_version_id) ON DELETE RESTRICT,
 FOREIGN KEY(activity_version_id,activity_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(translation_id,activity_version_id,locale) REFERENCES content_translations(id,pedagogical_version_id,locale) ON DELETE RESTRICT,
 FOREIGN KEY(revision_id,translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT,
 CHECK(passed=(score_points*100>=max_points*pass_percent)),
 CHECK(max_attempts IS NULL OR attempt_number<=max_attempts)
);
CREATE INDEX learning_quiz_owner_activity_idx ON learning_quiz_attempts(owner_id,activity_version_id,submitted_at DESC,id);

CREATE FUNCTION guard_learning_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Learning history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='learning_enrollment_activities' OR TG_TABLE_NAME='learning_quiz_attempts' THEN
   RAISE EXCEPTION 'Learning snapshots are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='learning_enrollments' THEN
   IF (to_jsonb(NEW)-'last_activity_version_id'-'last_visited_at') IS DISTINCT FROM (to_jsonb(OLD)-'last_activity_version_id'-'last_visited_at') THEN
     RAISE EXCEPTION 'Enrollment snapshot is immutable' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='learning_activity_progress' THEN
   IF NEW.id<>OLD.id OR NEW.enrollment_id<>OLD.enrollment_id OR NEW.activity_version_id<>OLD.activity_version_id OR NEW.created_at<>OLD.created_at THEN
     RAISE EXCEPTION 'Progress identity is immutable' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='learning_activity_notes' THEN
   IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.activity_id<>OLD.activity_id OR NEW.activity_version_id<>OLD.activity_version_id OR NEW.locale<>OLD.locale OR NEW.created_at<>OLD.created_at THEN
     RAISE EXCEPTION 'Note owner, activity and original language are immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER learning_enrollments_snapshot BEFORE UPDATE OR DELETE ON learning_enrollments FOR EACH ROW EXECUTE FUNCTION guard_learning_snapshot();
CREATE TRIGGER learning_items_snapshot BEFORE UPDATE OR DELETE ON learning_enrollment_activities FOR EACH ROW EXECUTE FUNCTION guard_learning_snapshot();
CREATE TRIGGER learning_progress_identity BEFORE UPDATE OR DELETE ON learning_activity_progress FOR EACH ROW EXECUTE FUNCTION guard_learning_snapshot();
CREATE TRIGGER learning_note_identity BEFORE UPDATE OR DELETE ON learning_activity_notes FOR EACH ROW EXECUTE FUNCTION guard_learning_snapshot();
CREATE TRIGGER learning_quiz_snapshot BEFORE UPDATE OR DELETE ON learning_quiz_attempts FOR EACH ROW EXECUTE FUNCTION guard_learning_snapshot();
INSERT INTO permissions(id,code) VALUES
 ('08000000-0000-0000-0000-000000000001','learning.read'),('08000000-0000-0000-0000-000000000002','learning.write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='LEARNER' AND p.code IN('learning.read','learning.write')
 AND NOT EXISTS(SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.revoked_at IS NULL) ON CONFLICT DO NOTHING;
COMMENT ON TABLE learning_enrollments IS 'Version-pinned private tracking, never a paid access entitlement; total counts distinct activity versions.';
COMMENT ON TABLE learning_quiz_attempts IS 'Append-only server-graded quiz snapshots; success does not complete an activity or validate a project.';
