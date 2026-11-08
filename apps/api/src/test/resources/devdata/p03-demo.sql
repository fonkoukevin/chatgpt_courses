-- Chargement explicite local/test uniquement, hors JAR de production.
-- Aucune identité de connexion, aucun prix, aucune publication.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('chatgpt-courses:P03-demo', 0));

CREATE TEMP TABLE p03_seed_resources(id UUID, kind VARCHAR(16)) ON COMMIT DROP;
INSERT INTO p03_seed_resources VALUES
    ('03000000-0000-4000-8000-000000000001', 'COURSE'),
    ('03000000-0000-4000-8000-000000000002', 'MODULE'),
    ('03000000-0000-4000-8000-000000000003', 'ACTIVITY');

CREATE TEMP TABLE p03_seed_versions(id UUID, resource_id UUID, objectives TEXT, evaluation_definition TEXT) ON COMMIT DROP;
INSERT INTO p03_seed_versions VALUES
    ('03100000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
        'Exemple fictif : préparer une proposition commerciale à partir du dossier BR01.', 'Exemple de critères déclaratifs à relire avant publication.'),
    ('03100000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002',
        'Exemple fictif : comprendre le brief et relever les inconnues.', 'Exemple de points de contrôle, sans évaluation délivrée.'),
    ('03100000-0000-4000-8000-000000000003', '03000000-0000-4000-8000-000000000003',
        'Exemple fictif : distinguer faits et hypothèses.', 'Grille de démonstration à compléter au lot pédagogique.');

CREATE TEMP TABLE p03_seed_compositions(id UUID, parent_version_id UUID, child_version_id UUID, position INTEGER) ON COMMIT DROP;
INSERT INTO p03_seed_compositions VALUES
    ('03200000-0000-4000-8000-000000000001', '03100000-0000-4000-8000-000000000001', '03100000-0000-4000-8000-000000000002', 1),
    ('03200000-0000-4000-8000-000000000002', '03100000-0000-4000-8000-000000000002', '03100000-0000-4000-8000-000000000003', 1);

