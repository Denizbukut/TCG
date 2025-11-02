-- Add creator_address column to cards table
ALTER TABLE public.cards
ADD COLUMN IF NOT EXISTS creator_address text;

-- Add dev_fees and creator_fees columns to market_fees table
ALTER TABLE public.market_fees
ADD COLUMN IF NOT EXISTS dev_fees numeric,
ADD COLUMN IF NOT EXISTS creator_fees numeric;

-- Add index on creator_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_cards_creator_address ON public.cards(creator_address);
