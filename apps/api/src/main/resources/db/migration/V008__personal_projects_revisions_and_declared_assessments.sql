-- P09: personal text and declared evidence, never an entitlement or human review.
CREATE TABLE projects (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 creation_id UUID NOT NULL,
 creation_fingerprint BYTEA NOT NULL CHECK(octet_length(creation_fingerprint)=32),
 source_activity_id UUID NOT NULL,
 source_kind VARCHAR(16) NOT NULL DEFAULT 'ACTIVITY' CHECK(source_kind='ACTIVITY'),
 source_version_id UUID NOT NULL,
 source_translation_id UUID NOT NULL,
 source_revision_id UUID NOT NULL,
 source_locale VARCHAR(2) NOT NULL CHECK(source_locale IN('fr','en')),
 source_title VARCHAR(240) NOT NULL,
 source_slug VARCHAR(180) NOT NULL,
 enrollment_id UUID,
 course_resource_id UUID,
 course_version_id UUID,
 course_title VARCHAR(240),
 current_revision_id UUID,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,creation_id),
 UNIQUE(id,owner_id),
 UNIQUE(id,source_revision_id),
 UNIQUE(id,source_revision_id,source_locale),
 FOREIGN KEY(source_activity_id,source_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT,
 FOREIGN KEY(source_version_id,source_activity_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(source_translation_id,source_version_id,source_locale) REFERENCES content_translations(id,pedagogical_version_id,locale) ON DELETE RESTRICT,
 FOREIGN KEY(source_revision_id,source_translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_id,owner_id) REFERENCES learning_enrollments(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_id,course_version_id) REFERENCES learning_enrollments(id,course_version_id) ON DELETE RESTRICT,
 FOREIGN KEY(enrollment_id,source_version_id) REFERENCES learning_enrollment_activities(enrollment_id,activity_version_id) ON DELETE RESTRICT,
 FOREIGN KEY(course_version_id,course_resource_id) REFERENCES pedagogical_versions(id,resource_id) ON DELETE RESTRICT,
 CHECK((enrollment_id IS NULL AND course_resource_id IS NULL AND course_version_id IS NULL AND course_title IS NULL)
    OR(enrollment_id IS NOT NULL AND course_resource_id IS NOT NULL AND course_version_id IS NOT NULL AND course_title IS NOT NULL)),
 CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE INDEX projects_owner_updated_idx ON projects(owner_id,updated_at DESC,id);
CREATE INDEX projects_source_idx ON projects(source_activity_id,source_version_id);
CREATE TABLE project_revisions (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 revision_number INTEGER NOT NULL CHECK(revision_number>0),
 fields_json JSONB NOT NULL CHECK(jsonb_typeof(fields_json)='object' AND octet_length(fields_json::text)<=65536),
 stage VARCHAR(32) NOT NULL CHECK(stage IN('DRAFT','READY_FOR_SELF_ASSESSMENT')),
 author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(created_at)),
 UNIQUE(project_id,revision_number),
 UNIQUE(id,project_id),
 FOREIGN KEY(project_id,author_id) REFERENCES projects(id,owner_id) ON DELETE RESTRICT
);
ALTER TABLE projects ADD CONSTRAINT projects_current_revision_fk FOREIGN KEY(current_revision_id,id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT;
CREATE TABLE project_rubric_snapshots (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL UNIQUE,
 source_revision_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 case_code VARCHAR(4) NOT NULL CHECK(case_code IN('BR01','BR02')),
 pass_points INTEGER NOT NULL CHECK(pass_points BETWEEN 1 AND 20),
 max_points INTEGER NOT NULL DEFAULT 20 CHECK(max_points=20),
 reveal_policy VARCHAR(24) NOT NULL CHECK(reveal_policy IN('EXPLICIT','AFTER_SUBMISSION')),
 criteria JSONB NOT NULL CHECK(jsonb_typeof(criteria)='array' AND jsonb_array_length(criteria)=20 AND octet_length(criteria::text)<=65536),
 blocking_definitions JSONB NOT NULL CHECK(jsonb_typeof(blocking_definitions)='array' AND jsonb_array_length(blocking_definitions)=4 AND octet_length(blocking_definitions::text)<=8192),
 UNIQUE(id,project_id),
 UNIQUE(id,project_id,pass_points,max_points),
 FOREIGN KEY(project_id,source_revision_id,locale) REFERENCES projects(id,source_revision_id,source_locale) ON DELETE RESTRICT
);
CREATE TABLE project_self_assessments (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL,
 project_id UUID NOT NULL,
 project_revision_id UUID NOT NULL,
 rubric_id UUID NOT NULL,
 submission_id UUID NOT NULL,
 submission_fingerprint BYTEA NOT NULL CHECK(octet_length(submission_fingerprint)=32),
 assessment_number INTEGER NOT NULL CHECK(assessment_number>0),
 method VARCHAR(24) NOT NULL DEFAULT 'SELF_ASSESSMENT' CHECK(method='SELF_ASSESSMENT'),
 score_points INTEGER NOT NULL CHECK(score_points BETWEEN 0 AND 20),
 max_points INTEGER NOT NULL CHECK(max_points=20),
 pass_points INTEGER NOT NULL CHECK(pass_points BETWEEN 1 AND 20),
 threshold_met BOOLEAN NOT NULL,
 needs_revision BOOLEAN NOT NULL,
 answers JSONB NOT NULL CHECK(jsonb_typeof(answers)='array' AND jsonb_array_length(answers)=20 AND octet_length(answers::text)<=65536),
 blocking_declarations JSONB NOT NULL CHECK(jsonb_typeof(blocking_declarations)='array' AND jsonb_array_length(blocking_declarations)=4 AND octet_length(blocking_declarations::text)<=16384),
 blocking_issues JSONB NOT NULL CHECK(jsonb_typeof(blocking_issues)='array' AND octet_length(blocking_issues::text)<=131072),
 comment TEXT NOT NULL CHECK(length(comment)<=4000),
 evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(evaluated_at)),
 author_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 evaluator_id UUID CHECK(evaluator_id IS NULL),
 declared_by_user BOOLEAN NOT NULL DEFAULT true CHECK(declared_by_user),
 UNIQUE(owner_id,submission_id),
 UNIQUE(project_id,assessment_number),
 FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(project_revision_id,project_id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(rubric_id,project_id,pass_points,max_points) REFERENCES project_rubric_snapshots(id,project_id,pass_points,max_points) ON DELETE RESTRICT,
 CHECK(author_id=owner_id),
 CHECK(threshold_met=(score_points>=pass_points)),
 CHECK(needs_revision=(NOT threshold_met OR jsonb_array_length(blocking_issues)>0))
);
CREATE INDEX project_assessments_project_latest_idx ON project_self_assessments(project_id,project_revision_id,assessment_number DESC);
CREATE TABLE project_solution_reveals (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL,
 project_id UUID NOT NULL,
 project_revision_id UUID NOT NULL,
 source_revision_id UUID NOT NULL,
 locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 revealed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(revealed_at)),
 UNIQUE(owner_id,project_revision_id,source_revision_id,locale),
 FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(project_revision_id,project_id) REFERENCES project_revisions(id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,source_revision_id,locale) REFERENCES projects(id,source_revision_id,source_locale) ON DELETE RESTRICT
);
CREATE FUNCTION guard_project_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME<>'projects' THEN RAISE EXCEPTION 'Project revisions and evidence are immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'current_revision_id'-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision_id'-'revision'-'updated_at') THEN
   RAISE EXCEPTION 'Project owner and source origin are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER projects_origin BEFORE UPDATE OR DELETE ON projects FOR EACH ROW EXECUTE FUNCTION guard_project_history();
