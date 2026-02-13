
-- Make the order-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'order-documents';

-- Drop existing storage policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow all access to order-documents" ON storage.objects;

-- Create authenticated-only storage policies
CREATE POLICY "Authenticated users can upload to order-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-documents');

CREATE POLICY "Authenticated users can view order-documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-documents');

CREATE POLICY "Authenticated users can update order-documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'order-documents');

CREATE POLICY "Authenticated users can delete order-documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-documents');
