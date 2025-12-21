-- Create sequence for daily_deals_batch
CREATE SEQUENCE IF NOT EXISTS daily_deals_batch_id_seq;

-- Create daily_deals_batch table
CREATE TABLE IF NOT EXISTS public.daily_deals_batch (
  id integer NOT NULL DEFAULT nextval('daily_deals_batch_id_seq'::regclass),
  batch_timestamp timestamp with time zone NOT NULL DEFAULT now(),
  deal_index integer NOT NULL CHECK (deal_index >= 0 AND deal_index < 4),
  card_id uuid NOT NULL,
  card_level integer NOT NULL DEFAULT 1,
  classic_tickets integer NOT NULL DEFAULT 0,
  elite_tickets integer NOT NULL DEFAULT 0,
  normal_tickets integer NOT NULL DEFAULT 0,
  legendary_tickets integer NOT NULL DEFAULT 0,
  price numeric NOT NULL,
  description text,
  discount_percentage integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_deals_batch_pkey PRIMARY KEY (id),
  CONSTRAINT fk_daily_deals_batch_card FOREIGN KEY (card_id) REFERENCES public.cards(id),
  CONSTRAINT unique_batch_deal UNIQUE (batch_timestamp, deal_index)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_deals_batch_timestamp ON public.daily_deals_batch(batch_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_daily_deals_batch_card_id ON public.daily_deals_batch(card_id);

-- Add comment
COMMENT ON TABLE public.daily_deals_batch IS 'Stores batches of 4 daily deals that are updated every 3 hours';


