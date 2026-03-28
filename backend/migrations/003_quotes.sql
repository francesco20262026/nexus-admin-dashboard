-- ============================================================
-- Nexus CRM — Migration 003: Quotes / Preventivi (Phase 4)
-- PostgreSQL / Supabase
-- Last updated: 2026-03-22
-- ============================================================

-- ============================================================
-- 1. QUOTES
-- ============================================================
CREATE TABLE quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id      UUID NOT NULL REFERENCES clients(id),
  onboarding_id  UUID REFERENCES onboarding(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  valid_until    DATE,
  notes          TEXT,
  -- Totals (computed from lines and stored for fast reads)
  total_net      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_vat      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  -- Lifecycle timestamps
  sent_at        TIMESTAMPTZ,
  accepted_at    TIMESTAMPTZ,
  rejected_at    TIMESTAMPTZ,
  expired_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_company        ON quotes(company_id);
CREATE INDEX idx_quotes_client         ON quotes(client_id);
CREATE INDEX idx_quotes_status         ON quotes(company_id, status);
CREATE INDEX idx_quotes_onboarding     ON quotes(onboarding_id);


-- ============================================================
-- 2. QUOTE_LINES
-- ============================================================
CREATE TABLE quote_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES services_catalog(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity    NUMERIC NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate    NUMERIC(5,2)  NOT NULL DEFAULT 22,
  line_total  NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id);


-- ============================================================
-- 3. RELATIONSHIP FKs — add quote_id to contracts + onboarding
-- ============================================================
ALTER TABLE contracts  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;


-- ============================================================
-- 4. TRIGGER: auto-update updated_at on quotes
-- ============================================================
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
