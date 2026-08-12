-- migration_028_fix_subgenres.sql
-- Move sub_genres data into secondary_genres, then drop the duplicate table

INSERT INTO secondary_genres (primary_genre_id, secondary_genre_name)
SELECT primary_genre_id, sub_genre_name
FROM sub_genres
ON CONFLICT (primary_genre_id, secondary_genre_name) DO NOTHING;

DROP TABLE IF EXISTS sub_genres;
