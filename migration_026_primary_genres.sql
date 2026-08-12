-- migration_026_primary_genres.sql
-- Creates primary_genres lookup table seeded from Nimbus genre lots
-- Also ensures title_moods junction exists (from migration_025)

CREATE TABLE IF NOT EXISTS primary_genres (
  primary_genre_id   SERIAL PRIMARY KEY,
  primary_genre_name TEXT NOT NULL UNIQUE
);

INSERT INTO primary_genres (primary_genre_name) VALUES
  ('50''s Rock and Pop'),
  ('60''s Rock and Pop'),
  ('80''s Rock and Pop'),
  ('Alternative Rock'),
  ('Ambient'),
  ('Blues'),
  ('Breakbeat'),
  ('Classic Electro'),
  ('Classic Rock'),
  ('Classical'),
  ('Comedy'),
  ('Country'),
  ('Dubstep'),
  ('Film Score - Action'),
  ('Film Score - Adventure'),
  ('Film Score - Comic Light Tension'),
  ('Film Score - Creepy Scary'),
  ('Film Score - Defeated'),
  ('Film Score - Dramatic Builds'),
  ('Film Score - Dramatic Tension'),
  ('Film Score - Epic'),
  ('Film Score - Intrigue'),
  ('Film Score - Light Tension'),
  ('Film Score - Melancholic'),
  ('Film Score - Mysterious'),
  ('Film Score - Tense Beat'),
  ('Film Score - Tense Drone'),
  ('Film Score - Tense Pulse'),
  ('Film Score - Tension'),
  ('Film Score - Uplifting'),
  ('Film Score - Western'),
  ('Film Score - Whimsical'),
  ('Folk'),
  ('Gumshoe'),
  ('Heartland Rock'),
  ('Heavy Metal'),
  ('Hip Hop/Rap'),
  ('House'),
  ('Jazz'),
  ('New Age'),
  ('Old Timey'),
  ('Pop'),
  ('Soul/R&B'),
  ('Techno'),
  ('Trance'),
  ('World/Ethnic')
ON CONFLICT (primary_genre_name) DO NOTHING;

-- Ensure title_moods junction exists (in case migration_025 wasn't applied)
CREATE TABLE IF NOT EXISTS title_moods (
  title_id  INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  mood_id   INTEGER NOT NULL REFERENCES moods(mood_id)   ON DELETE CASCADE,
  PRIMARY KEY (title_id, mood_id)
);
