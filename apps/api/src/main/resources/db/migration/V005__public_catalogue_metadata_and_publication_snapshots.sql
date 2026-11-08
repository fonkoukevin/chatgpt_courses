-- P06 public catalogue metadata belongs to the immutable editorial snapshot.
CREATE TABLE editorial_public_metadata (
    revision_id UUID PRIMARY KEY REFERENCES editorial_revisions(id) ON DELETE RESTRICT,
    metadata_json JSONB NOT NULL CHECK(jsonb_typeof(metadata_json)='object' AND octet_length(metadata_json::text)<=32768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(isfinite(created_at))
);
CREATE TRIGGER editorial_public_metadata_immutable BEFORE UPDATE OR DELETE ON editorial_public_metadata
    FOR EACH ROW EXECUTE FUNCTION reject_editorial_revision_mutation();

ALTER TABLE content_translations ADD COLUMN published_verified_at TIMESTAMPTZ;
ALTER TABLE content_translations ADD COLUMN published_source_revision_id UUID;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_published_source_fk
    FOREIGN KEY(published_source_revision_id,source_translation_id) REFERENCES editorial_revisions(id,translation_id) ON DELETE RESTRICT;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_published_verified_ck
    CHECK(published_verified_at IS NULL OR (isfinite(published_verified_at) AND published_verified_at>=created_at));

-- A PUBLISHED row has just copied its reviewed snapshot. For other workflow states,
-- retain an honest historical review date from the journal if available. Never guess
-- an examined source revision from an un-published pending review.
UPDATE content_translations t SET
    published_verified_at=CASE WHEN t.editorial_state='PUBLISHED' THEN t.verified_at ELSE
      (SELECT max(checked.created_at) FROM editorial_events checked
       WHERE checked.translation_id=t.id AND checked.revision_id=t.published_revision_id AND checked.event_type='READY'
         AND checked.created_at<=(SELECT max(published.created_at) FROM editorial_events published
             WHERE published.translation_id=t.id AND published.revision_id=t.published_revision_id AND published.event_type='PUBLISH')) END,
    published_source_revision_id=CASE WHEN t.editorial_state='PUBLISHED' THEN t.reviewed_source_revision_id ELSE NULL END
WHERE t.published_revision_id IS NOT NULL;

COMMENT ON TABLE editorial_public_metadata IS 'Append-only localized public description of one editorial revision; no prices or availability invented.';
COMMENT ON COLUMN content_translations.published_verified_at IS 'Review date captured by publication, never the review date of an un-published draft.';
COMMENT ON COLUMN content_translations.published_source_revision_id IS 'Examined source revision captured at publication; READY alone must never release a stale published body.';
