-- Create card_creations table to track card creation transactions
CREATE TABLE IF NOT EXISTS public.card_creations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  wallet_address text NOT NULL,
  token_address text NOT NULL,
  rarity text NOT NULL,
  price_wld numeric NOT NULL,
  price_usd numeric NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT card_creations_pkey PRIMARY KEY (id),
  CONSTRAINT card_creations_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT card_creations_token_address_unique UNIQUE (token_address)
);

-- Add index on wallet_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_card_creations_wallet_address ON public.card_creations(wallet_address);

-- Add index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_card_creations_created_at ON public.card_creations(created_at DESC);
