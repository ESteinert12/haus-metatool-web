-- migration_036_sku_root_unique.sql
-- Adds UNIQUE constraint on titles.sku_root for safe upsert during import
ALTER TABLE titles ADD CONSTRAINT titles_sku_root_unique UNIQUE (sku_root);
