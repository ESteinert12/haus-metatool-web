-- ============================================================
-- migration_025_core_schema.sql
-- Core tables: lots, titles, mix_stems, moods, rmo
-- Safe to run over existing migrations (all IF NOT EXISTS)
-- ============================================================

-- ── LOTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lots (
  lot_id      SERIAL PRIMARY KEY,
  lot_name    TEXT NOT NULL UNIQUE,
  lot_type    TEXT NOT NULL DEFAULT 'intake',  -- 'intake' | 'genre' | 'custom'
  status      TEXT NOT NULL DEFAULT 'active',
  song_count  INT  NOT NULL DEFAULT 0,
  client      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TITLES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS titles (
  title_id    SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  key         VARCHAR(5),
  sku         VARCHAR(30) UNIQUE,
  sku_root    VARCHAR(20),
  team_id     VARCHAR(10) REFERENCES teams(team_id),
  lot_id      INTEGER REFERENCES lots(lot_id),
  genre       TEXT,
  ksl         TEXT,     -- Kinda Sounds Like
  mmw         TEXT,     -- Makes Me Wanna
  bpm         INTEGER,
  tempo       TEXT,
  is_jup      BOOLEAN NOT NULL DEFAULT false,
  status      TEXT NOT NULL DEFAULT 'active',
  date_added  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_titles_team    ON titles(team_id);
CREATE INDEX IF NOT EXISTS idx_titles_lot     ON titles(lot_id);
CREATE INDEX IF NOT EXISTS idx_titles_is_jup  ON titles(is_jup);
CREATE INDEX IF NOT EXISTS idx_titles_status  ON titles(status);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_titles_fts ON titles
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(genre,'') || ' ' || coalesce(ksl,'') || ' ' || coalesce(mmw,'')));

-- ── MIX STEMS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mix_stems (
  stem_id    SERIAL PRIMARY KEY,
  title_id   INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  version    TEXT NOT NULL,   -- FULL, ALT, BUMPER, STING, STINGa, DNB, NoDNB
  filename   TEXT NOT NULL,
  filepath   TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mix_stems_title ON mix_stems(title_id);

-- ── MOODS (lookup) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moods (
  mood_id    SERIAL PRIMARY KEY,
  mood_name  TEXT NOT NULL UNIQUE
);

INSERT INTO moods (mood_name) VALUES
  ('Action'),('Adventure'),('Aggressive'),('Ambient'),('Anxious'),
  ('Atmospheric'),('Bold'),('Bright'),('Building'),('Calm'),
  ('Carefree'),('Celebratory'),('Cinematic'),('Cold'),('Comic'),
  ('Confident'),('Dark'),('Dreamy'),('Driving'),('Edgy'),
  ('Elegant'),('Emotional'),('Energetic'),('Eerie'),('Epic'),
  ('Euphoric'),('Exciting'),('Foreboding'),('Fun'),('Funky'),
  ('Gritty'),('Happy'),('Heavy'),('Hopeful'),('Humorous'),
  ('Inspirational'),('Intense'),('Laid-Back'),('Light'),('Lush'),
  ('Melancholic'),('Menacing'),('Minimal'),('Moody'),('Mysterious'),
  ('Nostalgic'),('Peaceful'),('Playful'),('Positive'),('Powerful'),
  ('Quirky'),('Reflective'),('Relaxed'),('Romantic'),('Sad'),
  ('Sensual'),('Serious'),('Sinister'),('Soulful'),('Spacious'),
  ('Suspenseful'),('Tender'),('Tense'),('Triumphant'),('Upbeat'),
  ('Uplifting'),('Urgent'),('Warm'),('Weird')
ON CONFLICT (mood_name) DO NOTHING;

-- ── TITLE MOODS (junction) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS title_moods (
  title_id  INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  mood_id   INTEGER NOT NULL REFERENCES moods(mood_id)   ON DELETE CASCADE,
  PRIMARY KEY (title_id, mood_id)
);

-- ── RMO — Reminds Me Of (lookup) ────────────────────────────
CREATE TABLE IF NOT EXISTS rmo (
  rmo_id  SERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE
);

-- ── TITLE RMO (junction) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS title_rmo (
  title_id  INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  rmo_id    INTEGER NOT NULL REFERENCES rmo(rmo_id)      ON DELETE CASCADE,
  PRIMARY KEY (title_id, rmo_id)
);

-- ── SOURCEAUDIO UPLOADS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sourceaudio_uploads (
  upload_id    SERIAL PRIMARY KEY,
  title_id     INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  uploaded_at  TIMESTAMPTZ,
  sa_track_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'   -- pending | uploaded | failed
);

-- ── PRO REGISTRATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_registrations (
  reg_id       SERIAL PRIMARY KEY,
  title_id     INTEGER NOT NULL REFERENCES titles(title_id) ON DELETE CASCADE,
  pro          TEXT NOT NULL,    -- ASCAP | BMI | SESAC | SOCAN | PRS | GEMA
  work_number  TEXT,
  registered_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'pending'   -- pending | registered | failed
);

CREATE INDEX IF NOT EXISTS idx_pro_reg_title ON pro_registrations(title_id);