CREATE TRIGGER project_revisions_immutable BEFORE UPDATE OR DELETE ON project_revisions FOR EACH ROW EXECUTE FUNCTION guard_project_history();
CREATE TRIGGER project_rubrics_immutable BEFORE UPDATE OR DELETE ON project_rubric_snapshots FOR EACH ROW EXECUTE FUNCTION guard_project_history();
CREATE TRIGGER project_assessments_immutable BEFORE UPDATE OR DELETE ON project_self_assessments FOR EACH ROW EXECUTE FUNCTION guard_project_history();
CREATE TRIGGER project_reveals_immutable BEFORE UPDATE OR DELETE ON project_solution_reveals FOR EACH ROW EXECUTE FUNCTION guard_project_history();
INSERT INTO permissions(id,code) VALUES
 ('09000000-0000-0000-0000-000000000001','projects.read'),('09000000-0000-0000-0000-000000000002','projects.write') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
 SELECT gen_random_uuid(),r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='LEARNER' AND p.code IN('projects.read','projects.write')
 AND NOT EXISTS(SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.revoked_at IS NULL) ON CONFLICT DO NOTHING;
COMMENT ON TABLE projects IS 'Owner-controlled personal production. Reading and editing survive source withdrawal. Text ETag does not change when a declaration is added.';
COMMENT ON TABLE project_self_assessments IS 'Versioned self-reported score and blocking declarations; never verification of truth or human review.';
COMMENT ON TABLE project_solution_reveals IS 'Voluntary consultation only; no correction body persisted and current source access must be checked on every delivery.';
