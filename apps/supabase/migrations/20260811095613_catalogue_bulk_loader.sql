-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.load_catalogue_batch (
  payload jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  n integer;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array, got %', jsonb_typeof(payload);
  end if;

  create temp table _batch on commit drop as
  select
    (t.e ->> 'slug')                                  as slug,
    (t.e ->> 'name')                                  as name,
    nullif(t.e ->> 'brand', '')                       as brand,
    nullif(t.e ->> 'icon_set', '')                    as icon_set,
    nullif(t.e ->> 'icon_name', '')                   as icon_name,
    (t.e ->> 'place')                                 as place,
    (t.e ->> 'kcal')::integer                         as kcal,
    (t.e ->> 'carbs_g')::numeric                      as carbs_g,
    (t.e ->> 'protein_g')::numeric                    as protein_g,
    (t.e ->> 'fat_g')::numeric                        as fat_g,
    (t.e ->> 'fibre_g')::numeric                      as fibre_g,
    (t.e ->> 'sugar_g')::numeric                      as sugar_g,
    (t.e ->> 'sodium_mg')::integer                    as sodium_mg,
    coalesce((t.e ->> 'verified')::boolean, false)    as verified,
    nullif(t.e ->> 'source', '')                      as source,
    nullif(t.e ->> 'source_id', '')                   as source_id,
    -- Normalized here rather than trusted: the column is a fixed 14 digits and
    -- an exporter that pads differently would write codes no scanner can find.
    public.gtin14(t.e ->> 'barcode')                  as barcode,
    coalesce((t.e ->> 'popularity')::integer, 0)      as popularity,
    coalesce(
      (select array_agg(lower(c.value #>> '{}'))
       from jsonb_array_elements(coalesce(t.e -> 'countries', '[]'::jsonb)) c),
      '{}'::text[]
    )                                                 as countries,
    coalesce(t.e ->> 'search_text', '')               as search_text,
    coalesce(t.e -> 'servings', '[]'::jsonb)          as servings,
    coalesce(t.e -> 'aliases',  '[]'::jsonb)          as aliases
  from jsonb_array_elements(payload) as t(e);

  alter table _batch add column food_id uuid;

  insert into public.foods as f (
    slug, name, brand, icon_set, icon_name, place,
    kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
    verified, source, source_id, barcode, popularity, countries, search_text
  )
  select
    b.slug, b.name, b.brand, b.icon_set::public.icon_set, b.icon_name,
    b.place::public.food_place,
    b.kcal, b.carbs_g, b.protein_g, b.fat_g, b.fibre_g, b.sugar_g, b.sodium_mg,
    b.verified, b.source, b.source_id, b.barcode, b.popularity, b.countries,
    b.search_text
  from _batch b
  on conflict (slug) do update set
    name        = excluded.name,
    brand       = excluded.brand,
    icon_set    = excluded.icon_set,
    icon_name   = excluded.icon_name,
    place       = excluded.place,
    kcal        = excluded.kcal,
    carbs_g     = excluded.carbs_g,
    protein_g   = excluded.protein_g,
    fat_g       = excluded.fat_g,
    fibre_g     = excluded.fibre_g,
    sugar_g     = excluded.sugar_g,
    sodium_mg   = excluded.sodium_mg,
    verified    = excluded.verified,
    source      = excluded.source,
    source_id   = excluded.source_id,
    barcode     = excluded.barcode,
    popularity  = excluded.popularity,
    countries   = excluded.countries,
    search_text = excluded.search_text;

  update _batch b set food_id = f.id from public.foods f where f.slug = b.slug;

  -- Non-default portions first, so that a re-load moving a dish's default to a
  -- different slug never holds two defaults at once —
  -- `food_servings_one_default_idx` is checked per row.
  insert into public.food_servings as sv (food_id, slug, label, factor, grams, is_default, position)
  select
    b.food_id,
    s ->> 'slug',
    s ->> 'label',
    (s ->> 'factor')::numeric,
    (s ->> 'grams')::numeric,
    coalesce((s ->> 'is_default')::boolean, false),
    coalesce((s ->> 'position')::smallint, 0)
  from _batch b, jsonb_array_elements(b.servings) s
  where b.food_id is not null
  order by coalesce((s ->> 'is_default')::boolean, false)
  on conflict (food_id, slug) do update set
    label      = excluded.label,
    factor     = excluded.factor,
    grams      = excluded.grams,
    is_default = excluded.is_default,
    position   = excluded.position;

  insert into public.food_aliases as al (food_id, alias)
  select distinct b.food_id, a.value #>> '{}'
  from _batch b, jsonb_array_elements(b.aliases) a
  where b.food_id is not null
    and btrim(a.value #>> '{}') <> ''
    and char_length(a.value #>> '{}') <= 120
    and public.search_normalize(a.value #>> '{}') <> ''
  on conflict (food_id, alias_norm) do nothing;

  select count(*)::integer into n from _batch;
  drop table _batch;
  return n;
end;
$function$;

COMMENT ON FUNCTION public.load_catalogue_batch(jsonb) IS 'Writes one batch of factory-exported catalogue rows, with their portions and aliases. Identity is the slug and a conflict is an update, so re-running an export corrects rows rather than doubling them. Unlike import_foods it does NOT dedupe on the normalized name: an export has already been deduplicated, and the rows that share a name are distinct branded products. service_role only.';

GRANT ALL ON FUNCTION public.load_catalogue_batch(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.search_foods(text, public.food_place, integer, boolean) TO authenticated;