-- Add visibility field to documents for "Interno" / "Condiviso" sharing feature
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal';
