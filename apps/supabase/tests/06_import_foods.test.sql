-- ---------------------------------------------------------------------------
-- The JSON catalogue loader.
--
-- `import_foods` is the one write path into the catalogue that decides things:
-- it validates, it dedupes, and it refuses. Every one of those decisions is a
-- judgement encoded in SQL, and the failure mode when one of them is wrong is
-- not an error — it is a second row for a dish that already existed, or a dish
-- silently missing from a payload that reported success.
--
-- So the assertions here are about the VERDICTS rather than about row counts.
-- What matters is that a duplicate comes back as a skip with a reason, that a
-- bad row comes back as a rejection with a reason, and that neither of them
-- takes the rest of the batch down with it.
--
-- Run with `supabase test db`. One transaction, rolled back, pgTAP included.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);


-- Shape ---------------------------------------------------------------------

select has_function('public', 'import_foods', 'import_foods exists');
select has_function('public', 'food_name_norm', 'food_name_norm exists');

-- The grant is the control, and `db diff` does not report it — five functions
-- shipped executable by PUBLIC before anyone noticed. See CLAUDE.md.
select function_privs_are(
  'public', 'import_foods', array['jsonb', 'boolean'], 'authenticated', '{}'::text[],
  'authenticated cannot execute the loader'
);
select function_privs_are(
  'public', 'import_foods', array['jsonb', 'boolean'], 'service_role', array['EXECUTE'],
  'service_role can execute the loader'
);


-- The normalization the loader dedupes on ------------------------------------

-- Must agree with what the trigger writes, because the loader compares its own
-- answer against the column the trigger filled. These are the two cases that
-- differ: a brand the name already carries, and one it does not.
--
-- Note the apostrophe: `search_normalize` splits it rather than eliding it, so
-- the answer is "mcdonald s" and not "mcdonalds". That is asserted here because
-- it is surprising, it contradicted this function's own comment for a while,
-- and anything generating a slug or a search_text outside the database has to
-- do the same or it writes a token no query can produce.
select is(
  public.food_name_norm('McDonald''s Filet-O-Fish', 'McDonald''s'),
  'mcdonald s filet o fish',
  'a name already carrying its brand is not prefixed twice'
);
select is(
  public.food_name_norm('Iced Latte', 'Bask Bear'),
  'bask bear iced latte',
  'a brand the name lacks is prefixed'
);


-- A clean payload ------------------------------------------------------------

create temp table result on commit drop as
select * from public.import_foods($payload$[
  {
    "slug": "test-nasi-kerabu", "name": "Test Nasi Kerabu", "place": "hawker",
    "kcal": 520, "carbs_g": 72, "protein_g": 22, "fat_g": 15,
    "search_text": "test nasi kerabu blue rice kelantan",
    "servings": [
      {"slug": "base", "label": "1 plate", "factor": 1, "is_default": true, "position": 0},
      {"slug": "half", "label": "Half plate", "factor": 0.5, "is_default": false, "position": 1}
    ]
  },
  {
    "slug": "test-teh-halia", "name": "Test Teh Halia", "place": "mamak",
    "kcal": 150, "carbs_g": 22, "protein_g": 4, "fat_g": 5,
    "servings": [{"slug": "base", "label": "1 glass", "factor": 1, "is_default": true, "position": 0}]
  }
]$payload$::jsonb);

select is(
  (select count(*)::integer from result where outcome = 'inserted'), 2,
  'both new dishes are inserted'
);

select is(
  (select name_norm from public.foods where slug = 'test-nasi-kerabu'),
  'test nasi kerabu',
  'the trigger normalized the name the loader was given'
);

select is(
  (select count(*)::integer from public.food_servings s
    join public.foods f on f.id = s.food_id where f.slug = 'test-nasi-kerabu'),
  2,
  'both portions arrived with the dish'
);

select is(
  (select label from public.food_servings s
    join public.foods f on f.id = s.food_id
   where f.slug = 'test-nasi-kerabu' and s.is_default),
  '1 plate',
  'the default portion is the one marked default'
);


-- The same payload again -----------------------------------------------------
--
-- The point of the whole loader. Research rounds overlap heavily and re-running
-- a file that has already landed is the normal case, not an error.

create temp table again on commit drop as
select * from public.import_foods($payload$[
  {
    "slug": "test-nasi-kerabu", "name": "Test Nasi Kerabu", "place": "hawker",
    "kcal": 999, "carbs_g": 72, "protein_g": 22, "fat_g": 15,
    "servings": [{"slug": "base", "label": "1 plate", "factor": 1, "is_default": true, "position": 0}]
  },
  {
    "slug": "test-nasi-kerabu-kelantan", "name": "Test Nasi Kerabu", "place": "hawker",
    "kcal": 520, "carbs_g": 72, "protein_g": 22, "fat_g": 15,
    "servings": [{"slug": "base", "label": "1 plate", "factor": 1, "is_default": true, "position": 0}]
  }
]$payload$::jsonb);

select is(
  (select outcome from again where slug = 'test-nasi-kerabu'), 'skipped_slug',
  'the same slug is skipped rather than raising on the unique index'
);

select is(
  (select outcome from again where slug = 'test-nasi-kerabu-kelantan'), 'skipped_name',
  'the same dish under a new slug is skipped on the normalized name'
);

-- Additive by default: a second payload cannot move a number a user has
-- already been shown, even when it claims to.
select is(
  (select kcal from public.foods where slug = 'test-nasi-kerabu'), 520,
  'a skipped row leaves the existing figures alone'
);


-- Rejections -----------------------------------------------------------------
--
-- One bad row must not take the batch with it: that is the whole reason the
-- validation is row-by-row rather than an `insert ... select`.

create temp table mixed on commit drop as
select * from public.import_foods($payload$[
  {
    "slug": "test-bad-place", "name": "Test Bad Place", "place": "restaurant",
    "kcal": 300, "carbs_g": 40, "protein_g": 10, "fat_g": 8,
    "servings": [{"slug": "base", "label": "1 bowl", "factor": 1, "is_default": true, "position": 0}]
  },
  {
    "slug": "test-two-defaults", "name": "Test Two Defaults", "place": "hawker",
    "kcal": 300, "carbs_g": 40, "protein_g": 10, "fat_g": 8,
    "servings": [
      {"slug": "base", "label": "1 bowl", "factor": 1, "is_default": true, "position": 0},
      {"slug": "big", "label": "Large", "factor": 1, "is_default": true, "position": 1}
    ]
  },
  {
    "slug": "test-survivor", "name": "Test Survivor Dish", "place": "kopitiam",
    "kcal": 300, "carbs_g": 40, "protein_g": 10, "fat_g": 8,
    "servings": [{"slug": "base", "label": "1 bowl", "factor": 1, "is_default": true, "position": 0}]
  }
]$payload$::jsonb);

select is(
  (select outcome from mixed where slug = 'test-bad-place'), 'rejected',
  'a place outside the enum is rejected'
);

select is(
  (select outcome from mixed where slug = 'test-two-defaults'), 'rejected',
  'two default servings is rejected'
);

select is(
  (select outcome from mixed where slug = 'test-survivor'), 'inserted',
  'the good row in a batch with two bad ones still lands'
);

select isnt(
  (select detail from mixed where slug = 'test-bad-place'), null,
  'a rejection says why'
);


select * from finish();
rollback;
