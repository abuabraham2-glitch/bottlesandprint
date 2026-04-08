
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', true);

CREATE POLICY "Anyone can view client documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-documents');

CREATE POLICY "Admins can upload client documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update client documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete client documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-documents' AND public.has_role(auth.uid(), 'admin'));
