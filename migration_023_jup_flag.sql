-- migration_023_jup_flag.sql
-- Add is_jup to titles, backfill from teams

ALTER TABLE titles ADD COLUMN IF NOT EXISTS is_jup BOOLEAN NOT NULL DEFAULT false;

UPDATE titles t
SET is_jup = true
FROM teams tm
WHERE t.team_id = tm.team_id
  AND tm.is_jup = true;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE is_jup = true) AS jup_titles,
  COUNT(*) FILTER (WHERE is_jup = false) AS standard_titles,
  COUNT(*) AS total
FROM titles;
