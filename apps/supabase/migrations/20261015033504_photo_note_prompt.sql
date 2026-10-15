-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.user_settings
  ADD COLUMN photo_note_prompt boolean DEFAULT true NOT NULL;