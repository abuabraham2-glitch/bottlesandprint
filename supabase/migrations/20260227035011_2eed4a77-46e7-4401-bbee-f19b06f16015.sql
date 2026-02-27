
ALTER TABLE public.emails
  ADD COLUMN skip_alert text,
  ADD COLUMN skip_link_id uuid,
  ADD COLUMN same_company_alert text,
  ADD COLUMN same_company_link_id uuid,
  DROP COLUMN IF EXISTS related_messages;
