
-- Create order_items table for multi-item orders
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  bottle_type TEXT,
  bottle_size TEXT,
  material TEXT,
  bottle_color TEXT,
  num_colors INTEGER,
  print_colors TEXT,
  quantity INTEGER,
  packing TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- RLS policy matching orders table
CREATE POLICY "Admins can access order_items"
ON public.order_items
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing orders data into order_items (one item per existing order)
INSERT INTO public.order_items (order_id, item_name, bottle_type, bottle_size, material, bottle_color, num_colors, print_colors, quantity, packing)
SELECT id, item_name, bottle_type, bottle_size, material, bottle_color, num_colors, print_colors, quantity, packing
FROM public.orders;
