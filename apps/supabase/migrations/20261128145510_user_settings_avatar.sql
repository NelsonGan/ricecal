-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.user_settings
  ADD COLUMN avatar jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_avatar_check CHECK (jsonb_typeof(avatar) = 'object'::text AND pg_column_size(avatar) <= 2048);
