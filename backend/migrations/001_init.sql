-- ============================================================
-- Nexus CRM — Migration 001: Full Schema (Phase 1 + Phase 2)
-- PostgreSQL / Supabase
-- Last updated: 2026-03-22
-- Reflects actual DB state including Phase 1 and Phase 2 changes.
-- Tables created in FK-safe dependency order.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. COMPANIES
-- ============================================================
CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  default_lang TEXT NOT NULL DEFAULT 'it',
  logo_url     TEXT,
  settings     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE users (
  id         UUID PRIMARY KEY,   -- mirrors auth.users.id
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'it',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 3. INTEGRATIONS
-- ============================================================
CREATE TABLE integrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('windoc','zoho_sign','sendgrid','smtp')),
  config       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  UNIQUE (company_id, type)
);


-- ============================================================
-- 4. CLIENTS  [Phase 1: added company_name, iban, windoc_sync_at,
--              updated status constraint, windoc_id already existed]
-- ============================================================
CREATE TABLE clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  city           TEXT,
  address        TEXT,
  vat_number     TEXT,
  pec            TEXT,
  dest_code      TEXT,
  company_name   TEXT,
  iban           TEXT,
  lang           TEXT NOT NULL DEFAULT 'it',
  status         TEXT NOT NULL DEFAULT 'prospect'
                 CHECK (status IN ('prospect','pre_active','active','suspended','ceased')),
  windoc_id      TEXT,
  windoc_sync_at TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_company ON clients(company_id);
CREATE INDEX idx_clients_status  ON clients(company_id, status);


-- ============================================================
-- 5. CLIENT_CONTACTS
-- ============================================================
CREATE TABLE client_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('billing','admin','signature','other')),
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);


-- ============================================================
-- 6. USER_COMPANY_PERMISSIONS
-- ============================================================
CREATE TABLE user_company_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin','client')),
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
CREATE INDEX idx_ucp_user    ON user_company_permissions(user_id);
CREATE INDEX idx_ucp_company ON user_company_permissions(company_id);


-- ============================================================
-- 7. SERVICES_CATALOG
-- ============================================================
CREATE TABLE services_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2),
  billing_cycle TEXT NOT NULL
                CHECK (billing_cycle IN ('monthly','quarterly','annual','one_off')),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 8. CLIENT_SERVICES
-- ============================================================
CREATE TABLE client_services (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services_catalog(id),
  start_date DATE,
  end_date   DATE,
  price      NUMERIC(10,2),
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','cancelled','pending')),
  notes      TEXT
);
CREATE INDEX idx_client_services_client ON client_services(client_id);


-- ============================================================
-- 9. DOCUMENT_TEMPLATES
-- ============================================================
CREATE TABLE document_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL
             CHECK (type IN ('contract','proposal','invoice_cover','privacy','consent','annex','custom')),
  lang       TEXT NOT NULL DEFAULT 'it',
  content    TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 10. CONTRACTS
-- ============================================================
CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id),
  title           TEXT NOT NULL,
  template_id     UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','signed','expired','cancelled')),
  signed_at       TIMESTAMPTZ,
  zoho_request_id TEXT,
  valid_from      DATE,
  valid_to        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_status ON contracts(company_id, status);


-- ============================================================
-- 11. DOCUMENTS
-- ============================================================
CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id),
  contract_id  UUID REFERENCES contracts(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  type         TEXT,
  storage_path TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','signed','archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_client ON documents(client_id);


-- ============================================================
-- 12. INVOICES  [Phase 3: is_proforma, payment_status, payment_method,
--               payment_proof_url, payment_proof_uploaded_at,
--               payment_reference, onboarding_id]
-- ============================================================
CREATE TABLE invoices (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id                   UUID NOT NULL REFERENCES clients(id),
  onboarding_id               UUID REFERENCES onboarding(id) ON DELETE SET NULL,
  windoc_id                   TEXT,
  number                      TEXT,
  issue_date                  DATE,
  due_date                    DATE,
  amount                      NUMERIC(10,2),
  vat_amount                  NUMERIC(10,2),
  total                       NUMERIC(10,2),
  currency                    TEXT NOT NULL DEFAULT 'EUR',
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  -- Phase 3: proforma flag
  is_proforma                 BOOLEAN NOT NULL DEFAULT false,
  -- Phase 3: payment tracking
  payment_status              TEXT NOT NULL DEFAULT 'not_paid'
                              CHECK (payment_status IN ('not_paid','proof_uploaded','under_review','paid','cancelled')),
  payment_method              TEXT
                              CHECK (payment_method IN ('bonifico','rid','carta')),
  -- Phase 3: proof of payment
  payment_proof_url           TEXT,
  payment_proof_uploaded_at   TIMESTAMPTZ,
  -- Phase 3: causale reference auto-generata
  payment_reference           TEXT,
  paid_at                     TIMESTAMPTZ,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_client         ON invoices(client_id);
CREATE INDEX idx_invoices_status         ON invoices(company_id, status);
CREATE INDEX idx_invoices_due            ON invoices(company_id, due_date);
CREATE INDEX idx_invoices_payment_status ON invoices(company_id, payment_status);
CREATE INDEX idx_invoices_is_proforma    ON invoices(company_id, is_proforma);
CREATE INDEX idx_invoices_onboarding     ON invoices(onboarding_id);


-- ============================================================
-- 13. INVOICE_LINES
-- ============================================================
CREATE TABLE invoice_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2),
  vat_rate    NUMERIC(5,2) NOT NULL DEFAULT 22,
  total       NUMERIC(10,2),
  service_id  UUID REFERENCES services_catalog(id) ON DELETE SET NULL
);


