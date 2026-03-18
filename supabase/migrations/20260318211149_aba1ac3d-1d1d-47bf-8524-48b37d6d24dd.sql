CREATE TABLE auto_ack_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email_address text NOT NULL,
  ack_type text NOT NULL,
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE auto_ack_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON auto_ack_log FOR ALL USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX idx_auto_ack_unique ON auto_ack_log (email_address, ack_type);