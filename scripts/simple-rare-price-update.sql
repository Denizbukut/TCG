-- Simple script to update ALL rare cards to minimum price: $0.34 USD = 0.49 WLD per level
-- Price calculation: 0.49 WLD × card_level
--
-- IMPORTANT: Run check-rare-cards-before-update.sql first to verify rare cards exist!

UPDATE market_listings 
SET price = ROUND(0.49 * COALESCE(card_level, 1), 2)
WHERE card_id IN (
    SELECT id 
    FROM cards 
    WHERE LOWER(rarity) = 'rare'  -- Case-insensitive match
) 
AND status = 'active';

-- Show results
SELECT 
    'Rare cards updated' as message,
    COUNT(*) as updated_count,
    MIN(price) as min_wld_price,
    MAX(price) as max_wld_price,
    AVG(price)::numeric(10,2) as avg_wld_price
FROM market_listings ml
JOIN cards c ON ml.card_id = c.id
WHERE LOWER(c.rarity) = 'rare'
AND ml.status = 'active';

