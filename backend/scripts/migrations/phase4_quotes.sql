-- Migration per la Fase 4: Nuova Gestione Preventivi
-- Obiettivo: Aggiungere i nuovi campi alla tabella quotes per supportare il nuovo flusso di lavoro CRM.

-- 1. management_channel: Definisce se il preventivo è gestito formalmente (email inviata), a voce ('verbal'), o in forma solo interna ('internal').
-- Default a 'formal_sent' per retrocompatibilità coi vecchi preventivi.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS management_channel TEXT DEFAULT 'formal_sent';

-- 2. number: Numero progressivo univoco in formato stringa.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS number TEXT;

-- 3. contract_id: Collegamento bi-direzionale opzionale a un contratto generato da questo preventivo.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;

-- 4. created_by: Riferimento all'operatore che ha generato il preventivo.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. supplier_company_id: Azienda fornitrice che emette il preventivo (utilissimo se l'azienda madre funge da gruppo per più ragioni sociali).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS supplier_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- Commentiamo la tabella per documentazione
COMMENT ON COLUMN quotes.management_channel IS 'Defines management type: formal_sent (default), verbal, internal';
COMMENT ON COLUMN quotes.number IS 'Standardized sequence number (e.g. PREV-2026-001)';
COMMENT ON COLUMN quotes.contract_id IS 'Quick reference to the contract generated from this quote';
