-- An assisted or weighted body weight set's load is the body weight that day
-- less the assistance or plus what was added, and its volume is that load
-- times the reps. The new column is appended, so both views are replaced in
-- place and nothing that reads them is dropped.

SET check_function_bodies = false;

CREATE OR REPLACE VIEW public.workout_set_values WITH (security_invoker=true) AS SELECT s.id,
    s.user_id,
    e.workout_id,
    s.workout_exercise_id,
    e.exercise_id,
    e.exercise_name,
    e.tracking,
    e."position" AS exercise_position,
    s."position",
    s.kind,
    s.weight_kg,
    s.reps,
    s.duration_s,
    s.distance_m,
    s.rpe,
    w.started_at,
    w.log_date,
        CASE
            WHEN ((s.reps > 0) AND (l.load_kg > (0)::numeric)) THEN (l.load_kg * (s.reps)::numeric)
            ELSE NULL::numeric
        END AS volume_kg,
        CASE
            WHEN ((e.tracking = 'weight_reps'::public.exercise_tracking) AND (s.weight_kg > (0)::numeric) AND (s.reps = 1)) THEN s.weight_kg
            WHEN ((e.tracking = 'weight_reps'::public.exercise_tracking) AND (s.weight_kg > (0)::numeric) AND ((s.reps >= 2) AND (s.reps <= 15))) THEN round(((s.weight_kg * ((30 + s.reps))::numeric) / 30.0), 1)
            ELSE NULL::numeric
        END AS e1rm_kg,
    (s.kind <> 'warmup'::public.workout_set_kind) AS counts,
    COALESCE(((s.kind <> 'warmup'::public.workout_set_kind) AND (s.weight_kg > (0)::numeric) AND (((e.tracking = ANY (ARRAY['weight_reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking])) AND (s.reps >= 1)) OR ((e.tracking = 'weight_distance'::public.exercise_tracking) AND (s.distance_m > (0)::numeric)))), false) AS weight_counts,
    l.load_kg
   FROM ((((public.workout_sets s
     JOIN public.workout_exercises e ON ((e.id = s.workout_exercise_id)))
     JOIN public.workouts w ON ((w.id = e.workout_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(( SELECT x.weight_kg
                   FROM public.weight_logs x
                  WHERE ((x.user_id = w.user_id) AND (x.measured_on <= w.log_date))
                  ORDER BY x.measured_on DESC
                 LIMIT 1), ( SELECT x.weight_kg
                   FROM public.weight_logs x
                  WHERE ((x.user_id = w.user_id) AND (x.measured_on > w.log_date))
                  ORDER BY x.measured_on
                 LIMIT 1)) AS weight_kg
          WHERE (e.tracking = ANY (ARRAY['weighted_reps'::public.exercise_tracking, 'assisted_reps'::public.exercise_tracking]))) b ON (true))
     CROSS JOIN LATERAL ( SELECT
                CASE e.tracking
                    WHEN 'weight_reps'::public.exercise_tracking THEN s.weight_kg
                    WHEN 'weighted_reps'::public.exercise_tracking THEN (COALESCE(b.weight_kg, (0)::numeric) + COALESCE(s.weight_kg, (0)::numeric))
                    WHEN 'assisted_reps'::public.exercise_tracking THEN
                    CASE
                        WHEN (b.weight_kg IS NOT NULL) THEN GREATEST((b.weight_kg - COALESCE(s.weight_kg, (0)::numeric)), (0)::numeric)
                        ELSE NULL::numeric
                    END
                    ELSE NULL::numeric
                END AS load_kg) l);

CREATE OR REPLACE VIEW public.workout_set_details WITH (security_invoker=true) AS WITH bests AS (
         SELECT v.user_id,
            v.exercise_id,
            v.workout_id,
            v.started_at,
            max(v.weight_kg) FILTER (WHERE v.weight_counts) AS weight_kg,
            max(v.e1rm_kg) FILTER (WHERE v.counts) AS e1rm_kg,
            max(v.volume_kg) FILTER (WHERE v.counts) AS volume_kg,
            max(v.reps) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking, 'assisted_reps'::public.exercise_tracking])))) AS reps,
            max(v.duration_s) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['duration'::public.exercise_tracking, 'distance_duration'::public.exercise_tracking])))) AS duration_s,
            max(v.distance_m) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['distance_duration'::public.exercise_tracking, 'weight_distance'::public.exercise_tracking])))) AS distance_m
           FROM public.workout_set_values v
          GROUP BY v.user_id, v.exercise_id, v.workout_id, v.started_at
        ), prior AS (
         SELECT b.workout_id,
            b.exercise_id,
            max(b.weight_kg) OVER earlier AS prior_weight,
            max(b.e1rm_kg) OVER earlier AS prior_e1rm,
            max(b.volume_kg) OVER earlier AS prior_volume,
            max(b.reps) OVER earlier AS prior_reps,
            max(b.duration_s) OVER earlier AS prior_duration,
            max(b.distance_m) OVER earlier AS prior_distance
           FROM bests b
          WINDOW earlier AS (PARTITION BY b.user_id, b.exercise_id ORDER BY b.started_at, b.workout_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
        ), joined AS (
         SELECT v.id,
            v.user_id,
            v.workout_id,
            v.workout_exercise_id,
            v.exercise_id,
            v.exercise_name,
            v.tracking,
            v.exercise_position,
            v."position",
            v.kind,
            v.weight_kg,
            v.reps,
            v.duration_s,
            v.distance_m,
            v.rpe,
            v.started_at,
            v.log_date,
            v.volume_kg,
            v.e1rm_kg,
            v.counts,
            v.weight_counts,
            v.load_kg,
            p.prior_weight,
            p.prior_e1rm,
            p.prior_volume,
            p.prior_reps,
            p.prior_duration,
            p.prior_distance
           FROM (public.workout_set_values v
             JOIN prior p ON (((p.workout_id = v.workout_id) AND (p.exercise_id = v.exercise_id))))
        ), ranked AS (
         SELECT j.id,
            j.user_id,
            j.workout_id,
            j.workout_exercise_id,
            j.exercise_id,
            j.exercise_name,
            j.tracking,
            j.exercise_position,
            j."position",
            j.kind,
            j.weight_kg,
            j.reps,
            j.duration_s,
            j.distance_m,
            j.rpe,
            j.started_at,
            j.log_date,
            j.volume_kg,
            j.e1rm_kg,
            j.counts,
            j.weight_counts,
            j.load_kg,
            j.prior_weight,
            j.prior_e1rm,
            j.prior_volume,
            j.prior_reps,
            j.prior_duration,
            j.prior_distance,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.weight_counts DESC, j.weight_kg DESC NULLS LAST, j.reps DESC NULLS LAST, j.exercise_position, j."position") AS weight_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.e1rm_kg DESC NULLS LAST, j.exercise_position, j."position") AS e1rm_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.volume_kg DESC NULLS LAST, j.exercise_position, j."position") AS volume_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.reps DESC NULLS LAST, j.exercise_position, j."position") AS reps_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.duration_s DESC NULLS LAST, j.exercise_position, j."position") AS duration_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.distance_m DESC NULLS LAST, j.exercise_position, j."position") AS distance_rank
           FROM joined j
        )
 SELECT id,
    user_id,
    workout_id,
    workout_exercise_id,
    exercise_id,
    exercise_position,
    "position",
    kind,
    weight_kg,
    reps,
    duration_s,
    distance_m,
    rpe,
    started_at,
    volume_kg,
    e1rm_kg,
    COALESCE((weight_counts AND (weight_rank = 1) AND (weight_kg > prior_weight)), false) AS is_weight_pr,
    COALESCE((counts AND (e1rm_rank = 1) AND (e1rm_kg > prior_e1rm)), false) AS is_e1rm_pr,
    COALESCE((counts AND (volume_rank = 1) AND (volume_kg > prior_volume)), false) AS is_volume_pr,
    COALESCE((counts AND (reps_rank = 1) AND (tracking = ANY (ARRAY['reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking, 'assisted_reps'::public.exercise_tracking])) AND (reps > prior_reps)), false) AS is_reps_pr,
    COALESCE((counts AND (duration_rank = 1) AND (tracking = ANY (ARRAY['duration'::public.exercise_tracking, 'distance_duration'::public.exercise_tracking])) AND (duration_s > prior_duration)), false) AS is_duration_pr,
    COALESCE((counts AND (distance_rank = 1) AND (tracking = ANY (ARRAY['distance_duration'::public.exercise_tracking, 'weight_distance'::public.exercise_tracking])) AND (distance_m > prior_distance)), false) AS is_distance_pr
   FROM ranked r;

COMMENT ON VIEW public.workout_set_values IS 'Every saved set with its load, volume and Epley estimated 1RM, and whether it can hold a weight record. No records: those are workout_set_details.';
