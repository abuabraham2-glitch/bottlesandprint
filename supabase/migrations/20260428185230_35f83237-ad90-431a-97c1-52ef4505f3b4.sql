CREATE POLICY "Authenticated can select quick_notes"
ON public.quick_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can update quick_notes"
ON public.quick_notes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);