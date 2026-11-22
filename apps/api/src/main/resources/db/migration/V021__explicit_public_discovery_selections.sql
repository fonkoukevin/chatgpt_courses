-- Discovery approval is separate from publication, purchase terms and access.
-- No existing publication or offer is approved implicitly; no business row is rewritten.
CREATE TABLE editorial_public_selections (
 revision_id UUID NOT NULL REFERENCES editorial_revisions(id) ON DELETE RESTRICT,
 selection_revision BIGINT NOT NULL CHECK(selection_revision BETWEEN 1 AND 9007199254740991),
 provenance VARCHAR(12) NOT NULL CHECK(provenance IN('EDITORIAL','RECIPE')),
 approved BOOLEAN NOT NULL CHECK(NOT approved OR provenance='EDITORIAL'),
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 PRIMARY KEY(revision_id,selection_revision)
);
CREATE TABLE offer_public_selections (
 revision_id UUID NOT NULL REFERENCES offer_revisions(id) ON DELETE RESTRICT,
 selection_revision BIGINT NOT NULL CHECK(selection_revision BETWEEN 1 AND 9007199254740991),
 provenance VARCHAR(12) NOT NULL CHECK(provenance IN('EDITORIAL','RECIPE')),
 approved BOOLEAN NOT NULL CHECK(NOT approved OR provenance='EDITORIAL'),
 actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 PRIMARY KEY(revision_id,selection_revision)
);
CREATE TRIGGER editorial_public_selections_immutable BEFORE UPDATE OR DELETE ON editorial_public_selections
 FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER offer_public_selections_immutable BEFORE UPDATE OR DELETE ON offer_public_selections
 FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
