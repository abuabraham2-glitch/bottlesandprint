
-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  billing_address TEXT,
  form_signed BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  item_name TEXT NOT NULL,
  bottle_type TEXT,
  bottle_size TEXT,
  material TEXT,
  bottle_color TEXT,
  num_colors INTEGER,
  print_colors TEXT,
  quantity INTEGER,
  packing TEXT,
  pass INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL DEFAULT 'preflight',
  checklist_new_client_form BOOLEAN NOT NULL DEFAULT false,
  checklist_artwork_in BOOLEAN NOT NULL DEFAULT false,
  checklist_proof_approved BOOLEAN NOT NULL DEFAULT false,
  checklist_purchase_order BOOLEAN NOT NULL DEFAULT false,
  checklist_bottles BOOLEAN NOT NULL DEFAULT false,
  checklist_art_order_logged BOOLEAN NOT NULL DEFAULT false,
  client_po TEXT,
  vendor_po TEXT,
  invoiced BOOLEAN NOT NULL DEFAULT false,
  invoice_num TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  pay_method TEXT,
  pay_date DATE,
  shipped BOOLEAN NOT NULL DEFAULT false,
  ship_date DATE,
  outgoing_bol TEXT,
  bol_signed BOOLEAN NOT NULL DEFAULT false,
  date_entered DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Catalog table
CREATE TABLE public.catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  product_name TEXT NOT NULL,
  size TEXT,
  component TEXT,
  material TEXT,
  container_color TEXT,
  num_colors INTEGER,
  print_colors TEXT,
  first_run TEXT,
  last_run TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Order documents table
CREATE TABLE public.order_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Archived orders table
CREATE TABLE public.archived_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year TEXT,
  month TEXT,
  client_company TEXT,
  description TEXT,
  size TEXT,
  quantity INTEGER,
  pass INTEGER,
  comments TEXT,
  date_completed TEXT,
  original_order_id UUID
);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_orders ENABLE ROW LEVEL SECURITY;

-- Since this is a single-user business app, allow all operations for now
-- (anon key access for simplicity - single user app)
CREATE POLICY "Allow all access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to catalog" ON public.catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to order_documents" ON public.order_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to archived_orders" ON public.archived_orders FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for order documents
INSERT INTO storage.buckets (id, name, public) VALUES ('order-documents', 'order-documents', true);

CREATE POLICY "Allow all access to order documents storage" ON storage.objects FOR ALL USING (bucket_id = 'order-documents') WITH CHECK (bucket_id = 'order-documents');
