-- Create sequence for daily_deals_batch_purchases
CREATE SEQUENCE IF NOT EXISTS daily_deals_batch_purchases_id_seq;

-- Create daily_deals_batch_purchases table
CREATE TABLE IF NOT EXISTS public.daily_deals_batch_purchases (
  id integer NOT NULL DEFAULT nextval('daily_deals_batch_purchases_id_seq'::regclass),
  wallet_address text NOT NULL,
  batch_deal_id integer NOT NULL,
  price numeric NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_deals_batch_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT daily_deals_batch_purchases_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT daily_deals_batch_purchases_batch_deal_id_fkey FOREIGN KEY (batch_deal_id) REFERENCES public.daily_deals_batch(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_deals_batch_purchases_wallet ON public.daily_deals_batch_purchases(wallet_address);
CREATE INDEX IF NOT EXISTS idx_daily_deals_batch_purchases_deal ON public.daily_deals_batch_purchases(batch_deal_id);
CREATE INDEX IF NOT EXISTS idx_daily_deals_batch_purchases_date ON public.daily_deals_batch_purchases(purchased_at DESC);

-- Add comment
COMMENT ON TABLE public.daily_deals_batch_purchases IS 'Tracks purchases of daily deals from the batch system';

