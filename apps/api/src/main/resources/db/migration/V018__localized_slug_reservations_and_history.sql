-- A localized URL remains owned by its original stable resource. Aliases never form chains.
CREATE TABLE resource_slug_reservations (
 resource_kind VARCHAR(16) NOT NULL,locale VARCHAR(2) NOT NULL CHECK(locale IN('fr','en')),
 slug VARCHAR(180) NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),resource_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(created_at)),
 PRIMARY KEY(resource_kind,locale,slug),UNIQUE(resource_kind,locale,slug,resource_id),
 FOREIGN KEY(resource_id,resource_kind) REFERENCES learning_resources(id,kind) ON DELETE RESTRICT
);
INSERT INTO resource_slug_reservations(resource_kind,locale,slug,resource_id,created_at)
 SELECT resource_kind,locale,slug,resource_id,created_at FROM resource_slugs;
ALTER TABLE resource_slugs ADD CONSTRAINT resource_slugs_reserved_origin_fk
 FOREIGN KEY(resource_kind,locale,slug,resource_id) REFERENCES resource_slug_reservations(resource_kind,locale,slug,resource_id) ON DELETE RESTRICT;
CREATE TABLE resource_slug_changes (
 id UUID PRIMARY KEY,resource_id UUID NOT NULL,resource_kind VARCHAR(16) NOT NULL,locale VARCHAR(2) NOT NULL,
 previous_slug VARCHAR(180) NOT NULL,next_slug VARCHAR(180) NOT NULL,actor_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
 reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),change_number BIGINT NOT NULL CHECK(change_number>0),
 created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),CHECK(previous_slug<>next_slug),UNIQUE(resource_id,locale,change_number),
 FOREIGN KEY(resource_kind,locale,previous_slug,resource_id) REFERENCES resource_slug_reservations(resource_kind,locale,slug,resource_id) ON DELETE RESTRICT,
 FOREIGN KEY(resource_kind,locale,next_slug,resource_id) REFERENCES resource_slug_reservations(resource_kind,locale,slug,resource_id) ON DELETE RESTRICT
);
CREATE TRIGGER slug_reservation_history BEFORE UPDATE OR DELETE ON resource_slug_reservations FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE TRIGGER slug_change_history BEFORE UPDATE OR DELETE ON resource_slug_changes FOR EACH ROW EXECUTE FUNCTION reject_commerce_history_mutation();
CREATE FUNCTION guard_canonical_slug_origin() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Canonical slug history is preserved' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.resource_id,NEW.resource_kind,NEW.locale,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.resource_id,OLD.resource_kind,OLD.locale,OLD.created_at)
    OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Canonical slug origin and revision are protected' USING ERRCODE='23514';END IF;
 END IF;
 INSERT INTO resource_slug_reservations(resource_kind,locale,slug,resource_id) VALUES(NEW.resource_kind,NEW.locale,NEW.slug,NEW.resource_id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM resource_slug_reservations WHERE resource_kind=NEW.resource_kind AND locale=NEW.locale AND slug=NEW.slug AND resource_id=NEW.resource_id)
 THEN RAISE EXCEPTION 'Localized slug is reserved' USING ERRCODE='23505';END IF;
 RETURN NEW;END;$$;
CREATE TRIGGER canonical_slug_origin BEFORE INSERT OR UPDATE OR DELETE ON resource_slugs FOR EACH ROW EXECUTE FUNCTION guard_canonical_slug_origin();