CREATE TEMP TABLE p03_seed_texts(
    translation_id UUID, revision_id UUID, slug_id UUID, version_id UUID, resource_id UUID,
    resource_kind VARCHAR(16), locale VARCHAR(2), slug VARCHAR(180), title VARCHAR(240), summary TEXT, body TEXT
) ON COMMIT DROP;
INSERT INTO p03_seed_texts VALUES
    ('03400000-0000-4000-8000-000000000001', '03500000-0000-4000-8000-000000000001', '03300000-0000-4000-8000-000000000001',
        '03100000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001', 'COURSE', 'fr', 'proposition-commerciale',
        'Exemple : du brief à la proposition commerciale', 'Dossier fictif BR01. Brouillon de démonstration.', 'Contenu fictif non publié, à compléter et vérifier au lot pédagogique.'),
    ('03400000-0000-4000-8000-000000000002', '03500000-0000-4000-8000-000000000002', '03300000-0000-4000-8000-000000000002',
        '03100000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001', 'COURSE', 'en', 'client-proposal',
        'Example: from brief to client proposal', 'Fictional BR01 case. Demonstration draft.', 'Unpublished fictional content to complete and verify in the learning content phase.'),
    ('03400000-0000-4000-8000-000000000003', '03500000-0000-4000-8000-000000000003', '03300000-0000-4000-8000-000000000003',
        '03100000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002', 'MODULE', 'fr', 'comprendre-le-brief',
        'Exemple : comprendre le brief', 'Démonstration du modèle de données.', 'Brouillon fictif de module, sans vidéo ni promesse de contenu disponible.'),
    ('03400000-0000-4000-8000-000000000004', '03500000-0000-4000-8000-000000000004', '03300000-0000-4000-8000-000000000004',
        '03100000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002', 'MODULE', 'en', 'understand-the-brief',
        'Example: understand the brief', 'Data model demonstration.', 'Fictional module draft with no video or claim of available content.'),
    ('03400000-0000-4000-8000-000000000005', '03500000-0000-4000-8000-000000000005', '03300000-0000-4000-8000-000000000005',
        '03100000-0000-4000-8000-000000000003', '03000000-0000-4000-8000-000000000003', 'ACTIVITY', 'fr', 'faits-et-inconnues',
        'Exemple : repérer les faits et les inconnues', 'Activité fictive en brouillon.', 'Données de démonstration uniquement ; aucune activité terminée ni projet validé.'),
    ('03400000-0000-4000-8000-000000000006', '03500000-0000-4000-8000-000000000006', '03300000-0000-4000-8000-000000000006',
        '03100000-0000-4000-8000-000000000003', '03000000-0000-4000-8000-000000000003', 'ACTIVITY', 'en', 'facts-and-unknowns',
        'Example: identify facts and unknowns', 'Fictional activity draft.', 'Demonstration data only; no completed activity or validated project.');

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM flyway_schema_history WHERE version = '002' AND success) THEN
        RAISE EXCEPTION 'P03_DEMO_MIGRATION_REQUIRED';
    END IF;
    IF EXISTS (SELECT 1 FROM p03_seed_resources s JOIN learning_resources r ON r.id = s.id WHERE r.kind <> s.kind)
        OR EXISTS (SELECT 1 FROM p03_seed_versions s JOIN pedagogical_versions v ON v.id = s.id
            WHERE v.resource_id <> s.resource_id OR v.version_number <> 1)
        OR EXISTS (SELECT 1 FROM p03_seed_versions s JOIN pedagogical_versions v ON v.resource_id = s.resource_id AND v.version_number = 1
            WHERE v.id <> s.id)
        OR EXISTS (SELECT 1 FROM p03_seed_compositions s JOIN version_compositions c ON c.id = s.id
            WHERE c.parent_version_id <> s.parent_version_id OR c.child_version_id <> s.child_version_id)
        OR EXISTS (SELECT 1 FROM p03_seed_compositions s JOIN version_compositions c ON c.parent_version_id = s.parent_version_id
            AND (c.child_version_id = s.child_version_id OR c.position = s.position)
            WHERE c.id <> s.id AND NOT EXISTS (SELECT 1 FROM version_compositions present WHERE present.id = s.id))
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN resource_slugs r ON r.id = s.slug_id
            WHERE r.resource_id <> s.resource_id OR r.resource_kind <> s.resource_kind OR r.locale <> s.locale)
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN resource_slugs r ON
            (r.resource_id = s.resource_id AND r.locale = s.locale) OR
            (r.resource_kind = s.resource_kind AND r.locale = s.locale AND r.slug = s.slug)
            WHERE r.id <> s.slug_id AND NOT EXISTS (SELECT 1 FROM resource_slugs present WHERE present.id = s.slug_id))
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN content_translations t ON t.id = s.translation_id
            WHERE t.pedagogical_version_id <> s.version_id OR t.locale <> s.locale)
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN content_translations t ON t.pedagogical_version_id = s.version_id AND t.locale = s.locale
            WHERE t.id <> s.translation_id)
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN editorial_revisions r ON r.id = s.revision_id
            WHERE r.translation_id <> s.translation_id OR r.revision_number <> 1 OR r.title <> s.title OR r.summary <> s.summary OR r.body <> s.body)
        OR EXISTS (SELECT 1 FROM p03_seed_texts s JOIN editorial_revisions r ON r.translation_id = s.translation_id AND r.revision_number = 1
            WHERE r.id <> s.revision_id)
    THEN
        RAISE EXCEPTION 'P03_DEMO_ID_COLLISION';
    END IF;
END;
$$;

INSERT INTO learning_resources(id, kind) SELECT id, kind FROM p03_seed_resources ON CONFLICT (id) DO NOTHING;
INSERT INTO pedagogical_versions(id, resource_id, version_number, objectives, evaluation_definition)
    SELECT id, resource_id, 1, objectives, evaluation_definition FROM p03_seed_versions ON CONFLICT (id) DO NOTHING;
INSERT INTO version_compositions(id, parent_version_id, child_version_id, position)
    SELECT s.id, s.parent_version_id, s.child_version_id, s.position FROM p03_seed_compositions s
    WHERE NOT EXISTS (SELECT 1 FROM version_compositions existing WHERE existing.id = s.id)
    ON CONFLICT (id) DO NOTHING;
INSERT INTO resource_slugs(id, resource_id, resource_kind, locale, slug)
    SELECT slug_id, resource_id, resource_kind, locale, slug FROM p03_seed_texts ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    s RECORD;
    inserted_translation UUID;
BEGIN
    FOR s IN SELECT * FROM p03_seed_texts LOOP
        inserted_translation := NULL;
        INSERT INTO content_translations(id, pedagogical_version_id, locale, editorial_state)
            VALUES (s.translation_id, s.version_id, s.locale, 'DRAFT')
            ON CONFLICT (id) DO NOTHING RETURNING id INTO inserted_translation;
        INSERT INTO editorial_revisions(id, translation_id, revision_number, title, summary, body, author_id)
            VALUES (s.revision_id, s.translation_id, 1, s.title, s.summary, s.body, NULL)
            ON CONFLICT (id) DO NOTHING;
        -- Seule la ligne créée par cet appel reçoit son premier pointeur.
        -- Une traduction existante, même sans pointeur, n'est jamais écrasée.
        IF inserted_translation IS NOT NULL THEN
            UPDATE content_translations SET current_revision_id = s.revision_id WHERE id = inserted_translation;
        END IF;
    END LOOP;
END;
$$;
COMMIT;
