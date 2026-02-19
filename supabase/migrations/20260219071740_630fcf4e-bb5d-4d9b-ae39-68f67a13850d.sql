
-- Add new columns
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS category text DEFAULT '';
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS summary text DEFAULT '';
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS is_existing_client boolean DEFAULT false;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS draft_response text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Change quote_details from text to jsonb
ALTER TABLE public.calls ALTER COLUMN quote_details TYPE jsonb USING COALESCE(quote_details::jsonb, '{}'::jsonb);
ALTER TABLE public.calls ALTER COLUMN quote_details SET DEFAULT '{}'::jsonb;

-- Change status default from 'new' to 'pending'
ALTER TABLE public.calls ALTER COLUMN status SET DEFAULT 'pending';

-- Update other column defaults to '' instead of null
ALTER TABLE public.calls ALTER COLUMN caller_name SET DEFAULT '';
ALTER TABLE public.calls ALTER COLUMN company_name SET DEFAULT '';
ALTER TABLE public.calls ALTER COLUMN phone_number SET DEFAULT '';
ALTER TABLE public.calls ALTER COLUMN email SET DEFAULT '';
ALTER TABLE public.calls ALTER COLUMN call_reason SET DEFAULT '';

-- Drop old columns
ALTER TABLE public.calls DROP COLUMN IF EXISTS returned_at;
ALTER TABLE public.calls DROP COLUMN IF EXISTS archived_at;
