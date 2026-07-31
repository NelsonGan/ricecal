-- ---------------------------------------------------------------------------
-- What a scanned plate was made of. One food_log, many ingredients.
--
-- A decomposed scan used to write one entry per component, which put four
-- rows on Today for one plate of food. The diary is a list of MEALS, so the
-- plate is one `food_logs` row — pointing at an estimate row whose macros are
-- the SUM of the resolved components, catalogue arithmetic all the way down —
-- and this table is the explanation hanging off it: which catalogue rows the
-- sum came from, in what amounts.
--
-- The parent's own macros stay authoritative (the same rule the goal set for
-- a future curated food_ingredients table). These rows are written together
-- with the parent by the scan function, all-or-nothing: a partial breakdown
-- undercounts, which is the dangerous direction for a calorie app.
-- ---------------------------------------------------------------------------

create table public.food_log_ingredients (
  id           uuid primary key default gen_random_uuid(),
  food_log_id  uuid not null references public.food_logs (id) on delete cascade,

  food_id      uuid not null,
  serving_id   uuid not null,
  quantity     numeric(6, 2) not null default 1 check (quantity > 0 and quantity <= 100),

  -- The model's name for what it saw ("crispy chicken thigh"), kept because
  -- the catalogue row it resolved to can be blunter ("Fried chicken").
  display_label text check (char_length(display_label) between 1 and 120),

  -- Plate order, as the model listed them.
  position     smallint not null default 0,

  created_at   timestamptz not null default now(),

  -- Same composite reference as food_logs: the serving is guaranteed to
  -- belong to the food, so an ingredient cannot be measured in another
  -- dish's portions.
  constraint food_log_ingredients_food_serving_fkey
    foreign key (food_id, serving_id)
    references public.food_servings (food_id, id)
    on delete restrict,

  constraint food_log_ingredients_food_fkey
    foreign key (food_id) references public.foods (id) on delete restrict
);

create index food_log_ingredients_log_idx on public.food_log_ingredients (food_log_id);
-- `on delete restrict` needs these to avoid sequential scans when catalogue
-- rows are touched, mirroring food_logs.
create index food_log_ingredients_food_idx on public.food_log_ingredients (food_id);
create index food_log_ingredients_serving_idx on public.food_log_ingredients (serving_id);

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
-- A direct UPDATE grant would let an ingredient list drift from the parent
-- entry's total silently. This function is the write path instead: it sets
-- the part's quantity and in the same transaction recomputes the parent
-- entry's `quantity` so that parent × quantity equals the new sum of parts —
-- the shared parent row's macros are never touched (it is deduped across
-- users), the AMOUNT moves, which is rule 12 all the way down.
--
-- SECURITY DEFINER because clients have no update grant on the table at all;
-- ownership is checked against auth.uid() explicitly, so it widens what can
-- be done, not whose rows it can be done to.
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
  v_sum     numeric;
  v_base    numeric;
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

  select sum(f.kcal * s.factor * i.quantity) into v_sum
  from public.food_log_ingredients i
  join public.foods f         on f.id = i.food_id
  join public.food_servings s on s.id = i.serving_id
  where i.food_log_id = v_log_id;

  select f.kcal * s.factor into v_base
  from public.food_logs e
  join public.foods f         on f.id = e.food_id
  join public.food_servings s on s.id = e.serving_id
  where e.id = v_log_id;

  if coalesce(v_base, 0) > 0 and coalesce(v_sum, 0) > 0 then
    update public.food_logs
    set quantity = greatest(0.01, least(100, round(v_sum / v_base, 2)))
    where id = v_log_id;
  end if;
end;
$$;

comment on function public.set_ingredient_quantity is
  'Set one scanned ingredient''s portion and recompute the parent entry''s '
  'quantity so the diary total equals the sum of parts. Owner-checked.';

revoke execute on function public.set_ingredient_quantity from public, anon;
grant execute on function public.set_ingredient_quantity to authenticated, service_role;
