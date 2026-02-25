
CREATE TABLE public.corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID,
  category TEXT,
  original_draft TEXT,
  edited_draft TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon access" ON public.corrections
  FOR ALL
  USING (true)
  WITH CHECK (true);
