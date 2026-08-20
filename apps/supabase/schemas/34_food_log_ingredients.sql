-- ---------------------------------------------------------------------------
-- What a scanned plate was made of. One food_log, many ingredients.
--
-- A decomposed scan used to write one entry per component, which put four rows on
-- Today for one plate of food. The diary is a list of meals, so the plate is one
-- `food_logs` row whose macros are the sum of the resolved components, and this
-- table is the explanation hanging off it.
--
-- The parent's own macros stay authoritative. These rows are written together
-- with the parent by the scan function, all or nothing: a partial breakdown
-- undercounts, which is the dangerous direction for a calorie app.
--
-- These carry a snapshot for the same reason the parent does. A part is often not
-- a catalogue row at all: a plate priced per skewer, or a component the catalogue
-- could not answer for, was always a number the scan worked out rather than one
-- it looked up.
-- ---------------------------------------------------------------------------

create table public.food_log_ingredients (
  id           uuid primary key default gen_random_uuid(),
  food_log_id  uuid not null references public.food_logs (id) on delete cascade,

  -- Provenance, unconstrained, and null for a part that is nobody's catalogue
  -- row. See the parent table.
  food_id      uuid,
  -- Text, for the reason given on `food_logs.serving_id`.
  serving_id   text,
  quantity     numeric(6, 2) not null default 1 check (quantity > 0 and quantity <= 100),

  -- The snapshot, per one base serving, as on the parent. There is no fibre,
  -- sugar or sodium here: the view does not expose them per part, and a
  -- breakdown showing four macros against a parent showing seven would invite
  -- the arithmetic that they add up.
  item_name      text not null,
  base_kcal      integer not null,
  base_carbs_g   numeric(6, 1) not null,
  base_protein_g numeric(6, 1) not null,
  base_fat_g     numeric(6, 1) not null,
  serving_label  text,
  serving_factor numeric(6, 3) not null,

  -- The model's name for what it saw ("crispy chicken thigh"), kept because
  -- the row it resolved to can be blunter ("Fried chicken").
  display_label text check (char_length(display_label) between 1 and 120),

  -- What one of this part weighs, when the scan was able to say.
  --
  -- The scan sizes a plate by mass before it prices it, and that weight is the only
  -- thing on the row a person can check against the plate they are looking at.
  -- Without it the breakdown reads "x 6" against a catalogue serving nobody chose,
  -- and the stepper beside it moves a number with no unit.
  --
  -- Per unit, like every other figure here: the view multiplies by `quantity`, so
  -- halving the portion halves the grams on screen without this column moving. Null
  -- where it is genuinely unknown, and null renders as nothing rather than as a
  -- zero, because "0 g" is a claim and "we did not weigh it" is not.
  grams        numeric(7, 1) check (grams > 0 and grams <= 20000),

  -- Plate order, as the model listed them.
  position     smallint not null default 0,

  created_at   timestamptz not null default now()
);

create index food_log_ingredients_log_idx on public.food_log_ingredients (food_log_id);
-- The `food_id` and `serving_id` indexes went with the foreign keys they
-- existed for: they kept an `on delete restrict` from sequentially scanning
-- this table whenever a catalogue row was touched, and no catalogue row is
-- touched from here any more. Nothing queries a breakdown by either column —
-- every read is "the parts of this entry", which is the index above.

alter table public.food_log_ingredients enable row level security;

-- Clients read their own; only the scan function writes, as service_role —
-- the breakdown is derived data, and a hand-edited ingredient list that no
-- longer sums to the parent would be a lie the UI cannot detect. Deleting
-- rides the parent's cascade.
grant select on public.food_log_ingredients to authenticated;
grant select, insert, update, delete on public.food_log_ingredients to service_role;

create policy "food_log_ingredients: read own"
  on public.food_log_ingredients for select
  to authenticated
  using (
    exists (
      select 1 from public.food_logs e
      where e.id = food_log_id and e.user_id = (select auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- The one ingredient edit a client may make: its portion.
--
-- A direct UPDATE grant would let anything be written into a list the totals are
-- read from. This function is the write path instead, and all it does is set the
-- portion: `food_log_details` sums the parts, so the entry's calories and macros
-- follow from this row changing. It used to also rescale the parent entry's
-- `quantity` to keep the total in step, which moved all four macros together, so
-- doubling the rice put fat on the plate.
--
-- Security definer because clients have no update grant on the table at all.
-- Ownership is checked against auth.uid() explicitly, so it widens what can be
-- done rather than whose rows it can be done to.
-- ---------------------------------------------------------------------------
create or replace function public.set_ingredient_quantity(
  p_ingredient_id uuid,
  p_quantity      numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id  uuid;
  v_user_id uuid;
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;
  if p_quantity is null or p_quantity < 0.25 or p_quantity > 20 then
    raise exception 'quantity out of range';
  end if;

  update public.food_log_ingredients
  set quantity = p_quantity
  where id = p_ingredient_id;
end;
$$;

comment on function public.set_ingredient_quantity is
  'Set one scanned ingredient''s portion. The entry''s totals follow from the '
  'sum of its parts in food_log_details, so nothing else has to be written. '
  'Owner-checked.';

revoke execute on function public.set_ingredient_quantity from public, anon;
grant execute on function public.set_ingredient_quantity to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Taking something off the plate entirely.
--
-- A quarter of a thing is the smallest portion the stepper can express, and it is
-- not the same answer as "there was no sambal on mine", which is the correction
-- people actually want to make. The totals follow the same way a resize does, by
-- being a sum of what is left.
--
-- The last ingredient can go too. What is left is an entry with no breakdown,
-- which is exactly what a dish the scan could not decompose looks like, and its
-- numbers fall back to the parent row at its own portion.
-- ---------------------------------------------------------------------------
create or replace function public.remove_ingredient(p_ingredient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id  uuid;
  v_user_id uuid;
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;

  delete from public.food_log_ingredients where id = p_ingredient_id;
end;
$$;

comment on function public.remove_ingredient is
  'Take one ingredient off a scanned plate. The entry''s totals follow from '
  'what is left. Owner-checked.';

revoke execute on function public.remove_ingredient from public, anon;
grant execute on function public.remove_ingredient to authenticated, service_role;
