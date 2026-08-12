-- migration_034_next_seq.sql
-- Adds next_seq counter to teams table (mirrors FileMaker "next SKU number" field)

ALTER TABLE teams ADD COLUMN IF NOT EXISTS next_seq INTEGER NOT NULL DEFAULT 1;
