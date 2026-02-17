
DROP POLICY IF EXISTS "Allow all on emails" ON emails;
DROP POLICY IF EXISTS "Allow all on calls" ON calls;
DROP POLICY IF EXISTS "Allow all on follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Allow all on triage_feedback" ON triage_feedback;

CREATE POLICY "Enable all for anon" ON emails FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON calls FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON follow_ups FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON triage_feedback FOR ALL TO anon USING (true) WITH CHECK (true);