-- ============================================================
-- 14. PAYMENT_LOGS  [Phase 3: aggiunto company_id]
-- ============================================================
CREATE TABLE payment_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  amount     NUMERIC(10,2) NOT NULL,
  paid_at    TIMESTAMPTZ NOT NULL,
  method     TEXT,
  reference  TEXT,
  notes      TEXT,
  created_by UUID REFERENCES users(id)
);


-- ============================================================
-- 15. RENEWALS
-- ============================================================
CREATE TABLE renewals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id),
  client_service_id UUID NOT NULL REFERENCES client_services(id),
  renewal_date      DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','alerted','renewed','cancelled')),
  alert_sent_at     TIMESTAMPTZ,
  renewed_at        TIMESTAMPTZ,
  notes             TEXT
);
CREATE INDEX idx_renewals_date ON renewals(company_id, renewal_date);


-- ============================================================
-- 16. EMAIL_TEMPLATES
-- ============================================================
CREATE TABLE email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'it',
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, type, lang)
);


-- ============================================================
-- 17. EMAIL_LOGS
-- ============================================================
CREATE TABLE email_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  to_email      TEXT NOT NULL,
  subject       TEXT,
  template_type TEXT,
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','failed','bounced')),
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_id   TEXT
);


-- ============================================================
-- 18. REMINDERS
-- ============================================================
CREATE TABLE reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  level        INT NOT NULL CHECK (level IN (1, 2, 3)),
  scheduled_at TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled','sent','failed','skipped')),
  email_log_id UUID REFERENCES email_logs(id),
  UNIQUE (invoice_id, level)
);


-- ============================================================
-- 19. AUDIT_LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  action      TEXT NOT NULL CHECK (action IN (
                'create','update','delete','send','login','switch_company',
                'convert','convert_partial','activate','abandon','cancel'
              )),
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company_entity ON audit_logs(company_id, entity_type, entity_id);
CREATE INDEX idx_audit_user           ON audit_logs(user_id);


-- ============================================================
-- 20. WEBHOOK_EVENTS
-- ============================================================
CREATE TABLE webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  provider      TEXT NOT NULL CHECK (provider IN ('zoho_sign','windoc','sendgrid')),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','processed','failed','ignored')),
  processed_at  TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_status ON webhook_events(status, created_at);


-- ============================================================
-- 21. ONBOARDING  [Phase 2: new table — workflow linked to client]
-- client_id is the FK to the existing client.
-- Onboarding does NOT create clients — it tracks the activation workflow.
-- ============================================================
CREATE TABLE onboarding (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'bozza'
                   CHECK (status IN (
                     'bozza','preventivo_in_preparazione','preventivo_inviato',
                     'preventivo_accettato','contratto_inviato','contratto_firmato',
                     'proforma_emessa','in_attesa_pagamento','pagamento_verifica',
                     'attivazione_servizio','attivo','abbandonato','annullato'
                   )),
  reference_name   TEXT,
  service_interest TEXT,
  estimated_value  NUMERIC(12,2),
  priority         TEXT CHECK (priority IN ('high','medium','low')),
  notes            TEXT,
  steps_total      INT NOT NULL DEFAULT 10,
  steps_completed  INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_company ON onboarding(company_id);
CREATE INDEX idx_onboarding_client  ON onboarding(client_id);
CREATE INDEX idx_onboarding_status  ON onboarding(company_id, status);


-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON onboarding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
