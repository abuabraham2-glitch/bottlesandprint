ALTER TABLE emails ADD COLUMN IF NOT EXISTS holding_sent_at timestamptz;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS holding_sent_at timestamptz;