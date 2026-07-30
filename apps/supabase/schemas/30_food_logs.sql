-- ---------------------------------------------------------------------------
-- What the user ate. The busiest table in the app.
--
-- WHY log_date IS A DATE AND logged_at IS AN INSTANT
--
-- They answer different questions and neither derives the other reliably.
-- `log_date` is "which day does this count towards" — a calendar fact about
-- the user's own day, which is why supper at 00:30 can be dragged back onto
-- the previous day and why the column is not computed from the timestamp.
-- `logged_at` is "when did this happen", which is what orders the rows inside
-- a meal and prints "8:20 am" on each one.
--
-- WHY THERE IS NO COPY OF THE MACROS
--
-- An entry is a foreign key and a quantity. The calorie count is derived at
-- read time through `daily_nutrition` / `food_log_details`, so correcting a
-- catalogue row corrects every log that used it. The alternative — snapshot
-- the macros on write — makes history immutable but also makes it permanently
-- wrong, and leaves no way to fix a dish that was entered at double its real
-- calories.
--
-- THE SEAM FOR CALORIE SCANNING
--
-- A scan resolves to a catalogue row and then writes an ordinary entry against
-- it: `source = 'camera'` and `photo_path` are already here for that, and
-- nothing in this table has to move.
--
-- What it cannot do is invent a dish. `foods` has no per-user rows any more, so
-- a photo that matches nothing in the catalogue has nowhere to land — that case
-- has to be answered by widening the catalogue or by asking the user to pick,
-- not by writing a private food. Making `food_id` nullable with an inline macro
-- block is the other way out, and it costs the property that correcting a dish
-- corrects every log that used it.
-- ---------------------------------------------------------------------------

create table public.food_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Defaulted from the user's own timezone so a write that omits it lands on
  -- the right day rather than on the server's UTC day.
  log_date     date not null default public.local_today(),
  meal         public.meal not null,

  food_id      uuid not null,
  serving_id   uuid not null,

  quantity     numeric(6, 2) not null default 1 check (quantity > 0 and quantity <= 100),

  logged_at    timestamptz not null default now(),
  -- A free-text correction: "no sambal", "kurang manis". Not parsed.
  note         text check (char_length(note) <= 500),

  source       public.entry_source not null default 'search',
  -- Path inside the private `meal-photos` bucket. Null until the scanning flow
  -- exists; see the seam note above.
  photo_path   text,

  -- An illustration the user picked for this row, overriding the food's own.
  --
  -- Here rather than on `foods` because `foods` is shared: the catalogue is
  -- read-only to users, and most of it has no drawing at all — there are hundreds
  -- of megabytes of imported rows against a few dozen illustrations. This is the
  -- one place a user can say what a plate looked like without a photo of it.
  --
  -- Per entry, so it is deliberately not remembered for the next log of the same
  -- dish. Both columns or neither, for the same reason as on `foods`: half an
  -- icon cannot be resolved.
  icon_set     public.icon_set,
  icon_name    text,
  constraint food_logs_icon_complete check ((icon_set is null) = (icon_name is null)),

  -- A photo or an icon, never both. They answer the same question — what was on
  -- this plate — and a photo of the real thing always wins, so a row holding both
  -- would carry a drawing nothing would ever render. Enforced here rather than
  -- left to the screens: the recognition flow and the picker both write these
  -- columns, and only one of them can be looking at the other's value.
  constraint food_logs_one_picture check (photo_path is null or icon_set is null),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The composite reference is the point: a two-column foreign key means the
  -- serving is guaranteed to belong to the food. Two independent references
  -- would each be satisfiable while together describing a plate of nasi lemak
  -- measured in cups of teh tarik.
  constraint food_logs_food_serving_fkey
    foreign key (food_id, serving_id)
    references public.food_servings (food_id, id)
    on delete restrict,

  constraint food_logs_food_fkey
    foreign key (food_id) references public.foods (id) on delete restrict
);

-- Every read in this app is "this user, this day" or "this user, this range".
create index food_logs_user_date_idx
  on public.food_logs (user_id, log_date desc, logged_at);

-- Backs `user_food_stats`: how often this user logs each dish, which orders
-- the "usual at this time" list on the log sheet.
create index food_logs_user_food_idx on public.food_logs (user_id, food_id);

-- `on delete restrict` above needs this to avoid a sequential scan of every
-- entry whenever a catalogue row is touched.
create index food_logs_serving_idx on public.food_logs (serving_id);

create trigger food_logs_set_updated_at
  before update on public.food_logs
  for each row execute function public.set_updated_at();

alter table public.food_logs enable row level security;

grant select, insert, update, delete on public.food_logs to authenticated;
grant select, insert, update, delete on public.food_logs to service_role;

create policy "food_logs: read own"
  on public.food_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "food_logs: insert own"
  on public.food_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "food_logs: update own"
  on public.food_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "food_logs: delete own"
  on public.food_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);
