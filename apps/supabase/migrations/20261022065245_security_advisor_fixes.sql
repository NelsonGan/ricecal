-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP INDEX public.social_profiles_avatar_idx;

DROP INDEX public.workouts_routine_idx;

CREATE VIEW private.social_profiles AS SELECT id AS user_id,
    COALESCE(handle, ''::text) AS handle,
    display_name,
    bio,
        CASE
            WHEN (avatar_path ~~ (('avatars/'::text || (id)::text) || '/%'::text)) THEN avatar_path
            ELSE NULL::text
        END AS avatar_path,
        CASE
            WHEN (avatar_path ~~ (('avatars/'::text || (id)::text) || '/%'::text)) THEN photo_etag
            ELSE NULL::text
        END AS photo_etag,
    review_status,
    review_reason,
    revision,
    quarantined,
    created_at,
    updated_at,
    is_private
   FROM public.profiles p
  WHERE private.social_can_view_profile(id);

GRANT SELECT ON private.social_profiles TO authenticated;

GRANT SELECT ON private.social_profiles TO service_role;

CREATE POLICY "Server only" ON public.barcode_misses
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX food_scan_items_food_log_idx ON public.food_scan_items (food_log_id);

CREATE INDEX food_scan_items_user_idx ON public.food_scan_items (user_id);

CREATE POLICY "Server only" ON public.food_scan_items
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.food_scan_misses
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_invites
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_members
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_message_reports
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_messages
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_nudges
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_reactions
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.group_reports
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.groups
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.job_runs
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX social_profiles_avatar_idx ON public.profiles ((
CASE
    WHEN avatar_path ~~ (('avatars/'::text || id::text) || '/%'::text) THEN avatar_path
    ELSE NULL::text
END))
  WHERE review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE POLICY "Server only" ON public.push_tokens
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX recipe_saves_user_idx ON public.recipe_saves (user_id);

CREATE POLICY "Server only" ON public.recipe_saves
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.social_counters
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Server only" ON public.social_rate_limits
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX workouts_routine_idx ON public.workouts (routine_id, user_id)
  WHERE routine_id IS NOT NULL;

CREATE OR REPLACE VIEW public.social_profiles WITH (security_invoker=true) AS SELECT user_id,
    handle,
    display_name,
    bio,
    avatar_path,
    photo_etag,
    review_status,
    review_reason,
    revision,
    quarantined,
    created_at,
    updated_at,
    is_private
   FROM private.social_profiles s;
-- `db diff` does not carry revokes; restate them so no default grant survives.
revoke all on private.social_profiles from public, anon, authenticated;
grant select on private.social_profiles to authenticated, service_role;
revoke all on public.social_profiles from public, anon, authenticated;
grant select on public.social_profiles to authenticated, service_role;
