CREATE POLICY "Anyone can delete trashed emails"
ON public.emails FOR DELETE
TO authenticated
USING (status = 'deleted');