
-- Add new separate address columns to clients
ALTER TABLE public.clients ADD COLUMN street_address text;
ALTER TABLE public.clients ADD COLUMN city text;
ALTER TABLE public.clients ADD COLUMN state text;
ALTER TABLE public.clients ADD COLUMN zip text;
ALTER TABLE public.clients ADD COLUMN billing_street text;
ALTER TABLE public.clients ADD COLUMN billing_city text;
ALTER TABLE public.clients ADD COLUMN billing_state text;
ALTER TABLE public.clients ADD COLUMN billing_zip text;

-- Migrate any existing data from old columns
UPDATE public.clients SET street_address = address WHERE address IS NOT NULL AND address != '';
UPDATE public.clients SET billing_street = billing_address WHERE billing_address IS NOT NULL AND billing_address != '';

-- Drop old columns
ALTER TABLE public.clients DROP COLUMN address;
ALTER TABLE public.clients DROP COLUMN billing_address;
