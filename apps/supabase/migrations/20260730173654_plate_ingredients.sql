-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP VIEW public.daily_nutrition;

DROP VIEW public.food_log_details;

CREATE TABLE public.food_log_ingredients (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  food_log_id   uuid                     NOT NULL,
  food_id       uuid                     NOT NULL,
  serving_id    uuid                     NOT NULL,
  quantity      numeric(6,2)             DEFAULT 1 NOT NULL,
  display_label text,
  "position"    smallint                 DEFAULT 0 NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_log_ingredients
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_display_label_check CHECK (char_length(display_label) >= 1 AND char_length(display_label) <= 120);

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_food_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE RESTRICT;

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_food_log_id_fkey FOREIGN KEY (food_log_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_food_serving_fkey FOREIGN KEY (food_id, serving_id) REFERENCES public.food_servings(food_id, id) ON DELETE RESTRICT;

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_pkey PRIMARY KEY (id);

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_quantity_check CHECK (quantity > 0::numeric AND quantity <= 100::numeric);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredients TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_ingredients TO authenticated;

GRANT ALL ON public.food_log_ingredients TO service_role;

CREATE INDEX food_log_ingredients_food_idx ON public.food_log_ingredients (food_id);

CREATE INDEX food_log_ingredients_log_idx ON public.food_log_ingredients (food_log_id);

CREATE INDEX food_log_ingredients_serving_idx ON public.food_log_ingredients (serving_id);

CREATE POLICY "food_log_ingredients: read own" ON public.food_log_ingredients
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.food_logs e
  WHERE ((e.id = food_log_ingredients.food_log_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.food_logs
  ADD COLUMN suggested_edits jsonb;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_suggested_edits_check CHECK (suggested_edits IS NULL OR jsonb_typeof(suggested_edits) = 'array'::text AND jsonb_array_length(suggested_edits) <= 3);

ALTER TABLE public.food_scan_items
  ADD COLUMN refine_instruction text;

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_refine_instruction_check CHECK (char_length(refine_instruction) <= 500);

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
    e.scan_id,
    e.suggested_edits,
    COALESCE(e.display_label, f.name) AS food_name,
    f.brand AS food_brand,
    f.verified AS food_verified,
    f.is_estimate,
    f.is_archetype,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_set, f.icon_set)
            ELSE NULL::public.icon_set
        END AS icon_set,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_name, f.icon_name)
            ELSE NULL::text
        END AS icon_name,
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

CREATE VIEW public.food_log_ingredient_details WITH (security_invoker=on) AS SELECT i.id,
    i.food_log_id,
    i.food_id,
    i."position",
    COALESCE(i.display_label, f.name) AS name,
    i.quantity,
    s.label AS serving_label,
    (round((((f.kcal)::numeric * s.factor) * i.quantity)))::integer AS kcal,
    round(((f.carbs_g * s.factor) * i.quantity), 1) AS carbs_g,
    round(((f.protein_g * s.factor) * i.quantity), 1) AS protein_g,
    round(((f.fat_g * s.factor) * i.quantity), 1) AS fat_g
   FROM ((public.food_log_ingredients i
     JOIN public.foods f ON ((f.id = i.food_id)))
     JOIN public.food_servings s ON ((s.id = i.serving_id)));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredient_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_ingredient_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_ingredient_details TO service_role;