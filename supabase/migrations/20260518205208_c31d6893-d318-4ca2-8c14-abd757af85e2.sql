ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS renewal_stage text NOT NULL DEFAULT 'not_started';
CREATE INDEX IF NOT EXISTS idx_clients_renewal_stage ON public.clients(org_id, renewal_stage);