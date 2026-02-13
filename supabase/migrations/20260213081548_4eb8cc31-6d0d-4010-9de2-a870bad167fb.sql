
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can read user_roles
CREATE POLICY "Admins can read user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create has_role function (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Assign admin role to existing user
INSERT INTO public.user_roles (user_id, role)
VALUES ('f1ead90a-2036-4e6f-bf50-b673a3e3254d', 'admin');

-- Now replace RLS policies on clients
DROP POLICY IF EXISTS "Authenticated users can access clients" ON public.clients;
CREATE POLICY "Admins can access clients"
ON public.clients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Replace RLS policies on orders
DROP POLICY IF EXISTS "Authenticated users can access orders" ON public.orders;
CREATE POLICY "Admins can access orders"
ON public.orders
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Replace RLS policies on order_documents
DROP POLICY IF EXISTS "Authenticated users can access order_documents" ON public.order_documents;
CREATE POLICY "Admins can access order_documents"
ON public.order_documents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also secure catalog
DROP POLICY IF EXISTS "Authenticated users can access catalog" ON public.catalog;
CREATE POLICY "Admins can access catalog"
ON public.catalog
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also secure archived_orders
DROP POLICY IF EXISTS "Authenticated users can access archived_orders" ON public.archived_orders;
CREATE POLICY "Admins can access archived_orders"
ON public.archived_orders
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also secure settings
DROP POLICY IF EXISTS "Authenticated users can access settings" ON public.settings;
CREATE POLICY "Admins can access settings"
ON public.settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
