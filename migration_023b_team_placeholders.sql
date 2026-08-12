-- Create placeholder team rows for unmatched composer_full_ids
-- These satisfy the FK and can be backfilled with real data later

INSERT INTO teams (team_id, composer_prefix, composer_full_id, status)
SELECT
  'TM_' || regexp_replace(sku_root, '[0-9]+$', '') AS team_id,
  regexp_replace(regexp_replace(sku_root, '[0-9]+$', ''), '[a-z]+$', '') AS composer_prefix,
  regexp_replace(sku_root, '[0-9]+$', '') AS composer_full_id,
  'PLACEHOLDER'
FROM (
  SELECT DISTINCT regexp_replace(sku_root, '[0-9]+$', '') AS sku_root
  FROM titles
  WHERE team_id IS NULL
) unmatched
ON CONFLICT (team_id) DO NOTHING;

-- Now link the titles
UPDATE titles t
SET team_id = 'TM_' || regexp_replace(t.sku_root, '[0-9]+$', '')
FROM teams tm
WHERE tm.composer_full_id = regexp_replace(t.sku_root, '[0-9]+$', '')
  AND t.team_id IS NULL;
