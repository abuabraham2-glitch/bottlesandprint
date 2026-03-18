CREATE TABLE dashboard_todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  is_checked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  checked_at timestamptz
);

ALTER TABLE dashboard_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON dashboard_todos FOR ALL USING (true) WITH CHECK (true);