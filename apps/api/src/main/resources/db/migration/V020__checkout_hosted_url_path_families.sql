-- Keep immutable Checkout records intact; replace only the V013 URL-family CHECK.
-- Discover its name from its exact columns and expression, not its generated ordinal.
DO $checkout_url_v020$
DECLARE
    target_table regclass := 'checkout_operations'::regclass;
    candidate_names text[];
BEGIN
    SELECT array_agg(c.conname::text ORDER BY c.conname)
      INTO candidate_names
      FROM pg_constraint c
     WHERE c.conrelid = target_table
       AND c.contype = 'c'
       AND c.convalidated
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM unnest(c.conkey) AS key(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum)
           = ARRAY['session_id', 'session_url']::text[]
       AND regexp_replace(replace(pg_get_expr(c.conbin, c.conrelid), '::text', ''), '[[:space:]()]', '', 'g')
           = 'session_urlISNULLORsession_idISNOTNULLANDsession_url~''^https://checkout[.]stripe[.]com/c/pay/''';

    IF coalesce(cardinality(candidate_names), 0) <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one unchanged V013 Checkout URL constraint';
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target_table, candidate_names[1]);
    EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT checkout_operations_hosted_url_v020 CHECK (session_url IS NULL OR (session_id IS NOT NULL AND session_url ~ %L))',
        target_table, '^https://checkout[.]stripe[.]com/(c|g)/pay/');
END $checkout_url_v020$;
