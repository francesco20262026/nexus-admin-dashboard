-- ==============================================================
-- SQL Schema Migration: Extend Invoices Table for Governance Redesign
-- 
-- Goal: Transform Invoices table into a central control hub for the Proforma -> Windoc lifecycle.
-- Adds relations to Contracts and Supplier Companies.
-- ==============================================================

-- 1. Add origin contract relation
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;

-- 2. Add supplier company relation (the entity issuing the invoice)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- 3. (Optional) Audit logs or existing timeline will reference the invoice naturally. 
