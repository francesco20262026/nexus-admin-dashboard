-- ============================================================
-- Nexus CRM — Migration 002: Row Level Security (RLS)
--
-- JWT custom claims expected:
--   active_company_id  (UUID)  — company user is working in
--   role               (text)  — 'admin' | 'client'
--   client_id          (UUID)  — set only when role = 'client'
--
-- Helper functions read these from the JWT sub/claims.
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION auth.active_company_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'active_company_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.user_client_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'client_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.is_admin() RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'admin';
$$ LANGUAGE SQL STABLE;


-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_catalog         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events           ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- companies
-- Admin sees their active company. Client sees their company.
-- ============================================================
CREATE POLICY companies_select ON companies
  FOR SELECT USING (id = auth.active_company_id());



-- ============================================================
-- users — users can read their own row; admin reads all in company
-- ============================================================
CREATE POLICY users_select_own ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (id = auth.uid());


-- ============================================================
-- user_company_permissions
-- ============================================================
CREATE POLICY ucp_select ON user_company_permissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR (auth.is_admin() AND company_id = auth.active_company_id())
  );

CREATE POLICY ucp_insert ON user_company_permissions
  FOR INSERT WITH CHECK (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY ucp_delete ON user_company_permissions
  FOR DELETE USING (auth.is_admin() AND company_id = auth.active_company_id());


-- ============================================================
-- integrations — admin only
-- ============================================================
CREATE POLICY integrations_all ON integrations
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());


-- ============================================================
-- clients
-- Admin: all clients in company
-- Client: only their own client record
-- ============================================================
CREATE POLICY clients_admin ON clients
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY clients_client_select ON clients
  FOR SELECT USING (
    auth.user_role() = 'client' AND id = auth.user_client_id()
  );


-- ============================================================
-- client_contacts (follows client access)
-- ============================================================
CREATE POLICY client_contacts_admin ON client_contacts
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY client_contacts_client_select ON client_contacts
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- services_catalog — admin CRUD; client read-only
-- ============================================================
CREATE POLICY services_admin ON services_catalog
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY services_client_select ON services_catalog
  FOR SELECT USING (
    auth.user_role() = 'client' AND company_id = auth.active_company_id()
  );


-- ============================================================
-- client_services
-- ============================================================
CREATE POLICY cs_admin ON client_services
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY cs_client_select ON client_services
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- document_templates — admin only
-- ============================================================
CREATE POLICY doc_templates_admin ON document_templates
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());


-- ============================================================
-- contracts
-- ============================================================
CREATE POLICY contracts_admin ON contracts
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY contracts_client_select ON contracts
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- documents
-- ============================================================
CREATE POLICY documents_admin ON documents
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY documents_client_select ON documents
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- invoices
-- ============================================================
CREATE POLICY invoices_admin ON invoices
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY invoices_client_select ON invoices
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- invoice_lines (inherit via invoice)
-- ============================================================
CREATE POLICY invoice_lines_admin ON invoice_lines
  FOR ALL USING (
    auth.is_admin() AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id AND i.company_id = auth.active_company_id()
    )
  );

CREATE POLICY invoice_lines_client_select ON invoice_lines
  FOR SELECT USING (
    auth.user_role() = 'client' AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id AND i.client_id = auth.user_client_id()
    )
  );


-- ============================================================
-- payment_logs — admin only
-- ============================================================
CREATE POLICY payment_logs_admin ON payment_logs
  FOR ALL USING (
    auth.is_admin() AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id AND i.company_id = auth.active_company_id()
    )
  );


-- ============================================================
-- renewals — admin all, client read own
-- ============================================================
CREATE POLICY renewals_admin ON renewals
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY renewals_client_select ON renewals
  FOR SELECT USING (
    auth.user_role() = 'client' AND client_id = auth.user_client_id()
  );


-- ============================================================
-- email_templates, email_logs, reminders — admin only
-- ============================================================
CREATE POLICY email_templates_admin ON email_templates
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY email_logs_admin ON email_logs
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY reminders_admin ON reminders
  FOR ALL USING (auth.is_admin() AND company_id = auth.active_company_id());


-- ============================================================
-- audit_logs — admin read only (no delete, no update)
-- ============================================================
CREATE POLICY audit_logs_admin_select ON audit_logs
  FOR SELECT USING (auth.is_admin() AND company_id = auth.active_company_id());

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (company_id = auth.active_company_id());


-- ============================================================
-- webhook_events — admin read only
-- ============================================================
CREATE POLICY webhook_events_admin ON webhook_events
  FOR SELECT USING (auth.is_admin() AND company_id = auth.active_company_id());


-- ============================================================
-- SUPABASE STORAGE — bucket 'nexus-documents'
--
-- Admin: read/write all objects under company_id/
-- Client: read only objects under company_id/client_id/
-- ============================================================

-- Create bucket via Supabase dashboard or API:
-- name: nexus-documents, public: false

INSERT INTO storage.buckets (id, name, public)
VALUES ('nexus-documents', 'nexus-documents', false)
ON CONFLICT DO NOTHING;

-- Admin: full access to their company folder
CREATE POLICY storage_admin_all ON storage.objects
  FOR ALL USING (
    bucket_id = 'nexus-documents'
    AND auth.is_admin()
    AND (storage.foldername(name))[1] = auth.active_company_id()::TEXT
  );

-- Client: read-only access to their folder
CREATE POLICY storage_client_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'nexus-documents'
    AND auth.user_role() = 'client'
    AND (storage.foldername(name))[1] = auth.active_company_id()::TEXT
    AND (storage.foldername(name))[2] = auth.user_client_id()::TEXT
  );
