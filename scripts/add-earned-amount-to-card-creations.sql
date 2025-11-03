-- Add earned_amount column to card_creations table
ALTER TABLE public.card_creations
ADD COLUMN IF NOT EXISTS earned_amount numeric DEFAULT 0 NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.card_creations.earned_amount IS 'Total amount earned by creator from daily deals, special deals, and marketplace sales';

