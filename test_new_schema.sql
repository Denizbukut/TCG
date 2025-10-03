-- =====================================================
-- TEST SCRIPT: Validierung des neuen Wallet Address Schemas
-- =====================================================
-- Dieses Script testet das neue Datenbankschema mit wallet_address als Primary Key

-- =====================================================
-- TEST 1: Tabellen-Struktur überprüfen
-- =====================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('users', 'user_card_instances', 'market_listings', 'trades', 'battle_history')
ORDER BY table_name, ordinal_position;

-- =====================================================
-- TEST 2: Primary Keys überprüfen
-- =====================================================
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('users', 'user_card_instances', 'market_listings', 'trades', 'battle_history')
ORDER BY tc.table_name;

-- =====================================================
-- TEST 3: Foreign Key Constraints überprüfen
-- =====================================================
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND (tc.table_name LIKE '%user%' OR tc.table_name LIKE '%market%' OR tc.table_name LIKE '%trade%' OR tc.table_name LIKE '%battle%')
ORDER BY tc.table_name, tc.constraint_name;

-- =====================================================
-- TEST 4: Test-Daten einfügen (simuliert)
-- =====================================================
-- Diese Tests sind nur für die Validierung - werden nicht ausgeführt

/*
-- Test User einfügen
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
    score,
    tokens,
    clan_id,
    has_xp_pass,
    cards_sold_since_last_purchase,
    avatar_id,
    prestige_points
) VALUES (
    '0x1234567890abcdef1234567890abcdef12345678',  -- Test wallet address
    'testuser',
    10,
    1000,
    1,
    0,
    'test.world.id',
    0,
    0,
    false,
    0,
    0,
    NULL,
    false,
    0,
    1,
    100
);

-- Test Card einfügen
INSERT INTO cards (
    name,
    character,
    image_url,
    rarity,
    obtainable,
    epoch
) VALUES (
    'Test Card',
    'Test Character',
    'https://example.com/card.jpg',
    'common',
    true,
    1
);

-- Test User Card Instance
INSERT INTO user_card_instances (
    wallet_address,
    card_id,
    level,
    favorite
) VALUES (
    '0x1234567890abcdef1234567890abcdef12345678',
    (SELECT id FROM cards WHERE name = 'Test Card' LIMIT 1),
    1,
    false
);

-- Test Market Listing
INSERT INTO market_listings (
    seller_wallet_address,
    card_id,
    price,
    user_card_id,
    card_level,
    status
) VALUES (
    '0x1234567890abcdef1234567890abcdef12345678',
    (SELECT id FROM cards WHERE name = 'Test Card' LIMIT 1),
    10.50,
    (SELECT id FROM user_card_instances WHERE wallet_address = '0x1234567890abcdef1234567890abcdef12345678' LIMIT 1),
    1,
    'active'
);

-- Test Trade
INSERT INTO trades (
    seller_wallet_address,
    buyer_wallet_address,
    user_card_id,
    card_id,
    price
) VALUES (
    '0x1234567890abcdef1234567890abcdef12345678',
    '0x9876543210fedcba9876543210fedcba98765432',
    (SELECT id FROM user_card_instances WHERE wallet_address = '0x1234567890abcdef1234567890abcdef12345678' LIMIT 1),
    (SELECT id FROM cards WHERE name = 'Test Card' LIMIT 1),
    10.50
);
*/

-- =====================================================
-- TEST 5: Indexes überprüfen
-- =====================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
    AND (tablename LIKE '%user%' OR tablename LIKE '%market%' OR tablename LIKE '%trade%' OR tablename LIKE '%battle%')
ORDER BY tablename, indexname;

-- =====================================================
-- TEST 6: Sequences überprüfen
-- =====================================================
SELECT 
    sequence_name,
    data_type,
    start_value,
    minimum_value,
    maximum_value,
    increment
FROM information_schema.sequences 
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- =====================================================
-- TEST 7: Row Level Security überprüfen
-- =====================================================
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
    AND rowsecurity = true
ORDER BY tablename;

-- =====================================================
-- TEST 8: Constraints Summary
-- =====================================================
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND contype IN ('p', 'f', 'u', 'c')  -- Primary Key, Foreign Key, Unique, Check
ORDER BY contype, conname;

-- =====================================================
-- TEST 9: Validierung der Wallet Address Format
-- =====================================================
-- Überprüfe, ob wallet_address als Primary Key korrekt definiert ist
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'users'
    AND column_name = 'wallet_address';

-- =====================================================
-- TEST 10: Foreign Key Referenzen überprüfen
-- =====================================================
-- Überprüfe alle Tabellen, die auf users.wallet_address verweisen
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'users'
    AND ccu.column_name = 'wallet_address'
ORDER BY tc.table_name;

-- =====================================================
-- ERGEBNIS-INTERPRETATION:
-- =====================================================
-- 1. Alle Tabellen sollten wallet_address als Primary Key oder Foreign Key haben
-- 2. Foreign Keys sollten korrekt auf users.wallet_address verweisen
-- 3. Indexes sollten für Performance optimiert sein
-- 4. RLS sollte aktiviert sein für Sicherheit
-- 5. Alle Constraints sollten korrekt definiert sein

-- =====================================================
-- NÄCHSTE SCHRITTE:
-- =====================================================
-- 1. Führe das neue Schema aus: new_schema_with_wallet_address.sql
-- 2. Führe dieses Test-Script aus um zu validieren
-- 3. Teste die Anwendung mit dem neuen Schema
-- 4. Überprüfe alle Funktionen auf Korrektheit
