
-- EMAILS TABLE
CREATE TABLE public.emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_id TEXT,
  thread_id TEXT,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  body TEXT,
  category TEXT,
  tier TEXT,
  status TEXT DEFAULT 'pending',
  draft_response TEXT,
  quote_data JSONB,
  client_id UUID REFERENCES public.clients(id),
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  auto_sent_at TIMESTAMPTZ,
  holding_sent_at TIMESTAMPTZ
);

-- CALLS TABLE
CREATE TABLE public.calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_name TEXT,
  company_name TEXT,
  phone_number TEXT,
  email TEXT,
  call_reason TEXT,
  quote_details TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  returned_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

-- FOLLOW_UPS TABLE
CREATE TABLE public.follow_ups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID REFERENCES public.emails(id),
  client_email TEXT,
  client_name TEXT,
  subject TEXT,
  follow_up_number INTEGER,
  scheduled_for TIMESTAMPTZ,
  sent BOOLEAN DEFAULT false,
  cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- TRIAGE FEEDBACK TABLE
CREATE TABLE public.triage_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID REFERENCES public.emails(id),
  feedback_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_emails_status ON public.emails(status);
CREATE INDEX idx_emails_category ON public.emails(category);
CREATE INDEX idx_emails_created ON public.emails(created_at DESC);
CREATE INDEX idx_emails_client ON public.emails(client_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_created ON public.calls(created_at DESC);
CREATE INDEX idx_follow_ups_scheduled ON public.follow_ups(scheduled_for) WHERE sent = false AND cancelled = false;

-- Enable RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin-only, matching your existing pattern)
CREATE POLICY "Admins can access emails" ON public.emails FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can access calls" ON public.calls FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can access follow_ups" ON public.follow_ups FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can access triage_feedback" ON public.triage_feedback FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
