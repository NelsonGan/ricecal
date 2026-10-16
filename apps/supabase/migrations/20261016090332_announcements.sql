-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.profiles
  ADD COLUMN seen_announcements text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_seen_announcements_check CHECK (cardinality(seen_announcements) <= 200 AND octet_length(array_to_string(seen_announcements, ','::text)) <= 8000);

REVOKE UPDATE
  (activity_level, auto_post_foods, auto_post_workouts, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex,
  target_weight_kg, timezone) ON public.profiles FROM authenticated;

GRANT UPDATE
  (activity_level, auto_post_foods, auto_post_workouts, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source,
  seen_announcements, sex, target_weight_kg, timezone) ON public.profiles TO authenticated;