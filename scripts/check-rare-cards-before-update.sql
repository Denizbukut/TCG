-- Check if rare cards exist and how they are linked to market_listings
-- Run this BEFORE running the update script to verify everything

-- Step 1: Check all distinct rarity values in cards table
SELECT 
    'All rarities in cards table' as check_type,
    rarity,
    COUNT(*) as card_count
FROM cards 
GROUP BY rarity 
ORDER BY rarity;

-- Step 2: Check if there are any cards with 'rare' rarity (case-sensitive)
SELECT 
    'Rare cards (exact match)' as check_type,
    COUNT(*) as rare_card_count
FROM cards 
WHERE rarity = 'rare';

-- Step 3: Check if there are any cards with 'rare' rarity (case-insensitive)
SELECT 
    'Rare cards (case-insensitive)' as check_type,
    COUNT(*) as rare_card_count
FROM cards 
WHERE LOWER(rarity) = 'rare';

-- Step 4: Show sample rare cards
SELECT 
    'Sample rare cards' as check_type,
    id,
    name,
    rarity,
    LENGTH(rarity) as rarity_length
FROM cards 
WHERE LOWER(rarity) = 'rare'
LIMIT 10;

-- Step 5: Check active market listings for rare cards
SELECT 
    'Active market listings for rare cards' as check_type,
    COUNT(*) as listing_count,
    MIN(ml.price) as min_price,
    MAX(ml.price) as max_price,
    AVG(ml.price)::numeric(10,2) as avg_price
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active';

-- Step 6: Show sample market listings with rare cards
SELECT 
    'Sample rare card listings' as check_type,
    ml.id as listing_id,
    ml.price as current_price,
    ml.card_level,
    ml.status,
    c.id as card_id,
    c.name as card_name,
    c.rarity as card_rarity
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active'
ORDER BY ml.price ASC
LIMIT 10;

-- Step 7: Check what the UPDATE would change
SELECT 
    'What would be updated' as check_type,
    ml.id as listing_id,
    ml.price as current_price,
    ml.card_level,
    ROUND(0.49 * COALESCE(ml.card_level, 1), 2) as new_price,
    c.name as card_name,
    c.rarity as card_rarity
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active'
AND ml.price != ROUND(0.49 * COALESCE(ml.card_level, 1), 2)  -- Only show cards that would change
ORDER BY ml.card_level ASC
LIMIT 20;

