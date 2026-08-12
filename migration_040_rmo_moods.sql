-- migration_040_rmo_moods.sql
-- Add rmo_moods junction table for triangulated search
-- Links each RMO entry (movie/show/album) to one or more HAUS mood tags

CREATE TABLE IF NOT EXISTS rmo_moods (
  rmo_id   INTEGER NOT NULL REFERENCES rmo(rmo_id)     ON DELETE CASCADE,
  mood_id  INTEGER NOT NULL REFERENCES moods(mood_id)  ON DELETE CASCADE,
  PRIMARY KEY (rmo_id, mood_id)
);

CREATE INDEX IF NOT EXISTS idx_rmo_moods_rmo_id  ON rmo_moods(rmo_id);
CREATE INDEX IF NOT EXISTS idx_rmo_moods_mood_id ON rmo_moods(mood_id);
