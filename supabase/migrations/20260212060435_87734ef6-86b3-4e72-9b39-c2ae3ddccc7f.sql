
-- Create settings table for BOL sequence
CREATE TABLE public.settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to settings"
ON public.settings
FOR ALL
USING (true)
WITH CHECK (true);

-- Initialize BOL sequence at 1178
INSERT INTO public.settings (key, value) VALUES ('next_bol_number', '1178');

-- Reset any test BOL numbers above 1177
UPDATE public.orders SET outgoing_bol = NULL WHERE outgoing_bol IS NOT NULL AND CAST(outgoing_bol AS INTEGER) > 1177;
