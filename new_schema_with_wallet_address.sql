-- =====================================================
-- NEUES DATENBANKSCHEMA: Wallet Address als Primary Key
-- =====================================================
-- Dieses Script erstellt ein komplett neues Schema mit wallet_address
-- als Primary Key für alle User-bezogenen Tabellen.

-- WICHTIG: Dieses Script löscht alle bestehenden Tabellen und erstellt sie neu!
-- Führe dieses Script nur aus, wenn du sicher bist, dass du alle Daten verlieren willst.

BEGIN;

-- =====================================================
-- STEP 1: Alle bestehenden Tabellen löschen
-- =====================================================
-- Lösche alle Tabellen in der richtigen Reihenfolge (Foreign Keys zuerst)

-- Lösche Foreign Key Tabellen zuerst
DROP TABLE IF EXISTS market_fees CASCADE;
DROP TABLE IF EXISTS market_listings CASCADE;
DROP TABLE IF EXISTS user_card_instances CASCADE;
DROP TABLE IF EXISTS claimed_rewards CASCADE;
DROP TABLE IF EXISTS deal_interactions CASCADE;
DROP TABLE IF EXISTS deal_purchases CASCADE;
DROP TABLE IF EXISTS premium_passes CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS special_deal_purchases CASCADE;
DROP TABLE IF EXISTS ticket_purchases CASCADE;
DROP TABLE IF EXISTS xp_passes CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS battle_history CASCADE;
DROP TABLE IF EXISTS weekly_contest_entries CASCADE;

-- Lösche User-Tabelle
DROP TABLE IF EXISTS users CASCADE;

-- Lösche andere Tabellen
DROP TABLE IF EXISTS daily_deals CASCADE;
DROP TABLE IF EXISTS discount_configs CASCADE;
DROP TABLE IF EXISTS special_offer CASCADE;
DROP TABLE IF EXISTS cards CASCADE;

-- Lösche Sequences
DROP SEQUENCE IF EXISTS daily_deals_id_seq CASCADE;
DROP SEQUENCE IF EXISTS deal_interactions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS deal_purchases_id_seq CASCADE;
DROP SEQUENCE IF EXISTS discount_configs_id_seq CASCADE;
DROP SEQUENCE IF EXISTS referrals_id_seq CASCADE;
DROP SEQUENCE IF EXISTS special_deal_purchases_id_seq CASCADE;
DROP SEQUENCE IF EXISTS special_offer_id_seq CASCADE;
DROP SEQUENCE IF EXISTS user_card_instances_id_seq CASCADE;

-- =====================================================
-- STEP 2: Sequences erstellen (MUSS vor den Tabellen sein!)
-- =====================================================
CREATE SEQUENCE daily_deals_id_seq;
CREATE SEQUENCE deal_interactions_id_seq;
CREATE SEQUENCE deal_purchases_id_seq;
CREATE SEQUENCE discount_configs_id_seq;
CREATE SEQUENCE referrals_id_seq;
CREATE SEQUENCE special_deal_purchases_id_seq;
CREATE SEQUENCE special_offer_id_seq;
CREATE SEQUENCE user_card_instances_id_seq;

-- =====================================================
-- STEP 3: Neue Tabellen mit wallet_address als Primary Key erstellen
-- =====================================================

-- 1. Cards Tabelle (bleibt unverändert)
CREATE TABLE public.cards (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  character text NOT NULL,
  image_url text NOT NULL,
  rarity text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  obtainable boolean DEFAULT true,
  image_id uuid,
  epoch integer,
  CONSTRAINT cards_pkey PRIMARY KEY (id)
);

-- 2. Users Tabelle mit wallet_address als Primary Key
CREATE TABLE public.users (
  wallet_address text NOT NULL, -- NEUE PRIMARY KEY
  username text NOT NULL UNIQUE,
  tickets integer DEFAULT 10,
  coins integer DEFAULT 1000,
  level integer DEFAULT 1,
  experience integer DEFAULT 0,
  last_login timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  world_id text UNIQUE,
  elite_tickets integer DEFAULT 0,
  icon_tickets integer DEFAULT 0,
  ticket_last_claimed timestamp with time zone,
  has_premium boolean DEFAULT false,
  next_level_exp integer DEFAULT 100,
  score bigint DEFAULT 0,
  tokens integer DEFAULT 0,
  token_last_claimed timestamp with time zone,
  clan_id integer,
  last_ticket_swap timestamp with time zone,
  last_ani_swap timestamp with time zone,
  has_xp_pass boolean DEFAULT false,
  cards_sold_since_last_purchase integer DEFAULT 0,
  avatar_id integer,
  prestige_points integer DEFAULT 100,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (wallet_address)
);

