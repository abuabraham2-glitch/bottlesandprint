
-- Create sequence_counters table
CREATE TABLE public.sequence_counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counter_name TEXT NOT NULL UNIQUE,
  next_number INTEGER NOT NULL DEFAULT 1350
);

-- Enable RLS
ALTER TABLE public.sequence_counters ENABLE ROW LEVEL SECURITY;

-- RLS policy for admin access
CREATE POLICY "Admins can access sequence_counters"
ON public.sequence_counters
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed with starting values
INSERT INTO public.sequence_counters (counter_name, next_number) VALUES ('vendor_po', 1350);
INSERT INTO public.sequence_counters (counter_name, next_number) VALUES ('invoice', 1350);

-- Atomic function to get and increment a sequence counter
CREATE OR REPLACE FUNCTION public.get_next_sequence_number(p_counter_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_val INTEGER;
BEGIN
  SELECT next_number INTO current_val
  FROM sequence_counters
  WHERE counter_name = p_counter_name
  FOR UPDATE;

  IF current_val IS NULL THEN
    RAISE EXCEPTION 'Counter % not found', p_counter_name;
  END IF;

  UPDATE sequence_counters
  SET next_number = current_val + 1
  WHERE counter_name = p_counter_name;

  RETURN current_val;
END;
$function$;
