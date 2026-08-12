-- `serving_id` stops being a uuid, because a portion is not one any more.
--
-- In Postgres a serving was its own row with its own uuid primary key. In D1
-- the table is keyed `(food_id, slug)` — a better key, since a portion has no
-- identity apart from the dish it belongs to — and the Worker hands back
-- `"<food id>:<slug>"` so a client has one string to pass around.
--
-- The column kept the uuid type through the move, and it is `not null` nowhere
-- and referenced by nothing, so nothing complained until a real log was
-- attempted: every insert from the app died with 22P02, invalid input syntax
-- for type uuid. The diary read fine the whole time, because the two rows
-- already in it were written before the move and hold real uuids.
--
-- Text, not a foreign key and not a check: it is provenance, exactly like
-- `food_id` beside it — what a re-snapshot job would use to find the portion
-- an entry was logged at. The values that matter are already on the row
-- (`serving_label`, `serving_factor`, `serving_grams`).

-- The views read the column, and Postgres will not retype one underneath a
-- view. So they come down and go back up, copied verbatim out of
-- `schemas/90_views.sql` — `daily_nutrition` and `user_food_stats` are here
-- only because the cascade takes them, not because either one changed.

drop view if exists public.daily_nutrition cascade;
drop view if exists public.user_food_stats cascade;
drop view if exists public.food_log_details cascade;
drop view if exists public.food_log_ingredient_details cascade;

alter table public.food_logs
  alter column serving_id type text using serving_id::text;

alter table public.food_log_ingredients
  alter column serving_id type text using serving_id::text;

create view public.food_log_ingredient_details with (security_invoker = on) as
select
  i.id,
  i.food_log_id,
  i.food_id,
  i.position,
  coalesce(i.display_label, i.item_name) as name,
  i.quantity,
  i.serving_label,
  round(i.base_kcal      * i.serving_factor * i.quantity)::integer    as kcal,
  round(i.base_carbs_g   * i.serving_factor * i.quantity, 1)::numeric as carbs_g,
  round(i.base_protein_g * i.serving_factor * i.quantity, 1)::numeric as protein_g,
  round(i.base_fat_g     * i.serving_factor * i.quantity, 1)::numeric as fat_g,
  -- What this much of the part weighs. Stored per unit and multiplied here, so
  -- it moves with the stepper the way the calories do. The serving factor is
  -- deliberately absent: the weight describes the ingredient row itself, and
  -- nothing in the app lets an ingredient change the serving it was written
  -- against.
  round(i.grams * i.quantity, 1)::numeric                             as grams
from public.food_log_ingredients i;

grant select on public.food_log_ingredient_details to authenticated, service_role;

create view public.food_log_details with (security_invoker = on) as
select
  e.id,
  e.user_id,
  e.log_date,
  e.quantity,
  e.logged_at,
  e.note,
  e.source,
  e.photo_path,
  e.food_id,
  e.scan_id,
  e.suggested_edits,

  coalesce(e.display_label, e.item_name) as food_name,
  e.item_brand                           as food_brand,
  -- Three flags that were properties of the catalogue row. Nothing in a diary
  -- can tell any more, and nothing reads them for more than a badge: an entry
  -- carries numbers, not a claim about where they came from. Kept as columns so
  -- the mappers above do not have to change shape.
  false                                  as food_verified,
  false                                  as is_estimate,
  false                                  as is_archetype,
  -- A photo suppresses both icons outright: the entry's own icon wins over the
  -- food's, and a photograph wins over either.
  case when e.photo_path is null then coalesce(e.icon_set,  e.item_icon_set)  end as icon_set,
  case when e.photo_path is null then coalesce(e.icon_name, e.item_icon_name) end as icon_name,
  e.item_place                           as place,
  e.serving_id,
  e.serving_label,
  e.serving_factor,
  e.override_kcal,
  e.override_carbs_g,
  e.override_protein_g,
  e.override_fat_g,

  -- THREE SOURCES, IN ORDER, and this is the invariant the client's
  -- `entryTotals` is a copy of: what the user typed, what the parts add up to,
  -- what the dish costs at this portion. Only the last of the three changed —
  -- it reads the row itself now instead of a catalogue join.
  coalesce(
    e.override_kcal,
    (select round(sum(i.base_kcal * i.serving_factor * i.quantity))::integer
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_kcal * e.serving_factor * e.quantity)::integer
  )                                      as kcal,
  coalesce(
    e.override_carbs_g,
    (select round(sum(i.base_carbs_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_carbs_g * e.serving_factor * e.quantity, 1)
  )                                      as carbs_g,
  coalesce(
    e.override_protein_g,
    (select round(sum(i.base_protein_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_protein_g * e.serving_factor * e.quantity, 1)
  )                                      as protein_g,
  coalesce(
    e.override_fat_g,
    (select round(sum(i.base_fat_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_fat_g * e.serving_factor * e.quantity, 1)
  )                                      as fat_g,
  -- No override and no per-part figure for these three: nothing in the app
  -- lets a user type a fibre correction, and the breakdown does not carry them.
  round(e.base_fibre_g   * e.serving_factor * e.quantity, 1)       as fibre_g,
  round(e.base_sugar_g   * e.serving_factor * e.quantity, 1)       as sugar_g,
  round(e.base_sodium_mg * e.serving_factor * e.quantity)::integer as sodium_mg,
  round(e.serving_grams  * e.quantity, 1)                          as grams,
  e.recipe_id,

  -- THE SNAPSHOT ITSELF, unmultiplied, because one caller wants to COPY an
  -- entry rather than read it: "repeat yesterday" writes today's row from
  -- yesterday's, and every figure above has already been through the portion
  -- and the quantity. Dividing them back out is lossy — they are rounded — and
  -- a repeat that lands a calorie off the row it copied is a bug nobody can
  -- explain. These are the columns as stored.
  e.item_name,
  e.item_brand,
  e.base_kcal,
  e.base_carbs_g,
  e.base_protein_g,
  e.base_fat_g,
  e.base_fibre_g,
  e.base_sugar_g,
  e.base_sodium_mg,
  e.serving_grams as base_serving_grams
from public.food_logs e;

grant select on public.food_log_details to authenticated, service_role;

create view public.daily_nutrition with (security_invoker = on) as
select
  d.user_id,
  d.log_date,
  sum(d.kcal)::integer          as kcal,
  sum(d.carbs_g)::numeric       as carbs_g,
  sum(d.protein_g)::numeric     as protein_g,
  sum(d.fat_g)::numeric         as fat_g,
  sum(d.fibre_g)::numeric       as fibre_g,
  sum(d.sugar_g)::numeric       as sugar_g,
  count(*)::integer             as entry_count
from public.food_log_details d
group by d.user_id, d.log_date;

grant select on public.daily_nutrition to authenticated;

create view public.user_food_stats with (security_invoker = on) as
select
  e.user_id,
  e.food_id,
  max(e.item_name)         as name,
  count(*)::integer        as times_logged,
  max(e.logged_at)         as last_logged_at
from public.food_logs e
where e.food_id is not null
group by e.user_id, e.food_id;

grant select on public.user_food_stats to authenticated;

