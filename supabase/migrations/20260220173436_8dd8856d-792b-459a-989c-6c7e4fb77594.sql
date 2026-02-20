
-- Create proofs storage bucket for temporary artwork files
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to proofs bucket
CREATE POLICY "Allow public uploads to proofs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'proofs');

-- Allow public read access to proofs bucket
CREATE POLICY "Allow public reads from proofs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'proofs');

-- Allow public deletes from proofs bucket (for cleanup)
CREATE POLICY "Allow public deletes from proofs"
ON storage.objects
FOR DELETE
USING (bucket_id = 'proofs');
