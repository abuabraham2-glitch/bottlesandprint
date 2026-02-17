
-- Create public storage bucket for email attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('email-attachments', 'email-attachments', true);

-- Allow public read access
CREATE POLICY "Public read access for email-attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-attachments');

-- Allow authenticated admins to upload
CREATE POLICY "Admins can upload email-attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-attachments' AND public.has_role(auth.uid(), 'admin'));

-- Allow anon insert for external tools (n8n)
CREATE POLICY "Anon can upload email-attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-attachments');

-- Add attachments column to emails table
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
