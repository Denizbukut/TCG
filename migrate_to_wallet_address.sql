-- =====================================================
-- MIGRATION SCRIPT: Username to Wallet Address Primary Key
-- =====================================================
-- This script migrates the database schema from using username as primary key
-- to using wallet_address as the primary key for user identification.

-- IMPORTANT: This migration should be run in a transaction and tested thoroughly
-- before applying to production data.

BEGIN;

-- =====================================================
-- STEP 1: Backup existing data (optional but recommended)
-- =====================================================
-- Create backup tables before making changes
CREATE TABLE users_backup AS SELECT * FROM users;
CREATE TABLE user_card_instances_backup AS SELECT * FROM user_card_instances;
CREATE TABLE market_listings_backup AS SELECT * FROM market_listings;
CREATE TABLE claimed_rewards_backup AS SELECT * FROM claimed_rewards;
CREATE TABLE deal_interactions_backup AS SELECT * FROM deal_interactions;
CREATE TABLE deal_purchases_backup AS SELECT * FROM deal_purchases;
CREATE TABLE premium_passes_backup AS SELECT * FROM premium_passes;
CREATE TABLE referrals_backup AS SELECT * FROM referrals;
CREATE TABLE special_deal_purchases_backup AS SELECT * FROM special_deal_purchases;
CREATE TABLE ticket_purchases_backup AS SELECT * FROM ticket_purchases;
CREATE TABLE xp_passes_backup AS SELECT * FROM xp_passes;

-- =====================================================
-- STEP 2: Validate data integrity before migration
-- =====================================================
-- Check for users without wallet addresses
SELECT COUNT(*) as users_without_wallet FROM users WHERE walletaddress IS NULL OR walletaddress = '';

-- Check for duplicate wallet addresses
SELECT walletaddress, COUNT(*) as count 
FROM users 
WHERE walletaddress IS NOT NULL AND walletaddress != ''
GROUP BY walletaddress 
HAVING COUNT(*) > 1;

-- =====================================================
-- STEP 3: Drop foreign key constraints temporarily
-- =====================================================
ALTER TABLE claimed_rewards DROP CONSTRAINT IF EXISTS claimed_rewards_user_id_fkey;
ALTER TABLE deal_interactions DROP CONSTRAINT IF EXISTS deal_interactions_user_id_fkey;
ALTER TABLE deal_purchases DROP CONSTRAINT IF EXISTS deal_purchases_user_id_fkey;
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_seller_id_fkey;
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_buyer_id_fkey;
ALTER TABLE premium_passes DROP CONSTRAINT IF EXISTS premium_passes_user_id_fkey;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referred_username_fkey;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referrer_username_fkey;
ALTER TABLE special_deal_purchases DROP CONSTRAINT IF EXISTS special_deal_purchases_user_id_fkey;
ALTER TABLE ticket_purchases DROP CONSTRAINT IF EXISTS ticket_purchases_username_fkey;
ALTER TABLE user_card_instances DROP CONSTRAINT IF EXISTS user_card_instances_user_id_fkey;
ALTER TABLE xp_passes DROP CONSTRAINT IF EXISTS xp_passes_user_id_fkey;

-- =====================================================
-- STEP 4: Update users table structure
-- =====================================================
-- Add new wallet_address column if it doesn't exist (it already exists as walletaddress)
-- Make wallet_address NOT NULL and UNIQUE
ALTER TABLE users ALTER COLUMN walletaddress SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_walletaddress_unique UNIQUE (walletaddress);

-- Create new primary key constraint on wallet_address
ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (walletaddress);

-- =====================================================
-- STEP 5: Update all foreign key columns to use wallet_address
-- =====================================================

-- Update claimed_rewards table
ALTER TABLE claimed_rewards ADD COLUMN user_wallet_address TEXT;
UPDATE claimed_rewards 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE claimed_rewards.user_id = u.username;
ALTER TABLE claimed_rewards DROP COLUMN user_id;
ALTER TABLE claimed_rewards RENAME COLUMN user_wallet_address TO user_id;

-- Update deal_interactions table
ALTER TABLE deal_interactions ADD COLUMN user_wallet_address TEXT;
UPDATE deal_interactions 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE deal_interactions.user_id = u.username;
ALTER TABLE deal_interactions DROP COLUMN user_id;
ALTER TABLE deal_interactions RENAME COLUMN user_wallet_address TO user_id;

-- Update deal_purchases table
ALTER TABLE deal_purchases ADD COLUMN user_wallet_address TEXT;
UPDATE deal_purchases 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE deal_purchases.user_id = u.username;
ALTER TABLE deal_purchases DROP COLUMN user_id;
ALTER TABLE deal_purchases RENAME COLUMN user_wallet_address TO user_id;

