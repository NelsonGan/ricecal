-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP VIEW public.food_details;

ALTER TABLE public.foods
  ADD COLUMN image_path text;

CREATE VIEW public.food_details WITH (security_invoker=on) AS SELECT f.id,
    f.owner_id,
    f.slug,
    f.name,
    f.brand,
    f.icon_set,
    f.icon_name,
    f.image_path,
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

-- Trimmed from what the diff generated. It reproduced the ambient
-- MAINTAIN/REFERENCES/TRIGGER/TRUNCATE grants for `anon` and `service_role`
-- as well; none of them mean anything on a view, and re-granting them here
-- would make it look as though anon had been given something deliberately.
-- The only privilege this view has ever needed is the one the schema declares.
GRANT SELECT ON public.food_details TO authenticated;