-- 3. User Card Instances mit wallet_address als Foreign Key
CREATE TABLE public.user_card_instances (
  id integer NOT NULL DEFAULT nextval('user_card_instances_id_seq'::regclass),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  card_id uuid NOT NULL,
  level integer DEFAULT 1,
  favorite boolean DEFAULT false,
  obtained_at timestamp without time zone DEFAULT now(),
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_card_instances_pkey PRIMARY KEY (id),
  CONSTRAINT user_card_instances_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT user_card_instances_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);

-- 4. Market Listings mit wallet_address als Foreign Key
CREATE TABLE public.market_listings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  seller_wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  buyer_wallet_address text, -- Foreign Key zu users.wallet_address
  card_id uuid NOT NULL,
  price double precision NOT NULL CHECK (price > 0::double precision),
  created_at timestamp with time zone DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'sold'::text, 'cancelled'::text])),
  sold_at timestamp with time zone,
  user_card_id integer,
  card_level integer DEFAULT 1,
  seller_world_id text,
  CONSTRAINT market_listings_pkey PRIMARY KEY (id),
  CONSTRAINT market_listings_seller_wallet_address_fkey FOREIGN KEY (seller_wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT market_listings_buyer_wallet_address_fkey FOREIGN KEY (buyer_wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT market_listings_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);

-- 5. Market Fees
CREATE TABLE public.market_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  market_listing_id uuid NOT NULL,
  fees numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT market_fees_pkey PRIMARY KEY (id),
  CONSTRAINT market_fees_market_listing_id_fkey FOREIGN KEY (market_listing_id) REFERENCES public.market_listings(id)
);

-- 6. Daily Deals
CREATE TABLE public.daily_deals (
  id integer NOT NULL DEFAULT nextval('daily_deals_id_seq'::regclass),
  date date NOT NULL UNIQUE,
  card_id uuid NOT NULL,
  card_level integer NOT NULL DEFAULT 1,
  classic_tickets integer NOT NULL DEFAULT 0,
  elite_tickets integer NOT NULL DEFAULT 0,
  price numeric NOT NULL,
  description text,
  discount_percentage integer,
  CONSTRAINT daily_deals_pkey PRIMARY KEY (id),
  CONSTRAINT fk_daily_deals_card FOREIGN KEY (card_id) REFERENCES public.cards(id)
);

-- 7. Deal Interactions mit wallet_address
CREATE TABLE public.deal_interactions (
  id integer NOT NULL DEFAULT nextval('deal_interactions_id_seq'::regclass),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  deal_id integer NOT NULL,
  seen boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  purchased boolean NOT NULL DEFAULT false,
  interaction_date timestamp with time zone DEFAULT now(),
  CONSTRAINT deal_interactions_pkey PRIMARY KEY (id),
  CONSTRAINT deal_interactions_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT deal_interactions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.daily_deals(id)
);

-- 8. Deal Purchases mit wallet_address
CREATE TABLE public.deal_purchases (
  id integer NOT NULL DEFAULT nextval('deal_purchases_id_seq'::regclass),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  deal_id integer NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deal_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT deal_purchases_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT deal_purchases_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.daily_deals(id)
);

-- 9. Discount Configs (bleibt unverändert)
CREATE TABLE public.discount_configs (
  id integer NOT NULL DEFAULT nextval('discount_configs_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  value numeric,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  discount_type text DEFAULT 'percentage'::text,
  CONSTRAINT discount_configs_pkey PRIMARY KEY (id)
);

-- 10. Premium Passes mit wallet_address
CREATE TABLE public.premium_passes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  wallet_address text NOT NULL UNIQUE, -- Foreign Key zu users.wallet_address
  active boolean DEFAULT true,
  purchased_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  last_elite_claim timestamp with time zone,
  CONSTRAINT premium_passes_pkey PRIMARY KEY (id),
  CONSTRAINT premium_passes_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);

-- 11. Referrals mit wallet_address
CREATE TABLE public.referrals (
  id integer NOT NULL DEFAULT nextval('referrals_id_seq'::regclass),
  referrer_wallet_address text, -- Foreign Key zu users.wallet_address
  referred_wallet_address text UNIQUE, -- Foreign Key zu users.wallet_address
  created_at timestamp with time zone DEFAULT now(),
  rewards_claimed boolean DEFAULT false,
  claimed_at timestamp with time zone,
  reward_claimed boolean DEFAULT false,
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_referred_wallet_address_fkey FOREIGN KEY (referred_wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT referrals_referrer_wallet_address_fkey FOREIGN KEY (referrer_wallet_address) REFERENCES public.users(wallet_address)
);

-- 12. Special Offer (bleibt unverändert)
CREATE TABLE public.special_offer (
  id integer NOT NULL,
  date date NOT NULL,
  card_level integer DEFAULT 1,
  elite_tickets integer DEFAULT 0,
  classic_tickets integer DEFAULT 0,
  price numeric,
  description text,
  discount_percentage integer,
  card_id uuid NOT NULL,
  CONSTRAINT special_offer_pkey PRIMARY KEY (id),
  CONSTRAINT special_offer_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);

-- 13. Special Deal Purchases mit wallet_address
CREATE TABLE public.special_deal_purchases (
  id integer NOT NULL DEFAULT nextval('special_deal_purchases_id_seq'::regclass),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  special_deal_id integer NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT special_deal_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT special_deal_purchases_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT special_deal_purchases_special_deal_id_fkey FOREIGN KEY (special_deal_id) REFERENCES public.special_offer(id)
);

-- 14. Ticket Purchases mit wallet_address
CREATE TABLE public.ticket_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  ticket_type text NOT NULL CHECK (ticket_type = ANY (ARRAY['classic'::text, 'elite'::text, 'icon'::text, 'xp_pass'::text])),
  amount integer NOT NULL CHECK (amount > 0),
  price_usd numeric NOT NULL,
  price_wld numeric,
  discounted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ticket_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_purchases_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);

