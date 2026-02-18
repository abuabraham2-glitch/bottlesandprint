ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS to_recipients text DEFAULT '';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS cc_recipients text DEFAULT '';