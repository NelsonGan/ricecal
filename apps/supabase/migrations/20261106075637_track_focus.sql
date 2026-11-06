-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.user_settings
  ADD COLUMN track_focus text DEFAULT 'calories'::text NOT NULL;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_track_focus_check CHECK (track_focus = ANY (ARRAY['calories'::text, 'protein'::text]));