-- Update market_listings table
ALTER TABLE market_listings ADD COLUMN seller_wallet_address TEXT;
ALTER TABLE market_listings ADD COLUMN buyer_wallet_address TEXT;
UPDATE market_listings 
SET seller_wallet_address = u.walletaddress 
FROM users u 
WHERE market_listings.seller_id = u.username;
UPDATE market_listings 
SET buyer_wallet_address = u.walletaddress 
FROM users u 
WHERE market_listings.buyer_id = u.username AND market_listings.buyer_id IS NOT NULL;
ALTER TABLE market_listings DROP COLUMN seller_id;
ALTER TABLE market_listings DROP COLUMN buyer_id;
ALTER TABLE market_listings RENAME COLUMN seller_wallet_address TO seller_id;
ALTER TABLE market_listings RENAME COLUMN buyer_wallet_address TO buyer_id;

-- Update premium_passes table
ALTER TABLE premium_passes ADD COLUMN user_wallet_address TEXT;
UPDATE premium_passes 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE premium_passes.user_id = u.username;
ALTER TABLE premium_passes DROP COLUMN user_id;
ALTER TABLE premium_passes RENAME COLUMN user_wallet_address TO user_id;

-- Update referrals table
ALTER TABLE referrals ADD COLUMN referrer_wallet_address TEXT;
ALTER TABLE referrals ADD COLUMN referred_wallet_address TEXT;
UPDATE referrals 
SET referrer_wallet_address = u.walletaddress 
FROM users u 
WHERE referrals.referrer_username = u.username;
UPDATE referrals 
SET referred_wallet_address = u.walletaddress 
FROM users u 
WHERE referrals.referred_username = u.username;
ALTER TABLE referrals DROP COLUMN referrer_username;
ALTER TABLE referrals DROP COLUMN referred_username;
ALTER TABLE referrals RENAME COLUMN referrer_wallet_address TO referrer_username;
ALTER TABLE referrals RENAME COLUMN referred_wallet_address TO referred_username;

-- Update special_deal_purchases table
ALTER TABLE special_deal_purchases ADD COLUMN user_wallet_address TEXT;
UPDATE special_deal_purchases 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE special_deal_purchases.user_id = u.username;
ALTER TABLE special_deal_purchases DROP COLUMN user_id;
ALTER TABLE special_deal_purchases RENAME COLUMN user_wallet_address TO user_id;

-- Update ticket_purchases table
ALTER TABLE ticket_purchases ADD COLUMN user_wallet_address TEXT;
UPDATE ticket_purchases 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE ticket_purchases.username = u.username;
ALTER TABLE ticket_purchases DROP COLUMN username;
ALTER TABLE ticket_purchases RENAME COLUMN user_wallet_address TO username;

-- Update user_card_instances table
ALTER TABLE user_card_instances ADD COLUMN user_wallet_address TEXT;
UPDATE user_card_instances 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE user_card_instances.user_id = u.username;
ALTER TABLE user_card_instances DROP COLUMN user_id;
ALTER TABLE user_card_instances RENAME COLUMN user_wallet_address TO user_id;

-- Update xp_passes table
ALTER TABLE xp_passes ADD COLUMN user_wallet_address TEXT;
UPDATE xp_passes 
SET user_wallet_address = u.walletaddress 
FROM users u 
WHERE xp_passes.user_id = u.username;
ALTER TABLE xp_passes DROP COLUMN user_id;
ALTER TABLE xp_passes RENAME COLUMN user_wallet_address TO user_id;

-- =====================================================
-- STEP 6: Recreate foreign key constraints
-- =====================================================
ALTER TABLE claimed_rewards ADD CONSTRAINT claimed_rewards_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE deal_interactions ADD CONSTRAINT deal_interactions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE deal_purchases ADD CONSTRAINT deal_purchases_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE market_listings ADD CONSTRAINT market_listings_seller_id_fkey 
    FOREIGN KEY (seller_id) REFERENCES users(walletaddress);
ALTER TABLE market_listings ADD CONSTRAINT market_listings_buyer_id_fkey 
    FOREIGN KEY (buyer_id) REFERENCES users(walletaddress);
ALTER TABLE premium_passes ADD CONSTRAINT premium_passes_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE referrals ADD CONSTRAINT referrals_referred_username_fkey 
    FOREIGN KEY (referred_username) REFERENCES users(walletaddress);
ALTER TABLE referrals ADD CONSTRAINT referrals_referrer_username_fkey 
    FOREIGN KEY (referrer_username) REFERENCES users(walletaddress);
ALTER TABLE special_deal_purchases ADD CONSTRAINT special_deal_purchases_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE ticket_purchases ADD CONSTRAINT ticket_purchases_username_fkey 
    FOREIGN KEY (username) REFERENCES users(walletaddress);
ALTER TABLE user_card_instances ADD CONSTRAINT user_card_instances_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);
ALTER TABLE xp_passes ADD CONSTRAINT xp_passes_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(walletaddress);

