-- migration_030_mood1_and_fixes.sql
-- 1. Add mood_1_id FK column to titles
-- 2. Fix title_moods to use sku_root (migration_025 created it with title_id)
-- 3. Fix title_rmo to use sku_root (migration_025 created it with title_id)

-- Add mood_1_id to titles if not already there
ALTER TABLE titles ADD COLUMN IF NOT EXISTS mood_1_id INTEGER REFERENCES mood_1(mood_1_id);

-- Fix title_moods: if it still has title_id column, drop and recreate with sku_root
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='title_moods' AND column_name='title_id'
  ) THEN
    DROP TABLE IF EXISTS title_moods;
    CREATE TABLE title_moods (
      sku_root  VARCHAR(20) NOT NULL,
      mood_id   INTEGER NOT NULL REFERENCES moods(mood_id) ON DELETE CASCADE,
      PRIMARY KEY (sku_root, mood_id)
    );
  END IF;
END $$;

-- Fix title_rmo: if it still has title_id column, drop and recreate with sku_root
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='title_rmo' AND column_name='title_id'
  ) THEN
    DROP TABLE IF EXISTS title_rmo;
    CREATE TABLE title_rmo (
      sku_root  VARCHAR(20) NOT NULL,
      rmo_id    INTEGER NOT NULL REFERENCES rmo(rmo_id) ON DELETE CASCADE,
      PRIMARY KEY (sku_root, rmo_id)
    );
  END IF;
END $$;
