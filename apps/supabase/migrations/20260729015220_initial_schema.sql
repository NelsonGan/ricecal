-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE EXTENSION pg_trgm WITH SCHEMA extensions;

CREATE TYPE public.activity_level AS ENUM (
  'sedentary',
  'light',
  'on_feet',
  'very_active'
);

CREATE TYPE public.badge_tone AS ENUM (
  'pandan',
  'hibiscus',
  'water',
  'kaya'
);

CREATE TYPE public.energy_unit AS ENUM (
  'kcal',
  'kj'
);

CREATE TYPE public.entry_source AS ENUM (
  'search',
  'quick_add',
  'camera',
  'voice',
  'barcode',
  'import'
);

CREATE TYPE public.food_place AS ENUM (
  'mamak',
  'kopitiam',
  'hawker',
  'packaged',
  'home'
);

CREATE TYPE public.icon_set AS ENUM (
  'body',
  'dishes',
  'food',
  'system',
  'ui'
);

CREATE TYPE public.meal AS ENUM (
  'breakfast',
  'lunch',
  'dinner',
  'snack'
);

CREATE TYPE public.measurement_source AS ENUM (
  'manual',
  'healthkit',
  'health_connect',
  'smart_scale',
  'import'
);

CREATE TYPE public.session_kind AS ENUM (
  'run',
  'badminton',
  'gym',
  'walk',
  'cycle',
  'swim',
  'other'
);

CREATE TYPE public.sex AS ENUM (
  'female',
  'male'
);

CREATE TYPE public.subscription_plan AS ENUM (
  'monthly',
  'yearly'
);

CREATE TYPE public.subscription_status AS ENUM (
  'none',
  'trial',
  'active',
  'expired',
  'billing_retry'
);

CREATE TYPE public.unit_system AS ENUM (
  'metric',
  'imperial'
);

CREATE TYPE public.weight_goal AS ENUM (
  'lose',
  'maintain',
  'gain',
  'track'
);

