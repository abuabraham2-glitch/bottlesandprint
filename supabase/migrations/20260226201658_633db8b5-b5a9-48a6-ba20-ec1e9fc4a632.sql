
-- Add columns to emails table
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS po_received_at timestamptz;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS converted boolean DEFAULT false;

-- Create monthly_stats table
CREATE TABLE public.monthly_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month_start date NOT NULL UNIQUE,
  quotes_sent integer DEFAULT 0,
  po_received integer DEFAULT 0,
  conversion_pct numeric(5,2) DEFAULT 0,
  avg_days_to_close numeric(5,1) DEFAULT 0,
  insights text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.monthly_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.monthly_stats FOR ALL USING (true) WITH CHECK (true);
