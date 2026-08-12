-- migration_026b_title_moods.sql
-- Creates title_moods using sku_root (avoids title_id FK issue)

CREATE TABLE IF NOT EXISTS title_moods (
  sku_root  VARCHAR(20) NOT NULL,
  mood_id   INTEGER NOT NULL REFERENCES moods(mood_id) ON DELETE CASCADE,
  PRIMARY KEY (sku_root, mood_id)
);
