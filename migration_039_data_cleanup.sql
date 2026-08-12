-- migration_039_data_cleanup.sql
-- Clean up RMOs, KSL duplicates, and Moods

BEGIN;

-- ============================================================
-- RMO CLEANUP
-- ============================================================

-- 1. Fix capitalization on existing correct entries
UPDATE rmo SET name = 'The Handmaid''s Tale' WHERE name = 'The handmaid''s tale';

-- 2. Delete concatenated entries (FileMaker export glitch — two titles smashed together)
DELETE FROM rmo WHERE name IN (
  'BraveheartTitanic',
  'The Da Vinci CodeThe Girl with the Dragon Tattoo',
  'Diamond LifeDuo Tones',
  'GladiatorThe Bourne Supremacy',
  'Alice in WonderlandAlice Through the Looking Glass',
  'Blood Sugar Sex MagicThe Reason',
  'Minutes to MidnightHybrid Theory',
  'Pee-Wee''s Big AdventureDumbo',
  'MoanaBrother Bear',
  'BrothersGold on the CeilingA.M.Alex Clare',
  'The MentalistThe Maze Runner',
  'God Save the QueenAmerican Idiot',
  'The MonkeesThe Partridge Family',
  'How I GoBorn and Raised'
);

-- Re-insert as individual entries
INSERT INTO rmo (name) VALUES
  ('Braveheart'),
  ('Titanic'),
  ('The Da Vinci Code'),
  ('The Girl with the Dragon Tattoo'),
  ('Diamond Life'),
  ('Duo Tones'),
  ('Gladiator'),
  ('The Bourne Supremacy'),
  ('Alice in Wonderland'),
  ('Alice Through the Looking Glass'),
  ('Blood Sugar Sex Magik'),
  ('The Reason'),
  ('Minutes to Midnight'),
  ('Hybrid Theory'),
  ('Pee-Wee''s Big Adventure'),
  ('Dumbo'),
  ('Moana'),
  ('Brother Bear'),
  ('Brothers'),
  ('Gold on the Ceiling'),
  ('A.M.'),
  ('Alex Clare'),
  ('The Mentalist'),
  ('The Maze Runner'),
  ('God Save the Queen'),
  ('American Idiot'),
  ('The Monkees'),
  ('The Partridge Family'),
  ('How I Go'),
  ('Born and Raised')
ON CONFLICT (name) DO NOTHING;

-- 3. Remove near-dupes (keep the cleaner version)
DELETE FROM rmo WHERE name IN (
  'A Handmaid''s tail',         -- misspelling, correct version updated above
  'Lord of the rings',           -- dupe of The Lord Of The Rings
  'Thin Red Line',               -- dupe of The Thin Red Line
  'Americana',                   -- ambiguous, keep Americana (Album)
  'When Did We Get So Dark?',    -- wrong title, correct is How Did We Get So Dark?
  'Mario Odyssey',               -- dupe of Super Mario Odyssey
  'Pokemon (Anime)'              -- dupe of Pokemon
);

-- 4. Remove exact duplicate
DELETE FROM rmo WHERE name = 'Empire of the Sun'
  AND rmo_id NOT IN (SELECT MIN(rmo_id) FROM rmo WHERE name = 'Empire of the Sun');

-- 5. Remove garbage entries
DELETE FROM rmo WHERE name IN (
  'A Miami Nightclub',
  'Disney movie',
  'Jack Daniels',
  'Passengers the Movie',
  'Wild world of sports',
  'The goblin returns spider man',
  'Yung Gravy'
);

-- Add clean versions
INSERT INTO rmo (name) VALUES
  ('Passengers'),
  ('Wide World of Sports')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- KSL CLEANUP
-- ============================================================

-- Remove duplicate KSL entries, keeping the lowest ksl_id per name
DELETE FROM ksl
WHERE ksl_id NOT IN (
  SELECT MIN(ksl_id) FROM ksl GROUP BY ksl_name
);

-- ============================================================
-- MOODS CLEANUP
-- ============================================================

-- 1. Fix corrupted 'Downer' entry (embedded vertical tab )
UPDATE moods
SET mood_name = 'Downer'
WHERE mood_name != 'Downer' AND mood_name ILIKE 'Downer%';

-- 2. Remove bad moods
--    title_moods has ON DELETE CASCADE on mood_id, so junction rows clean up automatically
DELETE FROM moods WHERE mood_name IN (
  'Slutty',        -- inappropriate for professional/B2B use
  'Unique',        -- quality descriptor, not a mood
  'Building',      -- structural descriptor
  'Meandering',    -- structural descriptor
  'Cosmopolitan',  -- setting, not mood
  'Nightclub',     -- setting, not mood
  'Victorious',    -- redundant with Triumphant
  'Contemplative', -- redundant with Reflective + Introspective
  'Sorrowful'      -- redundant with Sad/Melancholic/Somber
);

COMMIT;
