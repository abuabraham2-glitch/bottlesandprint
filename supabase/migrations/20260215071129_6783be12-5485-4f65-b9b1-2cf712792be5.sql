
CREATE OR REPLACE FUNCTION public.get_next_bol_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_val TEXT;
BEGIN
  SELECT value INTO current_val
  FROM settings
  WHERE key = 'next_bol_number'
  FOR UPDATE;

  IF current_val IS NULL THEN
    -- Fallback: find max from orders
    SELECT COALESCE(MAX(outgoing_bol::integer), 1177)::text INTO current_val
    FROM orders
    WHERE outgoing_bol IS NOT NULL AND outgoing_bol ~ '^\d+$';
    
    INSERT INTO settings (key, value) VALUES ('next_bol_number', (current_val::integer + 2)::text)
    ON CONFLICT (key) DO UPDATE SET value = (current_val::integer + 2)::text;
    
    RETURN (current_val::integer + 1)::text;
  END IF;

  UPDATE settings
  SET value = (current_val::integer + 1)::text
  WHERE key = 'next_bol_number';

  RETURN current_val;
END;
$$;