CREATE FUNCTION public.compute_targets (
  p_sex        public.sex,
  p_birth_date date,
  p_height_cm  numeric,
  p_weight_kg  numeric,
  p_activity   public.activity_level,
  p_goal       public.weight_goal
)
  RETURNS TABLE (
    kcal      integer,
    carbs_g   integer,
    protein_g integer,
    fat_g     integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with basal as (
    select
      10 * p_weight_kg
      + 6.25 * p_height_cm
      - 5 * extract(year from age(current_date, p_birth_date))
      + case when p_sex = 'male' then 5 else -161 end as bmr
  ),
  budget as (
    select round(
      (
        bmr * case p_activity
          when 'sedentary'   then 1.2
          when 'light'       then 1.375
          when 'on_feet'     then 1.55
          when 'very_active' then 1.725
        end
        + case p_goal
          when 'lose'     then -400
          when 'gain'     then  300
          else 0
        end
      ) / 10
    ) * 10 as kcal
    from basal
  )
  select
    greatest(kcal, 1000)::integer,
    round(greatest(kcal, 1000) * 0.47 / 4)::integer,
    round(greatest(kcal, 1000) * 0.22 / 4)::integer,
    round(greatest(kcal, 1000) * 0.31 / 9)::integer
  from budget;
$function$;

COMMENT ON FUNCTION public.compute_targets(public.sex,date,numeric,numeric,public.activity_level,public.weight_goal) IS 'Daily calorie and macro budget from body stats. Floored at 1000 kcal: the inputs are user-entered and an implausible combination should produce a conservative target, not one that is unsafe to eat to.';

CREATE FUNCTION public.current_weight_kg (
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS numeric
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select w.weight_kg
  from public.weight_logs w
  where w.user_id = p_user_id
  order by w.measured_on desc
  limit 1;
$function$;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Whatever the identity provider told us. Apple gives a name on the first
  -- sign-in only, Google gives one every time, email/password gives none — so
  -- the local part of the address is the last resort before an empty string,
  -- which the onboarding name step then fills in.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      ''
    )
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Sensible Malaysian defaults, reminders off. A notification the user never
  -- asked for on the day they sign up is how an app gets its permission
  -- revoked; the reminders screen turns them on.
  insert into public.meal_times (user_id, meal, at, reminder_enabled)
  values
    (new.id, 'breakfast', time '08:00', false),
    (new.id, 'lunch',     time '13:00', false),
    (new.id, 'dinner',    time '19:30', false),
    (new.id, 'snack',     time '16:00', false)
  on conflict (user_id, meal) do nothing;

  -- No `daily_goals` row. It cannot be computed before onboarding has
  -- collected a body, and a placeholder budget is worse than none: the Today
  -- screen would render a ring against a number nobody chose.
  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates the rows every signed-in screen assumes exist. Deliberately strict: if it raises, signup fails, which is louder and more fixable than an account that exists with nothing behind it.';

CREATE FUNCTION public.local_today (
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS date
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (
    now() at time zone coalesce(
      (select p.timezone from public.profiles p where p.id = p_user_id),
      'Asia/Kuala_Lumpur'
    )
  )::date;
$function$;

COMMENT ON FUNCTION public.local_today(uuid) IS 'The calling user''s current calendar date, in their own timezone. Falls back to Asia/Kuala_Lumpur when there is no profile yet, which is only true between the auth row and the onboarding write.';

CREATE FUNCTION public.logging_streak (
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    current_days integer,
    best_days    integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with logged as (
    select distinct e.log_date
    from public.food_logs e
    where e.user_id = p_user_id
  ),
  islands as (
    select
      l.log_date,
      l.log_date - (row_number() over (order by l.log_date))::integer as island
    from logged l
  ),
  runs as (
    select count(*)::integer as length, max(i.log_date) as ended_on
    from islands i
    group by i.island
  )
  select
    coalesce(
      max(r.length) filter (
        where r.ended_on >= public.local_today(p_user_id) - 1
      ),
      0
    )::integer,
    coalesce(max(r.length), 0)::integer
  from runs r;
$function$;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE FUNCTION public.sync_daily_goals()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user_id  uuid;
  v_profile  public.profiles%rowtype;
  v_weight   numeric;
  v_today    date;
  v_current  public.daily_goals%rowtype;
  v_computed record;
begin
  -- Attached to two tables whose owner columns are named differently, and to
  -- DELETE where there is no NEW row.
  --
  -- This is an IF and not a CASE expression on purpose. PL/pgSQL resolves the
  -- field references in EVERY branch of a CASE, so `case … then new.id else
  -- new.user_id end` fails with `record "new" has no field "user_id"` while
  -- firing on `profiles` — the branch it never takes is what breaks it. The
  -- branches of an IF are separate statements and only the taken one is
  -- evaluated.
  --
  -- Likewise `coalesce(new, old)`: OLD is unassigned during INSERT, and
  -- touching it raises rather than returning null.
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  elsif tg_table_name = 'profiles' then
    v_user_id := new.id;
  else
    v_user_id := new.user_id;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  -- Onboarding fills the profile one screen at a time, so most of these calls
  -- happen before there is enough to compute anything. Returning quietly is
  -- correct: the write that completes the set will fire this again.
  if v_profile.id is null
     or v_profile.sex is null
     or v_profile.birth_date is null
     or v_profile.height_cm is null then
    return null;
  end if;

  v_weight := public.current_weight_kg(v_user_id);
  if v_weight is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'Asia/Kuala_Lumpur'))::date;

  select * into v_current
  from public.daily_goals
  where user_id = v_user_id and effective_from <= v_today
  order by effective_from desc
  limit 1;

  if coalesce(v_current.is_custom, false) then
    return null;
  end if;

  select * into v_computed
  from public.compute_targets(
    v_profile.sex,
    v_profile.birth_date,
    v_profile.height_cm,
    v_weight,
    v_profile.activity_level,
    v_profile.weight_goal
  );

  -- Written against today, not against the row that is currently in force.
  -- A new budget applies from now on; yesterday was still measured against
  -- yesterday's target, which is the entire point of the effective_from key.
  --
  -- Water and steps are carried forward rather than recomputed: they are not
  -- derived from body stats, and resetting them to the defaults on every
  -- profile edit would quietly undo a user's own choice.
  insert into public.daily_goals as g (
    user_id, effective_from, kcal, carbs_g, protein_g, fat_g,
    water_glasses, steps, is_custom
  )
  values (
    v_user_id, v_today,
    v_computed.kcal, v_computed.carbs_g, v_computed.protein_g, v_computed.fat_g,
    coalesce(v_current.water_glasses, 8),
    coalesce(v_current.steps, 8000),
    false
  )
  on conflict (user_id, effective_from) do update
    set kcal      = excluded.kcal,
        carbs_g   = excluded.carbs_g,
        protein_g = excluded.protein_g,
        fat_g     = excluded.fat_g
    where not g.is_custom;

  return null;
end;
$function$;

CREATE TABLE public.achievements (
  key        text                     NOT NULL,
  icon_set   public.icon_set          DEFAULT 'system'::public.icon_set NOT NULL,
  icon_name  text                     NOT NULL,
  tone       public.badge_tone        DEFAULT 'pandan'::public.badge_tone NOT NULL,
  "position" smallint                 DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.achievements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_key_check CHECK (key ~ '^[a-zA-Z][a-zA-Z0-9]*$'::text);

ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_pkey PRIMARY KEY (key);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.achievements TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.achievements TO authenticated;

GRANT ALL ON public.achievements TO service_role;

CREATE TRIGGER achievements_set_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "achievements: readable by signed-in users" ON public.achievements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.daily_activity (
  user_id               uuid                      NOT NULL,
  log_date              date                      NOT NULL,
  steps                 integer                   DEFAULT 0 NOT NULL,
  move_kcal             integer                   DEFAULT 0 NOT NULL,
  move_goal_kcal        integer,
  exercise_minutes      integer                   DEFAULT 0 NOT NULL,
  exercise_goal_minutes integer,
  stand_hours           smallint                  DEFAULT 0 NOT NULL,
  stand_goal_hours      smallint,
  source                public.measurement_source DEFAULT 'healthkit'::public.measurement_source NOT NULL,
  synced_at             timestamp with time zone  DEFAULT now() NOT NULL,
  created_at            timestamp with time zone  DEFAULT now() NOT NULL,
  updated_at            timestamp with time zone  DEFAULT now() NOT NULL
);

ALTER TABLE public.daily_activity
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_exercise_goal_minutes_check CHECK (exercise_goal_minutes > 0);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_exercise_minutes_check CHECK (exercise_minutes >= 0 AND exercise_minutes <= 1440);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_move_goal_kcal_check CHECK (move_goal_kcal > 0);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_move_kcal_check CHECK (move_kcal >= 0 AND move_kcal <= 20000);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_pkey PRIMARY KEY (user_id, log_date);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_stand_goal_hours_check CHECK (stand_goal_hours >= 1 AND stand_goal_hours <= 24);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_stand_hours_check CHECK (stand_hours >= 0 AND stand_hours <= 24);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_steps_check CHECK (steps >= 0 AND steps <= 200000);

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_activity TO anon;

GRANT ALL ON public.daily_activity TO authenticated;

GRANT ALL ON public.daily_activity TO service_role;

CREATE INDEX daily_activity_user_date_idx ON public.daily_activity (user_id, log_date DESC);

CREATE TRIGGER daily_activity_set_updated_at
  BEFORE UPDATE ON public.daily_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "daily_activity: delete own" ON public.daily_activity
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_activity: insert own" ON public.daily_activity
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_activity: read own" ON public.daily_activity
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_activity: update own" ON public.daily_activity
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.daily_goals (
  user_id        uuid                     NOT NULL,
  effective_from date                     NOT NULL,
  kcal           integer                  NOT NULL,
  carbs_g        integer                  NOT NULL,
  protein_g      integer                  NOT NULL,
  fat_g          integer                  NOT NULL,
  water_glasses  smallint                 DEFAULT 8 NOT NULL,
  steps          integer                  DEFAULT 8000 NOT NULL,
  is_custom      boolean                  DEFAULT false NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE FUNCTION public.goals_on (
  p_date    date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS public.daily_goals
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select g.*
  from public.daily_goals g
  where g.user_id = p_user_id and g.effective_from <= p_date
  order by g.effective_from desc
  limit 1;
$function$;

ALTER TABLE public.daily_goals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_carbs_g_check CHECK (carbs_g >= 0);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_fat_g_check CHECK (fat_g >= 0);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_kcal_check CHECK (kcal >= 800 AND kcal <= 10000);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_pkey PRIMARY KEY (user_id, effective_from);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_protein_g_check CHECK (protein_g >= 0);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_steps_check CHECK (steps >= 0 AND steps <= 100000);

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_water_glasses_check CHECK (water_glasses >= 1 AND water_glasses <= 30);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_goals TO anon;

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.daily_goals TO authenticated;

GRANT ALL ON public.daily_goals TO service_role;

CREATE INDEX daily_goals_user_effective_idx ON public.daily_goals (user_id, effective_from DESC);

CREATE TRIGGER daily_goals_set_updated_at
  BEFORE UPDATE ON public.daily_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "daily_goals: insert own" ON public.daily_goals
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_goals: read own" ON public.daily_goals
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_goals: update own" ON public.daily_goals
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.daily_logs (
  user_id       uuid                     NOT NULL,
  log_date      date                     NOT NULL,
  water_glasses smallint                 DEFAULT 0 NOT NULL,
  note          text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.daily_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_note_check CHECK (char_length(note) <= 1000);

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_pkey PRIMARY KEY (user_id, log_date);

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_water_glasses_check CHECK (water_glasses >= 0 AND water_glasses <= 60);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_logs TO anon;

GRANT ALL ON public.daily_logs TO authenticated;

GRANT ALL ON public.daily_logs TO service_role;

CREATE TRIGGER daily_logs_set_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "daily_logs: delete own" ON public.daily_logs
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_logs: insert own" ON public.daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_logs: read own" ON public.daily_logs
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "daily_logs: update own" ON public.daily_logs
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.food_logs (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     NOT NULL,
  log_date   date                     DEFAULT public.local_today() NOT NULL,
  meal       public.meal              NOT NULL,
  food_id    uuid                     NOT NULL,
  serving_id uuid                     NOT NULL,
  quantity   numeric(6,2)             DEFAULT 1 NOT NULL,
  logged_at  timestamp with time zone DEFAULT now() NOT NULL,
  note       text,
  source     public.entry_source      DEFAULT 'search'::public.entry_source NOT NULL,
  photo_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_note_check CHECK (char_length(note) <= 500);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_quantity_check CHECK (quantity > 0::numeric AND quantity <= 100::numeric);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_logs TO anon;

GRANT ALL ON public.food_logs TO authenticated;

GRANT ALL ON public.food_logs TO service_role;

CREATE INDEX food_logs_serving_idx ON public.food_logs (serving_id);

CREATE INDEX food_logs_user_food_idx ON public.food_logs (user_id, food_id);

CREATE INDEX food_logs_user_date_idx ON public.food_logs (user_id, log_date DESC, logged_at);

CREATE TRIGGER food_logs_set_updated_at
  BEFORE UPDATE ON public.food_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "food_logs: delete own" ON public.food_logs
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "food_logs: insert own" ON public.food_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "food_logs: read own" ON public.food_logs
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "food_logs: update own" ON public.food_logs
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.food_servings (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  food_id    uuid                     NOT NULL,
  slug       text                     NOT NULL,
  label      text                     NOT NULL,
  factor     numeric(6,3)             NOT NULL,
  is_default boolean                  DEFAULT false NOT NULL,
  "position" smallint                 DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_servings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_default_is_unit CHECK (NOT is_default OR factor = 1::numeric);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_factor_check CHECK (factor > 0::numeric AND factor <= 100::numeric);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_food_id_id_key UNIQUE (food_id, id);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_food_serving_fkey FOREIGN KEY (food_id, serving_id) REFERENCES public.food_servings(food_id, id) ON DELETE RESTRICT;

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_label_check CHECK (char_length(TRIM(BOTH FROM label)) >= 1 AND char_length(TRIM(BOTH FROM label)) <= 40);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_pkey PRIMARY KEY (id);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_slug_unique UNIQUE (food_id, slug);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_servings TO anon;

GRANT ALL ON public.food_servings TO authenticated;

GRANT ALL ON public.food_servings TO service_role;

CREATE INDEX food_servings_food_idx ON public.food_servings (food_id);

CREATE UNIQUE INDEX food_servings_one_default_idx ON public.food_servings (food_id)
  WHERE is_default;

CREATE TRIGGER food_servings_set_updated_at
  BEFORE UPDATE ON public.food_servings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foods (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  owner_id   uuid,
  slug       text,
  name       text                     NOT NULL,
  brand      text,
  icon_set   public.icon_set          DEFAULT 'dishes'::public.icon_set NOT NULL,
  icon_name  text                     NOT NULL,
  place      public.food_place        DEFAULT 'hawker'::public.food_place NOT NULL,
  kcal       integer                  NOT NULL,
  carbs_g    numeric(6,1)             DEFAULT 0 NOT NULL,
  protein_g  numeric(6,1)             DEFAULT 0 NOT NULL,
  fat_g      numeric(6,1)             DEFAULT 0 NOT NULL,
  fibre_g    numeric(6,1),
  sugar_g    numeric(6,1),
  sodium_mg  integer,
  verified   boolean                  DEFAULT false NOT NULL,
  source     text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "food_servings: delete with own food" ON public.food_servings
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_servings.food_id) AND (f.owner_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "food_servings: read with food" ON public.food_servings
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_servings.food_id) AND ((f.owner_id IS NULL) OR (f.owner_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "food_servings: update with own food" ON public.food_servings
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_servings.food_id) AND (f.owner_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_servings.food_id) AND (f.owner_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "food_servings: write with own food" ON public.food_servings
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_servings.food_id) AND (f.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.foods
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_carbs_g_check CHECK (carbs_g >= 0::numeric);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_fat_g_check CHECK (fat_g >= 0::numeric);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_fibre_g_check CHECK (fibre_g >= 0::numeric);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_kcal_check CHECK (kcal >= 0 AND kcal <= 10000);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_owner_has_no_slug CHECK (owner_id IS NULL OR slug IS NULL);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_pkey PRIMARY KEY (id);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_food_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE RESTRICT;

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_protein_g_check CHECK (protein_g >= 0::numeric);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_sodium_mg_check CHECK (sodium_mg >= 0);

ALTER TABLE public.foods
  ADD CONSTRAINT foods_sugar_g_check CHECK (sugar_g >= 0::numeric);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.foods TO anon;

GRANT ALL ON public.foods TO authenticated;

GRANT ALL ON public.foods TO service_role;

CREATE INDEX foods_name_trgm_idx ON public.foods USING gin (name extensions.gin_trgm_ops);

CREATE INDEX foods_owner_idx ON public.foods (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX foods_slug_key ON public.foods (slug)
  WHERE owner_id IS NULL;

CREATE TRIGGER foods_set_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "foods: delete own" ON public.foods
  FOR DELETE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "foods: insert own" ON public.foods
  FOR INSERT
  TO authenticated
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "foods: read catalogue and own" ON public.foods
  FOR SELECT
  TO authenticated
  USING (((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "foods: update own" ON public.foods
  FOR UPDATE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.meal_times (
  user_id          uuid                     NOT NULL,
  meal             public.meal              NOT NULL,
  at               time without time zone   NOT NULL,
  reminder_enabled boolean                  DEFAULT false NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.meal_times
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meal_times
  ADD CONSTRAINT meal_times_pkey PRIMARY KEY (user_id, meal);

ALTER TABLE public.meal_times
  ADD CONSTRAINT meal_times_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.meal_times TO anon;

GRANT ALL ON public.meal_times TO authenticated;

GRANT ALL ON public.meal_times TO service_role;

CREATE TRIGGER meal_times_set_updated_at
  BEFORE UPDATE ON public.meal_times
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "meal_times: delete own" ON public.meal_times
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "meal_times: insert own" ON public.meal_times
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "meal_times: read own" ON public.meal_times
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "meal_times: update own" ON public.meal_times
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.profiles (
  id               uuid                     NOT NULL,
  display_name     text                     DEFAULT ''::text NOT NULL,
  avatar_path      text,
  sex              public.sex,
  birth_date       date,
  height_cm        numeric(5,1),
  target_weight_kg numeric(5,1),
  activity_level   public.activity_level    DEFAULT 'light'::public.activity_level NOT NULL,
  weight_goal      public.weight_goal       DEFAULT 'track'::public.weight_goal NOT NULL,
  food_styles      text[]                   DEFAULT '{}'::text[] NOT NULL,
  referral_source  text,
  timezone         text                     DEFAULT 'Asia/Kuala_Lumpur'::text NOT NULL,
  onboarded_at     timestamp with time zone,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_date_check CHECK (birth_date > '1900-01-01'::date);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_check CHECK (char_length(display_name) <= 60);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_height_cm_check CHECK (height_cm >= 80::numeric AND height_cm <= 260::numeric);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_target_weight_kg_check CHECK (target_weight_kg >= 20::numeric AND target_weight_kg <= 400::numeric);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_sync_daily_goals
  AFTER INSERT OR UPDATE OF sex, birth_date, height_cm, activity_level, weight_goal, timezone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_goals();

CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "profiles: read own" ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "profiles: update own" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE TABLE public.subscriptions (
  user_id            uuid                       NOT NULL,
  status             public.subscription_status DEFAULT 'none'::public.subscription_status NOT NULL,
  plan               public.subscription_plan,
  trial_ends_at      timestamp with time zone,
  current_period_end timestamp with time zone,
  store              text,
  product_id         text,
  rc_app_user_id     text,
  created_at         timestamp with time zone   DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone   DEFAULT now() NOT NULL
);

ALTER TABLE public.subscriptions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (user_id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_rc_app_user_id_key UNIQUE (rc_app_user_id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.subscriptions TO authenticated;

GRANT ALL ON public.subscriptions TO service_role;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "subscriptions: read own" ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.user_achievements (
  user_id         uuid                     NOT NULL,
  achievement_key text                     NOT NULL,
  earned_at       timestamp with time zone DEFAULT now() NOT NULL,
  detail          text
);

ALTER TABLE public.user_achievements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_achievement_key_fkey FOREIGN KEY (achievement_key) REFERENCES public.achievements(key) ON DELETE CASCADE;

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_detail_check CHECK (char_length(detail) <= 80);

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_key);

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_achievements TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.user_achievements TO authenticated;

GRANT ALL ON public.user_achievements TO service_role;

CREATE POLICY "user_achievements: read own" ON public.user_achievements
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.user_settings (
  user_id              uuid                     NOT NULL,
  units                public.unit_system       DEFAULT 'metric'::public.unit_system NOT NULL,
  energy               public.energy_unit       DEFAULT 'kcal'::public.energy_unit NOT NULL,
  language             text                     DEFAULT 'en'::text NOT NULL,
  notify_water         boolean                  DEFAULT true NOT NULL,
  notify_weigh_in      boolean                  DEFAULT true NOT NULL,
  notify_weekly_report boolean                  DEFAULT true NOT NULL,
  quiet_from           time without time zone   DEFAULT '22:00:00'::time WITHOUT time zone NOT NULL,
  quiet_to             time without time zone   DEFAULT '07:00:00'::time WITHOUT time zone NOT NULL,
  connect_watch        boolean                  DEFAULT false NOT NULL,
  connect_phone_health boolean                  DEFAULT false NOT NULL,
  connect_running_app  boolean                  DEFAULT false NOT NULL,
  connect_smart_scale  boolean                  DEFAULT false NOT NULL,
  auto_sync            boolean                  DEFAULT true NOT NULL,
  wifi_only            boolean                  DEFAULT false NOT NULL,
  share_with_family    boolean                  DEFAULT false NOT NULL,
  anonymous_food_data  boolean                  DEFAULT false NOT NULL,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_quiet_hours_differ CHECK (quiet_from <> quiet_to);

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_settings TO anon;

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_settings TO authenticated;

GRANT ALL ON public.user_settings TO service_role;

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "user_settings: insert own" ON public.user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_settings: read own" ON public.user_settings
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_settings: update own" ON public.user_settings
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.weight_logs (
  user_id      uuid                      NOT NULL,
  measured_on  date                      NOT NULL,
  weight_kg    numeric(5,2)              NOT NULL,
  body_fat_pct numeric(4,1),
  source       public.measurement_source DEFAULT 'manual'::public.measurement_source NOT NULL,
  created_at   timestamp with time zone  DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone  DEFAULT now() NOT NULL
);

ALTER TABLE public.weight_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_body_fat_pct_check CHECK (body_fat_pct >= 1::numeric AND body_fat_pct <= 75::numeric);

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_pkey PRIMARY KEY (user_id, measured_on);

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_weight_kg_check CHECK (weight_kg >= 20::numeric AND weight_kg <= 400::numeric);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.weight_logs TO anon;

GRANT ALL ON public.weight_logs TO authenticated;

GRANT ALL ON public.weight_logs TO service_role;

CREATE INDEX weight_logs_user_measured_idx ON public.weight_logs (user_id, measured_on DESC);

CREATE TRIGGER weight_logs_set_updated_at
  BEFORE UPDATE ON public.weight_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER weight_logs_sync_daily_goals
  AFTER INSERT OR DELETE OR UPDATE OF weight_kg ON public.weight_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_goals();

CREATE POLICY "weight_logs: delete own" ON public.weight_logs
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "weight_logs: insert own" ON public.weight_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "weight_logs: read own" ON public.weight_logs
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "weight_logs: update own" ON public.weight_logs
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.workouts (
  id            uuid                      DEFAULT gen_random_uuid() NOT NULL,
  user_id       uuid                      NOT NULL,
  kind          public.session_kind       DEFAULT 'other'::public.session_kind NOT NULL,
  title         text,
  log_date      date                      DEFAULT public.local_today() NOT NULL,
  started_at    timestamp with time zone  NOT NULL,
  duration_min  integer                   NOT NULL,
  kcal          integer                   DEFAULT 0 NOT NULL,
  distance_km   numeric(6,2),
  avg_hr        smallint,
  elevation_m   integer,
  split_seconds integer[],
  source        public.measurement_source DEFAULT 'manual'::public.measurement_source NOT NULL,
  external_id   text,
  created_at    timestamp with time zone  DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone  DEFAULT now() NOT NULL
);

ALTER TABLE public.workouts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_avg_hr_check CHECK (avg_hr >= 20 AND avg_hr <= 260);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_distance_km_check CHECK (distance_km >= 0::numeric);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_duration_min_check CHECK (duration_min >= 0 AND duration_min <= 1440);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_elevation_m_check CHECK (elevation_m >= 0);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_kcal_check CHECK (kcal >= 0 AND kcal <= 20000);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_title_check CHECK (char_length(title) <= 120);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workouts TO anon;

GRANT ALL ON public.workouts TO authenticated;

GRANT ALL ON public.workouts TO service_role;

CREATE UNIQUE INDEX workouts_external_idx ON public.workouts (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX workouts_user_date_idx ON public.workouts (user_id, log_date DESC, started_at DESC);

CREATE TRIGGER workouts_set_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "workouts: delete own" ON public.workouts
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: insert own" ON public.workouts
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: read own" ON public.workouts
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: update own" ON public.workouts
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE VIEW public.current_daily_goals WITH (security_invoker=on) AS SELECT DISTINCT ON (user_id) user_id,
    effective_from,
    kcal,
    carbs_g,
    protein_g,
    fat_g,
    water_glasses,
    steps,
    is_custom
   FROM public.daily_goals g
  WHERE (effective_from <= public.local_today(user_id))
  ORDER BY user_id, effective_from DESC;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.current_daily_goals TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals TO service_role;

CREATE VIEW public.food_details WITH (security_invoker=on) AS SELECT f.id,
    f.owner_id,
    f.slug,
    f.name,
    f.brand,
    f.icon_set,
    f.icon_name,
    f.place,
    f.kcal,
    f.carbs_g,
    f.protein_g,
    f.fat_g,
    f.fibre_g,
    f.sugar_g,
    f.sodium_mg,
    f.verified,
    d.id AS default_serving_id,
    d.label AS serving_label,
    COALESCE(sv.servings, '[]'::jsonb) AS servings
   FROM ((public.foods f
     LEFT JOIN public.food_servings d ON (((d.food_id = f.id) AND d.is_default)))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'label', s.label, 'factor', s.factor, 'default', s.is_default) ORDER BY s."position", s.label) AS servings
           FROM public.food_servings s
          WHERE (s.food_id = f.id)) sv ON (true));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_details TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_details TO service_role;

CREATE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.meal,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    f.name AS food_name,
    f.brand AS food_brand,
    f.icon_set,
    f.icon_name,
    f.place,
    e.serving_id,
    s.label AS serving_label,
    s.factor AS serving_factor,
    (round((((f.kcal)::numeric * s.factor) * e.quantity)))::integer AS kcal,
    round(((f.carbs_g * s.factor) * e.quantity), 1) AS carbs_g,
    round(((f.protein_g * s.factor) * e.quantity), 1) AS protein_g,
    round(((f.fat_g * s.factor) * e.quantity), 1) AS fat_g,
    round(((f.fibre_g * s.factor) * e.quantity), 1) AS fibre_g,
    round(((f.sugar_g * s.factor) * e.quantity), 1) AS sugar_g
   FROM ((public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
     JOIN public.food_servings s ON ((s.id = e.serving_id)));

CREATE VIEW public.daily_nutrition WITH (security_invoker=on) AS SELECT user_id,
    log_date,
    (sum(kcal))::integer AS kcal,
    sum(carbs_g) AS carbs_g,
    sum(protein_g) AS protein_g,
    sum(fat_g) AS fat_g,
    sum(fibre_g) AS fibre_g,
    sum(sugar_g) AS sugar_g,
    (count(*))::integer AS entry_count
   FROM public.food_log_details d
  GROUP BY user_id, log_date;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.daily_nutrition TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO service_role;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_details TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO service_role;

CREATE VIEW public.user_food_stats WITH (security_invoker=on) AS SELECT user_id,
    food_id,
    (count(*))::integer AS times_logged,
    max(logged_at) AS last_logged_at,
    array_agg(DISTINCT meal) AS meals
   FROM public.food_logs e
  GROUP BY user_id, food_id;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.user_food_stats TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats TO service_role;