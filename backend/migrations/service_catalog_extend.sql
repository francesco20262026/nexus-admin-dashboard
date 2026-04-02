-- ============================================================
-- Service Catalog Schema Extension
-- Run this in Supabase Studio > SQL Editor
-- ============================================================

-- 1. Add new columns to services_catalog
ALTER TABLE services_catalog
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS standard_duration_months integer,
  ADD COLUMN IF NOT EXISTS renewal_rule text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS visible_in_quotes boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS visible_in_onboarding boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Migrate notes from template_vars (if present)
UPDATE services_catalog
SET notes = template_vars->>'servizio_clausole'
WHERE (template_vars->>'servizio_clausole') IS NOT NULL AND notes IS NULL;

-- 3. Create stats view
DROP VIEW IF EXISTS v_services_catalog_stats;
CREATE VIEW v_services_catalog_stats AS
SELECT
    sc.*,
    COALESCE(sub_stats.active_clients_count, 0)      AS active_clients_count,
    COALESCE(sub_stats.onboarding_linked_count, 0)   AS onboarding_linked_count,
    COALESCE(sub_stats.total_subscriptions_count, 0) AS total_subscriptions_count
FROM services_catalog sc
LEFT JOIN (
    SELECT
        service_id,
        COUNT(DISTINCT client_id) FILTER (WHERE status = 'active' AND client_id IS NOT NULL)  AS active_clients_count,
        COUNT(DISTINCT onboarding_id) FILTER (WHERE onboarding_id IS NOT NULL)                AS onboarding_linked_count,
        COUNT(*) AS total_subscriptions_count
    FROM client_services
    GROUP BY service_id
) sub_stats ON sub_stats.service_id = sc.id;