-- 15. XP Passes mit wallet_address
CREATE TABLE public.xp_passes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE, -- Foreign Key zu users.wallet_address
  active boolean DEFAULT true,
  purchased_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT xp_passes_pkey PRIMARY KEY (id),
  CONSTRAINT xp_passes_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);

-- 16. Claimed Rewards mit wallet_address
CREATE TABLE public.claimed_rewards (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  level integer NOT NULL,
  standard_claimed boolean DEFAULT false,
  premium_claimed boolean DEFAULT false,
  claimed_at timestamp with time zone DEFAULT now(),
  icon_claimed boolean DEFAULT false,
  CONSTRAINT claimed_rewards_pkey PRIMARY KEY (id),
  CONSTRAINT claimed_rewards_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address)
);

-- =====================================================
-- STEP 3: Zusätzliche Tabellen für erweiterte Funktionalität
-- =====================================================

-- 17. Trades Tabelle
CREATE TABLE public.trades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  buyer_wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  user_card_id integer NOT NULL,
  card_id uuid NOT NULL,
  price numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trades_pkey PRIMARY KEY (id),
  CONSTRAINT trades_seller_wallet_address_fkey FOREIGN KEY (seller_wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT trades_buyer_wallet_address_fkey FOREIGN KEY (buyer_wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT trades_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);

-- 18. Battle History Tabelle
CREATE TABLE public.battle_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  opponent_wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  battle_type text NOT NULL,
  result text NOT NULL, -- 'win', 'loss', 'draw'
  battle_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT battle_history_pkey PRIMARY KEY (id),
  CONSTRAINT battle_history_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT battle_history_opponent_wallet_address_fkey FOREIGN KEY (opponent_wallet_address) REFERENCES public.users(wallet_address)
);

-- 19. Weekly Contest Entries
CREATE TABLE public.weekly_contest_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL, -- Foreign Key zu users.wallet_address
  week_start_date date NOT NULL,
  legendary_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT weekly_contest_entries_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_contest_entries_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT weekly_contest_entries_unique UNIQUE (wallet_address, week_start_date)
);



-- =====================================================
-- STEP 4: Indexes für bessere Performance erstellen
-- =====================================================
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_world_id ON users(world_id);
CREATE INDEX idx_user_card_instances_wallet_address ON user_card_instances(wallet_address);
CREATE INDEX idx_user_card_instances_card_id ON user_card_instances(card_id);
CREATE INDEX idx_market_listings_seller_wallet_address ON market_listings(seller_wallet_address);
CREATE INDEX idx_market_listings_buyer_wallet_address ON market_listings(buyer_wallet_address);
CREATE INDEX idx_market_listings_card_id ON market_listings(card_id);
CREATE INDEX idx_market_listings_status ON market_listings(status);
CREATE INDEX idx_trades_seller_wallet_address ON trades(seller_wallet_address);
CREATE INDEX idx_trades_buyer_wallet_address ON trades(buyer_wallet_address);
CREATE INDEX idx_battle_history_wallet_address ON battle_history(wallet_address);
CREATE INDEX idx_weekly_contest_entries_wallet_address ON weekly_contest_entries(wallet_address);
CREATE INDEX idx_weekly_contest_entries_week_start_date ON weekly_contest_entries(week_start_date);

-- =====================================================
-- STEP 5: Validierung
-- =====================================================
-- Überprüfe, dass alle Tabellen korrekt erstellt wurden
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

COMMIT;

-- =====================================================
-- POST-CREATION NOTES:
-- =====================================================
-- 1. Alle Tabellen verwenden jetzt wallet_address als Primary Key für Users
-- 2. Alle Foreign Keys verweisen auf users.wallet_address
-- 3. Username ist noch als UNIQUE Index verfügbar für Display-Zwecke
-- 4. Alle bestehenden Daten sind gelöscht - fange mit neuen Daten an
-- 5. Das Schema ist bereit für die neue Anwendung mit Wallet-basierter Authentifizierung
-- 6. SBC (Squad Building Challenges) und Clans Tabellen wurden entfernt
-- 7. Row Level Security (RLS) wurde deaktiviert
