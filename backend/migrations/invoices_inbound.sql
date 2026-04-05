-- ==============================================================
-- SQL Schema Migration: ERP Inbound vs Outbound
-- 
-- Goal: Transform Invoices table to support purchase invoices.
-- ==============================================================

-- 1. Add direction column (default outbound)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS direction VARCHAR(50) DEFAULT 'outbound';

-- 2. Add column for physical PDF of the inbound invoice
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path VARCHAR(512);

-- 3. Add column for raw parsed data from LLM
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parsed_data JSONB;