-- =====================================================
-- STEP 7: Update any additional tables that might reference users
-- =====================================================

-- Update trades table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trades') THEN
        -- Add new columns
        ALTER TABLE trades ADD COLUMN IF NOT EXISTS seller_wallet_address TEXT;
        ALTER TABLE trades ADD COLUMN IF NOT EXISTS buyer_wallet_address TEXT;
        
        -- Update the data
        UPDATE trades 
        SET seller_wallet_address = u.walletaddress 
        FROM users u 
        WHERE trades.seller_id = u.username;
        
        UPDATE trades 
        SET buyer_wallet_address = u.walletaddress 
        FROM users u 
        WHERE trades.buyer_id = u.username;
        
        -- Drop old columns and rename new ones
        ALTER TABLE trades DROP COLUMN IF EXISTS seller_id;
        ALTER TABLE trades DROP COLUMN IF EXISTS buyer_id;
        ALTER TABLE trades RENAME COLUMN seller_wallet_address TO seller_id;
        ALTER TABLE trades RENAME COLUMN buyer_wallet_address TO buyer_id;
    END IF;
END $$;

-- Update battle_history table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'battle_history') THEN
        -- Add new columns
        ALTER TABLE battle_history ADD COLUMN IF NOT EXISTS user_wallet_address TEXT;
        ALTER TABLE battle_history ADD COLUMN IF NOT EXISTS opponent_wallet_address TEXT;
        
        -- Update the data
        UPDATE battle_history 
        SET user_wallet_address = u.walletaddress 
        FROM users u 
        WHERE battle_history.user_id = u.id;
        
        UPDATE battle_history 
        SET opponent_wallet_address = u.walletaddress 
        FROM users u 
        WHERE battle_history.opponent_id = u.id;
        
        -- Drop old columns and rename new ones
        ALTER TABLE battle_history DROP COLUMN IF EXISTS user_id;
        ALTER TABLE battle_history DROP COLUMN IF EXISTS opponent_id;
        ALTER TABLE battle_history RENAME COLUMN user_wallet_address TO user_id;
        ALTER TABLE battle_history RENAME COLUMN opponent_wallet_address TO opponent_id;
    END IF;
END $$;

-- Update weekly_contest_entries table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_contest_entries') THEN
        -- Add new column
        ALTER TABLE weekly_contest_entries ADD COLUMN IF NOT EXISTS user_wallet_address TEXT;
        
        -- Update the data
        UPDATE weekly_contest_entries 
        SET user_wallet_address = u.walletaddress 
        FROM users u 
        WHERE weekly_contest_entries.user_id = u.username;
        
        -- Drop old column and rename new one
        ALTER TABLE weekly_contest_entries DROP COLUMN IF EXISTS user_id;
        ALTER TABLE weekly_contest_entries RENAME COLUMN user_wallet_address TO user_id;
    END IF;
END $$;

-- =====================================================
-- STEP 8: Create indexes for better performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_world_id ON users(world_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_buyer_id ON market_listings(buyer_id);
CREATE INDEX IF NOT EXISTS idx_user_card_instances_user_id ON user_card_instances(user_id);

-- =====================================================
-- STEP 9: Validation queries
-- =====================================================
-- Verify the migration was successful
SELECT 'Users table validation' as check_type, COUNT(*) as count FROM users;
SELECT 'Users with wallet addresses' as check_type, COUNT(*) as count FROM users WHERE walletaddress IS NOT NULL;
SELECT 'Foreign key validation - market_listings' as check_type, COUNT(*) as count FROM market_listings WHERE seller_id IS NOT NULL;
SELECT 'Foreign key validation - user_card_instances' as check_type, COUNT(*) as count FROM user_card_instances WHERE user_id IS NOT NULL;

-- =====================================================
-- STEP 10: Clean up backup tables (uncomment when ready)
-- =====================================================
-- DROP TABLE IF EXISTS users_backup;
-- DROP TABLE IF EXISTS user_card_instances_backup;
-- DROP TABLE IF EXISTS market_listings_backup;
-- DROP TABLE IF EXISTS claimed_rewards_backup;
-- DROP TABLE IF EXISTS deal_interactions_backup;
-- DROP TABLE IF EXISTS deal_purchases_backup;
-- DROP TABLE IF EXISTS premium_passes_backup;
-- DROP TABLE IF EXISTS referrals_backup;
-- DROP TABLE IF EXISTS special_deal_purchases_backup;
-- DROP TABLE IF EXISTS ticket_purchases_backup;
-- DROP TABLE IF EXISTS xp_passes_backup;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES:
-- =====================================================
-- 1. The username column is still available for display purposes
-- 2. All foreign key relationships now use wallet_address
-- 3. The users table primary key is now walletaddress
-- 4. All queries in the application code need to be updated to use wallet_address
-- 5. Test all functionality thoroughly before removing backup tables
