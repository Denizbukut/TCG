-- =====================================================
-- CREATE DAILY MISSIONS TABLES
-- =====================================================
-- Erstellt die Tabellen für tägliche Missionen mit wallet_address als Foreign Key

-- 1. Tägliche Missions-Fortschritt Tabelle
CREATE TABLE IF NOT EXISTS public.daily_mission_progress (
  wallet_address text NOT NULL,
  mission_date date NOT NULL DEFAULT CURRENT_DATE,
  mission_key text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  goal integer NOT NULL,
  reward_claimed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT daily_mission_progress_pkey PRIMARY KEY (wallet_address, mission_date, mission_key),
  CONSTRAINT daily_mission_progress_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Bonus-Reward Tabelle (für den Bonus-Reward wenn alle 4 Missionen abgeschlossen sind)
CREATE TABLE IF NOT EXISTS public.daily_mission_bonus (
  wallet_address text NOT NULL,
  mission_date date NOT NULL DEFAULT CURRENT_DATE,
  bonus_claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamp with time zone NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT daily_mission_bonus_pkey PRIMARY KEY (wallet_address, mission_date),
  CONSTRAINT daily_mission_bonus_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_daily_mission_progress_wallet_date 
ON public.daily_mission_progress(wallet_address, mission_date);

CREATE INDEX IF NOT EXISTS idx_daily_mission_progress_date 
ON public.daily_mission_progress(mission_date);

CREATE INDEX IF NOT EXISTS idx_daily_mission_bonus_wallet_date 
ON public.daily_mission_bonus(wallet_address, mission_date);

-- RLS (Row Level Security) aktivieren
ALTER TABLE public.daily_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mission_bonus ENABLE ROW LEVEL SECURITY;

-- RLS Policies für daily_mission_progress
-- Da wallet_address verwendet wird und nicht auth.uid(), erlauben wir authentifizierten Benutzern Zugriff
-- Die Backend-Funktionen verwenden Service Role und umgehen RLS
DROP POLICY IF EXISTS "Authenticated users can view mission progress" ON public.daily_mission_progress;
CREATE POLICY "Authenticated users can view mission progress" 
ON public.daily_mission_progress
FOR SELECT
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can insert mission progress" ON public.daily_mission_progress;
CREATE POLICY "Authenticated users can insert mission progress" 
ON public.daily_mission_progress
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can update mission progress" ON public.daily_mission_progress;
CREATE POLICY "Authenticated users can update mission progress" 
ON public.daily_mission_progress
FOR UPDATE
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- RLS Policies für daily_mission_bonus
DROP POLICY IF EXISTS "Authenticated users can view bonus claims" ON public.daily_mission_bonus;
CREATE POLICY "Authenticated users can view bonus claims" 
ON public.daily_mission_bonus
FOR SELECT
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can insert bonus claims" ON public.daily_mission_bonus;
CREATE POLICY "Authenticated users can insert bonus claims" 
ON public.daily_mission_bonus
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can update bonus claims" ON public.daily_mission_bonus;
CREATE POLICY "Authenticated users can update bonus claims" 
ON public.daily_mission_bonus
FOR UPDATE
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Berechtigungen
GRANT ALL ON public.daily_mission_progress TO authenticated;
GRANT ALL ON public.daily_mission_progress TO service_role;
GRANT ALL ON public.daily_mission_bonus TO authenticated;
GRANT ALL ON public.daily_mission_bonus TO service_role;

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_daily_mission_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_daily_mission_progress_updated_at ON public.daily_mission_progress;
CREATE TRIGGER trigger_update_daily_mission_progress_updated_at
    BEFORE UPDATE ON public.daily_mission_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_mission_progress_updated_at();

