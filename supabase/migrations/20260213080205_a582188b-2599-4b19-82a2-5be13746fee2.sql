
-- Drop all existing permissive policies
DROP POLICY IF EXISTS "Allow all access to clients" ON public.clients;
DROP POLICY IF EXISTS "Allow all access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow all access to catalog" ON public.catalog;
DROP POLICY IF EXISTS "Allow all access to order_documents" ON public.order_documents;
DROP POLICY IF EXISTS "Allow all access to archived_orders" ON public.archived_orders;
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;

-- Create authenticated-only policies for all tables
CREATE POLICY "Authenticated users can access clients"
ON public.clients FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access orders"
ON public.orders FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access catalog"
ON public.catalog FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access order_documents"
ON public.order_documents FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access archived_orders"
ON public.archived_orders FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access settings"
ON public.settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);
