package com.chatgptcourses.catalog.service;

/** Fixed discovery predicates only. They are never used to grant or withdraw learner access. */
public final class PublicSelectionSql {
    private PublicSelectionSql() { }

    public static final String CONTENT_SELECTED = editorialRevisionApproved("e.id") + " AND " + treeApproved("v.id", "t.locale", false);
    public static final String CONTENT_DEPENDENCIES_READY = "SELECT " + treeApproved("?", "?", false);
    public static final String OFFER_DEPENDENCIES_READY = offerDependencies();
    public static final String OFFER_SELECTED = """
        EXISTS(SELECT 1 FROM offer_public_selections selection
          WHERE selection.revision_id=r.id AND selection.provenance='EDITORIAL' AND selection.approved
            AND selection.selection_revision=(SELECT max(latest.selection_revision) FROM offer_public_selections latest WHERE latest.revision_id=r.id))
        AND
        """ + OFFER_DEPENDENCIES_READY;

    private static String editorialRevisionApproved(String revision) {
        return "EXISTS(SELECT 1 FROM editorial_public_selections selection WHERE selection.revision_id=" + revision
            + " AND selection.provenance='EDITORIAL' AND selection.approved AND selection.selection_revision="
            + "(SELECT max(latest.selection_revision) FROM editorial_public_selections latest WHERE latest.revision_id=" + revision + "))";
    }

    /** The recursive set terminates even if corrupt legacy data contains a cycle. */
    private static String treeApproved(String version, String locale, boolean includeRoot) {
        String seed = includeRoot ? "SELECT " + version : "SELECT child_version_id FROM version_compositions WHERE parent_version_id=" + version;
        return """
            NOT EXISTS(WITH RECURSIVE discovery_tree(id) AS (
            """ + seed + """
              UNION SELECT c.child_version_id FROM version_compositions c JOIN discovery_tree parent ON parent.id=c.parent_version_id)
              SELECT 1 FROM discovery_tree node JOIN pedagogical_versions dv ON dv.id=node.id
              JOIN learning_resources dr ON dr.id=dv.resource_id
              LEFT JOIN content_translations dt ON dt.pedagogical_version_id=dv.id AND dt.locale=
            """ + locale + """
              LEFT JOIN editorial_revisions de ON de.id=dt.published_revision_id
              LEFT JOIN content_translations ds ON ds.id=dt.source_translation_id
              WHERE dr.archived_at IS NOT NULL OR dt.published_revision_id IS NULL
                OR dt.editorial_state IN('ARCHIVED','STALE') OR de.document_json IS NULL
                OR (dt.source_translation_id IS NOT NULL AND (dt.published_source_revision_id IS DISTINCT FROM ds.current_revision_id OR ds.editorial_state IN('ARCHIVED','STALE')))
                OR NOT
            """ + editorialRevisionApproved("dt.published_revision_id") + ")";
    }

    private static String offerDependencies() {
        return """
            EXISTS(SELECT 1 FROM offer_revision_resources included WHERE included.revision_id=r.id)
            AND jsonb_array_length(CASE WHEN jsonb_typeof(r.fields_json->'locales')='array' THEN r.fields_json->'locales' ELSE '[]'::jsonb END)>0
            AND NOT EXISTS(SELECT 1 FROM offer_revision_resources included
              CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.fields_json->'locales')='array' THEN r.fields_json->'locales' ELSE '[]'::jsonb END) language(locale)
              WHERE included.revision_id=r.id AND NOT
            """ + treeApproved("included.version_id", "language.locale", true) + ")";
    }
}
