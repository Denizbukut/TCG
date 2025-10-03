-- =====================================================
-- TEST SCRIPT: Überprüfe Datenbankverbindung und Schema
-- =====================================================

-- 1. Überprüfe ob users Tabelle existiert
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'users'
) as users_table_exists;

-- 2. Zeige alle Spalten der users Tabelle
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Überprüfe Primary Key
SELECT 
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'users';

-- 4. Test: Versuche einen User zu erstellen (wird nicht ausgeführt, nur für Referenz)
/*
-- Für neues Schema:
INSERT INTO users (wallet_address, username, tickets, coins, level) 
VALUES ('0xtest', 'testuser', 5, 1000, 1);

-- Für altes Schema:
INSERT INTO users (username, walletaddress, tickets, coins, level) 
VALUES ('testuser', '0xtest', 5, 1000, 1);
*/

-- 5. Überprüfe ob es bereits User gibt
SELECT COUNT(*) as user_count FROM users;

-- 6. Zeige erste 3 User (falls vorhanden) - nur um zu sehen welche Spalten existieren
SELECT * FROM users LIMIT 3;
