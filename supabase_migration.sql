-- ============================================================
-- Nova/Nexus CRM — Migrazione tabelle Chiamate e Comunicazioni
-- Esegui questo script nel SQL Editor del tuo progetto Supabase:
--   Dashboard → SQL Editor → Incolla → Run
-- ============================================================

-- 1. Tabella chiamate clienti
CREATE TABLE IF NOT EXISTS client_calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  client_id     UUID NOT NULL,
  title         TEXT NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INTEGER DEFAULT 15,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'completed', 'missed')),
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_calls_client
  ON client_calls (client_id);
CREATE INDEX IF NOT EXISTS idx_client_calls_company
  ON client_calls (company_id);
CREATE INDEX IF NOT EXISTS idx_client_calls_status
  ON client_calls (status, scheduled_at);

-- 2. Tabella comunicazioni clienti
CREATE TABLE IF NOT EXISTS client_communications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL,
  client_id      UUID NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'email',
  direction      TEXT NOT NULL DEFAULT 'outbound',
  subject        TEXT,
  body_preview   TEXT,
  template_type  TEXT,
  reference_type TEXT,
  reference_id   UUID,
  status         TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'failed', 'delivered', 'opened')),
  sent_at        TIMESTAMPTZ DEFAULT now(),
  sent_by        UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comms_client
  ON client_communications (client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_comms_company
  ON client_communications (company_id);
CREATE INDEX IF NOT EXISTS idx_comms_template
  ON client_communications (template_type);

-- Verifica finale
SELECT 'client_calls OK' AS result WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'client_calls' AND table_schema = 'public'
)
UNION ALL
SELECT 'client_communications OK' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'client_communications' AND table_schema = 'public'
);
