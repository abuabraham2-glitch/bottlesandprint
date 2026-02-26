ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS related_messages jsonb DEFAULT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS related_messages jsonb DEFAULT NULL;