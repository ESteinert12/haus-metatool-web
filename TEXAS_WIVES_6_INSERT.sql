-- Texas Wives 6 - Insert Missing 15 Songs
-- Run this in your database to add the metadata

-- First, get the lot_id for Texas Wives 6
-- SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' OR description ILIKE '%260729%';
-- Then replace LOT_ID_HERE below with the actual ID

-- IF YOU DON'T KNOW THE LOT_ID, RUN THIS FIRST:
-- SELECT id, name FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' OR description ILIKE '%260729%';

-- Insert the 15 missing songs (adjust LOT_ID_HERE):
INSERT INTO titles (lot_id, sku, title, key, composers, bpm_target) VALUES
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5624', 'Breaking Ground', 'A', 'R48a', 60),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5634', 'Buck Eyes', 'G', 'R48a', 125),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5644', 'Buckle Up Cowboy', 'TEX', 'R48a', 130),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5654', 'Diamond Boots', 'Fsharp', 'R48a', 130),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5664', 'Stompin'' Out', 'G', 'R48a', 130),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5684', 'Midnight Mesa', 'E', 'R48a', 100),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5694', 'Texas Proud', 'G', 'R48a', 130),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R48a5734', 'Making My Day', 'TEX', 'R48a', 91),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R82a8904', 'Midnight Confession', 'A', 'R82a', 68),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'R85c0044', 'High Beaming', 'C', 'R85c', 120),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'S20d1194', 'Pickin Daisy', 'G', 'S20D', 120),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'S33a49234', 'We Can''t Hide Away', 'Csharpm', 'S33a', 67),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'S73r1314', 'Breachball', 'D', 'S73r', 77),
((SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1), 'T55a0154', 'Heartland Hustle', 'Fsharpm', 'T55a', 75)
ON CONFLICT (sku) DO NOTHING;

-- Verify insert
SELECT COUNT(*) as songs_in_tw6 FROM titles WHERE lot_id = (SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' LIMIT 1);

-- Expected result: 31 (if all inserts worked)
