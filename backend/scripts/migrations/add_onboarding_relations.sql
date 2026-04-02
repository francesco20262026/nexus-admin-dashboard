-- ==============================================================
-- SQL Schema Migration: Enable Dual-Key Association for Relational Entities
-- 
-- Goal: Allow Records (Services, Quotes, Documents, Contracts) to belong
-- to an Onboarding Prospect OR a Client seamlessly.
-- ==============================================================

-- 1. Client Services (Subscriptions)
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;
ALTER TABLE client_services ALTER COLUMN client_id DROP NOT NULL;

-- 2. Quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;
ALTER TABLE quotes ALTER COLUMN client_id DROP NOT NULL;

-- 3. Documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;
ALTER TABLE documents ALTER COLUMN client_id DROP NOT NULL;

-- 4. Contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;
ALTER TABLE contracts ALTER COLUMN client_id DROP NOT NULL;
