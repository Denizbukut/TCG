-- Set ALL rare cards in the market to minimum price based on card level
-- Minimum price for rare cards: $0.34 USD = 0.49 WLD per level
-- 
-- Price calculation: 0.49 WLD × card_level
-- Level 1: 0.49 WLD
-- Level 2: 0.98 WLD
-- Level 3: 1.47 WLD
-- etc.

-- ============================================
-- STEP 1: Update all rare cards to minimum price
-- IMPORTANT: Execute this UPDATE statement first!
-- ============================================
UPDATE market_listings 
SET price = ROUND(0.49 * COALESCE(card_level, 1), 2)
WHERE card_id IN (
    SELECT id 
    FROM cards 
    WHERE LOWER(rarity) = 'rare'  -- Case-insensitive match
) 
AND status = 'active';

-- Verify the update was executed
-- Check how many rows were affected (this should show a number > 0)
SELECT 
    'Update completed' as status,
    COUNT(*) as rows_that_would_match
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active';

-- ============================================
-- STEP 2: Show updated listings
-- ============================================
SELECT 
    ml.id,
    ml.price as wld_price,
    ml.card_level,
    c.name,
    c.rarity,
    ml.status,
    ml.created_at
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active'
ORDER BY ml.card_level ASC, ml.price ASC;

-- ============================================
-- STEP 3: Summary statistics
-- ============================================
SELECT 
    'Rare cards summary' as message,
    COUNT(*) as total_active_listings,
    MIN(ml.price) as min_wld_price,
    MAX(ml.price) as max_wld_price,
    AVG(ml.price)::numeric(10,2) as avg_wld_price,
    SUM(CASE WHEN ml.card_level = 1 THEN 1 ELSE 0 END) as level_1_count,
    SUM(CASE WHEN ml.card_level = 2 THEN 1 ELSE 0 END) as level_2_count,
    SUM(CASE WHEN ml.card_level = 3 THEN 1 ELSE 0 END) as level_3_count,
    SUM(CASE WHEN ml.card_level >= 4 THEN 1 ELSE 0 END) as level_4plus_count
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active';

