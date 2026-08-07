-- ---------------------------------------------------------------------------
-- The catalogue's invariants.
--
-- Nothing seeds this table any more — dishes arrive from the import loader
-- running as `service_role`, so a fresh database has an empty catalogue and
-- there is no row count worth asserting. What is still worth asserting is the
-- shape every imported row has to hold to, because `food_details` and
-- `food_log_details` do arithmetic that silently produces the wrong number when
-- it does not.
--
-- The fixture below is inserted and rolled back with everything else.
--
-- Run with `supabase test db`. Everything happens inside one transaction that
-- is rolled back, including the pgTAP extension itself — so running the suite
-- leaves the database exactly as it found it, and pgTAP never reaches
-- production.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);


-- Shape ---------------------------------------------------------------------

select has_table('public', 'foods', 'foods exists');
select has_table('public', 'food_logs', 'food_logs exists');
select has_view('public', 'food_details', 'food_details exists');


-- Fixture --------------------------------------------------------------------

-- Both icon columns, not just the name. They are optional now but they travel
-- together — `foods_icon_complete` rejects half a pair — and `icon_set` no longer
-- defaults to `dishes` to fill the gap, because a default is what made every
-- imported row claim a drawing it did not have. A curated dish like this one is
-- exactly the kind that does have one, so the fixture carries both.
insert into public.foods (slug, name, icon_set, icon_name, place, kcal, carbs_g, protein_g, fat_g)
values ('fixture-nasi-lemak', 'Nasi lemak ayam berempah', 'dishes', 'nasi-lemak', 'mamak', 640, 78, 27, 25);

insert into public.food_servings (food_id, slug, label, factor, is_default, position)
select f.id, v.slug, v.label, v.factor, v.is_default, v.position
from public.foods f
cross join (values
  ('plate', '1 plate', 1.0,  true,  0),
  ('half',  'Half',    0.5,  false, 1),
  ('g100',  '100g',    0.35, false, 2)
) as v (slug, label, factor, is_default, position)
where f.slug = 'fixture-nasi-lemak';


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
--
-- Recipe mirrors are exempt, and the exemption is the point rather than a
-- loophole. This is an assertion about the CURATED catalogue, where a row with
-- calories and no macros means somebody stopped halfway. A recipe's numbers are
-- the sum of what its cook typed, and the form asks for macros "if you know
-- them" — a pot of kerisik entered off a packet that only prints calories is a
-- complete answer, not a half-finished one.
select is(
  (
    select count(*)::integer
    from public.foods
    where kcal > 0 and carbs_g = 0 and protein_g = 0 and fat_g = 0
      and not is_recipe
  ),
  0,
  'every catalogue dish with calories records where they come from'
);


-- Identity -------------------------------------------------------------------
--
-- With per-user dishes gone, every row is a catalogue row and the slug is real
-- identity rather than a handle half the table lacked. Both of these used to be
-- legal.

-- No icon on either of these, and that matters for the second one.
--
-- They used to pass `icon_name` alone because `icon_set` defaulted to `dishes`
-- and the column was `not null`. With the default gone that is half a pair, which
-- `foods_icon_complete` rejects as 23514 — so the duplicate-slug probe stopped
-- reaching the unique index at all and was asserting the wrong constraint. The
-- no-slug one still saw 23502 only because Postgres evaluates NOT NULL before
-- CHECK, which is luck rather than intent.
--
-- Neither test is about pictures, and a row with no drawing is the ordinary case
-- now, so they simply do not mention one.
select throws_ok(
  $q$insert into public.foods (name, kcal) values ('No slug', 100)$q$,
  '23502',
  null,
  'a dish without a slug is rejected'
);

select throws_ok(
  $q$insert into public.foods (slug, name, kcal)
     values ('fixture-nasi-lemak', 'Duplicate', 100)$q$,
  '23505',
  null,
  'two dishes cannot share a slug'
);


-- An icon is optional, and indivisible ---------------------------------------
--
-- Both halves of this went untested when the columns became nullable, and the
-- pair is the kind of invariant that fails quietly: a set with no name renders
-- blank and a name with no set cannot be resolved to a file at all, so what
-- reaches the screen is a missing picture rather than an error anyone sees.

select throws_ok(
  $q$insert into public.foods (slug, name, icon_name, kcal)
     values ('fixture-half-icon', 'Half an icon', 'rice', 100)$q$,
  '23514',
  null,
  'a name without a set is rejected'
);

-- And the case the whole change was for: most of the catalogue is imported rows
-- with no drawing, and they have to be insertable without one.
select lives_ok(
  $q$insert into public.foods (slug, name, kcal, carbs_g, protein_g, fat_g)
     values ('fixture-no-icon', 'Nothing to illustrate it', 100, 1, 1, 1)$q$,
  'a dish with no icon at all is accepted'
);

-- The row this just left behind gets a default portion like any other dish. The
-- catalogue-wide assertions above are `count(*)` over the whole table — "every
-- dish has a default portion" among them — and they only pass today because they
-- run before this point in the file. A fixture that is legal on its own terms
-- does not care where they run.
insert into public.food_servings (food_id, slug, label, factor, is_default, position)
select f.id, 'serving', '1 serving', 1.0, true, 0
from public.foods f
where f.slug = 'fixture-no-icon';


-- The view does the arithmetic the screens used to do -----------------------

select is(
  (select jsonb_array_length(servings) from public.food_details where slug = 'fixture-nasi-lemak'),
  3,
  'food_details attaches the portion list as JSON'
);

select is(
  (select serving_label from public.food_details where slug = 'fixture-nasi-lemak'),
  '1 plate',
  'food_details surfaces the default portion label'
);


select * from finish();

rollback;
