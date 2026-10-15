-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.exercise_rep_bests (
  p_exercise_id text
)
  RETURNS TABLE (
    reps       smallint,
    weight_kg  numeric,
    started_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with best as (
    select distinct on (v.reps) v.reps, v.weight_kg, v.started_at
    from public.workout_set_values v
    where v.user_id = (select auth.uid())
      and v.exercise_id = p_exercise_id
      and v.tracking in ('weight_reps', 'weighted_reps')
      and v.weight_counts
      and v.reps <= 30
    order by v.reps, v.weight_kg desc, v.started_at
  ),
  beaten as (
    select
      b.*,
      max(b.weight_kg) over (order by b.reps desc rows between unbounded preceding and 1 preceding) as above
    from best b
  )
  select x.reps, x.weight_kg, x.started_at
  from beaten x
  where x.above is null or x.weight_kg > x.above
  order by x.reps;
$function$;

COMMENT ON FUNCTION public.exercise_rep_bests(text) IS 'The heaviest weight lifted for each rep count up to 30 of a weighted exercise, keeping only counts that nothing as heavy at more reps has matched. Warm-ups excluded.';

GRANT ALL ON FUNCTION public.exercise_rep_bests(text) TO authenticated;

-- `db diff` does not see the schema's revoke, so `create function`'s default
-- EXECUTE to PUBLIC would ship without it.
REVOKE ALL ON FUNCTION public.exercise_rep_bests(text) FROM PUBLIC, anon;
