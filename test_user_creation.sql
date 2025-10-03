-- =====================================================
-- TEST: User Creation mit neuem Schema
-- =====================================================

-- Test: Erstelle einen Test-User
INSERT INTO users (
  wallet_address,
  username,
  tickets,
  coins,
  level,
  experience,
  world_id,
  elite_tickets,
  icon_tickets,
  has_premium,
  next_level_exp,
  score,
  tokens,
  clan_id,
  has_xp_pass,
  cards_sold_since_last_purchase,
  avatar_id,
  prestige_points
) VALUES (
  '0x1234567890abcdef1234567890abcdef12345678',
  'testuser123',
  5,
  1000,
  1,
  0,
  'test.world.id',
  2,
  0,
  false,
  100,
  0,
  0,
  null,
  false,
  0,
  1,
  100
);

-- Überprüfe ob der User erstellt wurde
SELECT 
  wallet_address,
  username,
  tickets,
  coins,
  level,
  elite_tickets,
  icon_tickets,
  has_premium,
  score,
  tokens
FROM users 
WHERE wallet_address = '0x1234567890abcdef1234567890abcdef12345678';

-- Test: Lösche den Test-User wieder
-- DELETE FROM users WHERE wallet_address = '0x1234567890abcdef1234567890abcdef12345678';
