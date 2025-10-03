-- =====================================================
-- DEBUG SCRIPT: Überprüfe das aktuelle Datenbankschema
-- =====================================================

-- 1. Überprüfe ob die users Tabelle existiert und wie sie aussieht
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Überprüfe die Primary Key der users Tabelle
SELECT 
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'users';

-- 3. Überprüfe ob es User-Daten gibt
SELECT COUNT(*) as total_users FROM users;

-- 4. Zeige die ersten 3 User (falls vorhanden) - nur Spaltennamen
SELECT 
    column_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'users'
ORDER BY ordinal_position;

-- 5. Überprüfe alle Tabellen im public Schema
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
