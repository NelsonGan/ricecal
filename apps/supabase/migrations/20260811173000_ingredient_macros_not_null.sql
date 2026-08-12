-- The three ingredient macros the previous migration left nullable.
--
-- `20260811160000_catalogue_moves_to_d1` required `item_name`, `base_kcal` and
-- `serving_factor` on a breakdown row and stopped there, which left
-- `base_carbs_g`, `base_protein_g` and `base_fat_g` nullable — and
-- `schemas/34_food_log_ingredients.sql` declares all three `not null`. That is
-- drift the nightly `supabase-drift` job would have found, and a hand-written
-- migration is the only way to close it: the columns are already there, so a
-- regenerated diff is the whole of the fix.
--
-- It matters beyond tidiness. `food_log_ingredient_details` multiplies each
-- macro out and `food_log_details` SUMS them across the parts, and `sum()`
-- skips nulls — so a part with a null carb figure would contribute its calories
-- to the plate and nothing to its carbohydrate, and the entry would quietly
-- stop obeying Atwater. Zero is the honest default here, unlike on `food_logs`
-- where `base_fibre_g` and friends stay nullable: nobody writes a breakdown row
-- without knowing its macros, because the cascade computes them.

update public.food_log_ingredients
set base_carbs_g   = coalesce(base_carbs_g, 0),
    base_protein_g = coalesce(base_protein_g, 0),
    base_fat_g     = coalesce(base_fat_g, 0)
where base_carbs_g is null or base_protein_g is null or base_fat_g is null;

alter table public.food_log_ingredients
  alter column base_carbs_g   set not null,
  alter column base_protein_g set not null,
  alter column base_fat_g     set not null;
