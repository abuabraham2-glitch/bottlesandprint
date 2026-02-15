
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vendor_po_reviewed boolean NOT NULL DEFAULT false;
