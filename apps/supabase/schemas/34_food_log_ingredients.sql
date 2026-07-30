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
