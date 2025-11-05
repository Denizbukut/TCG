-- UPDATE ONLY - This script ONLY updates prices, no SELECT statements
-- Set ALL rare cards to minimum price: 0.49 WLD × card_level

UPDATE market_listings 
SET price = ROUND(0.49 * COALESCE(card_level, 1), 2)
WHERE card_id IN (
    SELECT id 
    FROM cards 
    WHERE LOWER(rarity) = 'rare'
) 
AND status = 'active';

