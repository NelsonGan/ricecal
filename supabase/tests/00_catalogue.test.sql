-- ---------------------------------------------------------------------------
-- The seeded catalogue.
--
-- Run with `supabase test db`. Everything happens inside one transaction that
-- is rolled back, including the pgTAP extension itself — so running the suite
-- leaves the database exactly as it found it, and pgTAP never reaches
-- production.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);


-- Shape ---------------------------------------------------------------------

select has_table('public', 'foods', 'foods exists');
select has_table('public', 'food_logs', 'food_logs exists');
select has_view('public', 'food_details', 'food_details exists');


-- Contents ------------------------------------------------------------------

select is(
  (select count(*)::integer from public.foods where owner_id is null),
  28,
  'the shared catalogue holds 28 dishes'
);

select is(
  (select count(*)::integer from public.food_servings),
  84,
  'every dish carries its three portions'
);

select is(
  (select count(*)::integer from public.achievements),
  9,
  'nine badges are defined'
);


-- Invariants that make the macro arithmetic mean anything -------------------

-- If a dish had no default portion, `food_details.serving_label` would be null
-- and the search row would render a dish with no portion under it.
select is(
  (
    select count(*)::integer
    from public.foods f
    where not exists (
      select 1 from public.food_servings s
      where s.food_id = f.id and s.is_default
    )
  ),
  0,
  'every dish has a default portion'
);

-- The stored macros describe ONE default serving, so the default's factor must
-- be 1. Any other value silently rescales the whole dish.
select is(
  (select count(*)::integer from public.food_servings where is_default and factor <> 1),
  0,
  'every default portion has factor 1'
);

-- A dish with calories but no macros at all is a half-finished row. Zero
-- calories is legitimate — Air kosong is plain water — so the assertion is
-- "calories imply macros", not "calories are positive".
select is(
  (
    select count(*)::integer
    from public.foods
    where kcal > 0 and carbs_g = 0 and protein_g = 0 and fat_g = 0
  ),
  0,
  'every dish with calories records where they come from'
);


-- The view does the arithmetic the screens used to do -----------------------

select is(
  (select jsonb_array_length(servings) from public.food_details where slug = 'nasi-lemak-ayam'),
  3,
  'food_details attaches the portion list as JSON'
);

select is(
  (select serving_label from public.food_details where slug = 'nasi-lemak-ayam'),
  '1 plate',
  'food_details surfaces the default portion label'
);


select * from finish();

rollback;
