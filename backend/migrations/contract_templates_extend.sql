-- ============================================================
-- Migration: contract_templates_extend.sql
-- Extends document_templates with governance fields and
-- extends contracts with origin tracking fields.
-- Run manually in Supabase Studio > SQL Editor
-- ============================================================

-- ── 1. Extend document_templates ─────────────────────────────

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS contract_type          TEXT,           -- 'service','maintenance','consulting','other'
  ADD COLUMN IF NOT EXISTS is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS version                TEXT,           -- e.g. '1.0', '2025-v2'
  ADD COLUMN IF NOT EXISTS supplier_company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes                  TEXT,
  ADD COLUMN IF NOT EXISTS compatible_service_ids UUID[]          -- quick reference to compatible catalog services
;

COMMENT ON COLUMN document_templates.contract_type       IS 'Tipo contratto: service | maintenance | consulting | other';
COMMENT ON COLUMN document_templates.is_active           IS 'Template attivo/disattivo. I template inattivi non possono essere usati in nuovi contratti.';
COMMENT ON COLUMN document_templates.version             IS 'Versione del template (es. 1.0, 2025-v1).';
COMMENT ON COLUMN document_templates.supplier_company_id IS 'Azienda fornitrice a cui appartiene questo template.';
COMMENT ON COLUMN document_templates.notes               IS 'Note operative/regole di utilizzo del template.';
COMMENT ON COLUMN document_templates.compatible_service_ids IS 'Elenco UUID dei servizi del catalogo compatibili con questo template.';

-- ── 2. Extend contracts ───────────────────────────────────────

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS origin              TEXT NOT NULL DEFAULT 'direct',    -- 'direct' | 'from_quote' | 'supplier_change'
  ADD COLUMN IF NOT EXISTS source_company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,  -- vecchio fornitore, usato in supplier_change
  ADD COLUMN IF NOT EXISTS supplier_company_id UUID REFERENCES companies(id) ON DELETE SET NULL   -- fornitore attivo al momento della creazione
;

COMMENT ON COLUMN contracts.origin             IS 'Origine del contratto: direct | from_quote | supplier_change';
COMMENT ON COLUMN contracts.source_company_id  IS 'Vecchia azienda fornitrice (solo per origin=supplier_change).';
COMMENT ON COLUMN contracts.supplier_company_id IS 'Azienda fornitrice attiva al momento della creazione del contratto.';

-- ── 3. Backfill origin for existing contracts ─────────────────

UPDATE contracts
  SET origin = 'from_quote'
  WHERE quote_id IS NOT NULL AND origin = 'direct';

-- ── 4. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_document_templates_is_active    ON document_templates (is_active);
CREATE INDEX IF NOT EXISTS idx_document_templates_contract_type ON document_templates (contract_type);
CREATE INDEX IF NOT EXISTS idx_document_templates_supplier     ON document_templates (supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_origin               ON contracts (origin);
CREATE INDEX IF NOT EXISTS idx_contracts_supplier             ON contracts (supplier_company_id);
