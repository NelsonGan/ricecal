-- ---------------------------------------------------------------------------
-- What the user ate. The busiest table in the app.
--
-- Why `log_date` is a date and `logged_at` is an instant: they answer different
-- questions and neither derives the other reliably. `log_date` is which day this
-- counts towards, a calendar fact about the user's own day, which is why supper
-- at 00:30 can be dragged back onto the previous day. `logged_at` is when it
-- happened, which orders the rows inside a meal and prints "8:20 am" on each one.
--
-- Why the entry carries its own macros: it did not, for most of this app's life.
-- An entry was a foreign key and a quantity, every calorie was derived at read
-- time through a join, and the property that bought was worth having, since
-- correcting a catalogue row corrected every log that used it.
--
-- The catalogue is in Cloudflare D1 now, 3.2 million barcoded products behind a
-- Worker, and a foreign key cannot cross into another database. So either the
-- numbers travel with the entry or a day's total becomes a network call, and a
-- diary that cannot add up its own day offline is not a diary.
--
-- The trade is now the other way round: a dish corrected in the catalogue no
-- longer corrects the diaries that used it. `food_id` survives as a soft
-- reference, unconstrained, so a future job could re-snapshot entries against the
-- current catalogue. Not automatic, but recoverable.
--
-- What it buys is that the catalogue became disposable: truncatable, rebuildable,
-- reloadable without touching a diary. That is not hypothetical. A reload of it
-- took this app down to 6,451 foods once, because the delete had to cascade
-- through the entries pointing at the rows being replaced.
--
-- The seam for calorie scanning: a scan resolves to a food and then writes an
-- ordinary entry, and `source = 'camera'` and `photo_path` are here for that. A
-- photo that matches nothing in the catalogue has somewhere to land, because the
-- cascade's lower tiers write their estimate straight into these columns with a
-- null `food_id`.
-- ---------------------------------------------------------------------------

create table public.food_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Defaulted from the user's own timezone so a write that omits it lands on
  -- the right day rather than on the server's UTC day.
  log_date     date not null default public.local_today(),
  -- No `meal`. A logged plate used to carry breakfast/lunch/dinner/snack, and
  -- it earned nothing: the diary is one chronological list, the time on each
  -- row says where in the day it belongs, and every write had to pick a value
  -- for a field nobody read back. Meal TIMES survive on `meal_times`, where
  -- they mean something — the hours a reminder fires.

  -- Provenance, not a dependency. Both name rows in a catalogue that is not in
  -- this database, so neither is constrained and neither is required: an
  -- estimate the cascade invented has no catalogue row to point at, and a plate
  -- rebuilt from its own parts stops describing whatever it used to be.
  food_id      uuid,
  -- Text rather than uuid: a portion in D1 is keyed `(food_id, slug)` and the
  -- Worker names one `"<food id>:<slug>"`. Left as a uuid it typechecked
  -- everywhere and rejected every real insert.
  serving_id   text,
  -- The pot this came out of, when it was logged from a recipe. Soft for the
  -- same reason, and it must not stop a recipe being deleted.
  recipe_id    uuid,

  -- THE SNAPSHOT: what this entry is worth, and the only thing that says so.
  --
  -- Per ONE base serving, exactly as the catalogue quotes them, because the
  -- arithmetic downstream is unchanged — base x factor x quantity — and the
  -- stepper and the portion sheet keep working without learning anything new.
  item_name      text not null,
  item_brand     text,
  -- The food's own drawing, distinct from `icon_set`/`icon_name` below, which
  -- are the user's override. The view coalesces them in that order.
  item_icon_set  public.icon_set,
  item_icon_name text,
  item_place     public.food_place,

  base_kcal      integer not null,
  base_carbs_g   numeric(6, 1) not null,
  base_protein_g numeric(6, 1) not null,
  base_fat_g     numeric(6, 1) not null,
  -- Only a catalogue row or a photographed panel knows these; null is honest.
  base_fibre_g   numeric(6, 1),
  base_sugar_g   numeric(6, 1),
  base_sodium_mg integer,

  -- The portion, as it was chosen. `serving_id` pointed into `food_servings`;
  -- what it MEANT was these three values, and they are what the row needs.
  serving_label  text not null,
  serving_factor numeric(6, 3) not null,
  serving_grams  numeric(9, 2),

  quantity     numeric(6, 2) not null default 1 check (quantity > 0 and quantity <= 100),

  logged_at    timestamptz not null default now(),
  -- A free-text correction: "no sambal", "kurang manis". Not parsed.
  note         text check (char_length(note) <= 500),

  source       public.entry_source not null default 'search',
  -- An object key in R2, under `meals/<user>/`. A key and never a URL, which
  -- is what made moving off Supabase Storage a change of base URL rather than
  -- a migration over every row. Read and written through the `photos` edge
  -- function, which is the only thing holding a credential for that bucket.
  photo_path   text,

  -- Groups the entries one photographed plate decomposed into. A scan that
  -- resolves to components writes N rows sharing one value; a single-dish scan
  -- writes one row that still carries it, so "what did this photo become" is
  -- answerable either way. Null for anything not born from a scan.
  scan_id      uuid,

  -- The model's specific name for the plate, kept when the entry points at a
  -- shared estimate or archetype row whose own name is generic ("Fried rice,
  -- estimated"). `food_log_details` reads coalesce(display_label, foods.name),
  -- so a null costs nothing. Deliberately not `note`, which is the user's own
  -- free-text correction.
  display_label text check (char_length(display_label) between 1 and 120),

  -- Up to three short corrections the vision model thought likely for this
  -- plate ("No sambal", "Half portion", "Add a fried egg"), offered as one-tap
  -- chips over the fix-by-typing box. Suggestions, not state: applying one
  -- goes through the scan-refine function like any typed instruction.
  suggested_edits jsonb check (
    suggested_edits is null
    or (jsonb_typeof(suggested_edits) = 'array' and jsonb_array_length(suggested_edits) <= 3)
  ),

  -- The numbers, when the user has typed their own.
  --
  -- Everything else on an entry describes which food and how much, and the calories
  -- follow from the catalogue row. That breaks down for the case this exists for: a
  -- dish the app got close but not right, where the person eating it knows the
  -- answer, off a packet or off the kitchen scale. Rescaling the portion to reach
  -- the right calorie total would lie about the portion, and correcting the shared
  -- `foods` row would change the number for everyone who ever logged it.
  --
  -- Null means "the catalogue is right", which is almost every row. Each field
  -- stands alone: someone who fixes only the protein keeps the catalogue's carbs.
  -- `food_log_details` coalesces them over the computed figures, so every total in
  -- the app follows without knowing this exists.
  override_kcal      integer check (override_kcal between 0 and 20000),
  override_carbs_g   numeric(7, 1) check (override_carbs_g between 0 and 2000),
  override_protein_g numeric(7, 1) check (override_protein_g between 0 and 2000),
  override_fat_g     numeric(7, 1) check (override_fat_g between 0 and 2000),

  -- An illustration the user picked for this row, overriding the food's own.
  --
  -- Here rather than on `foods` because `foods` is shared: the catalogue is
  -- read-only to users, and most of it has no drawing at all. This is the one place
  -- a user can say what a plate looked like without a photo of it.
  --
  -- Per entry, so it is deliberately not remembered for the next log of the same
  -- dish. Both columns or neither, for the same reason as on `foods`: half an icon
  -- cannot be resolved.
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
  updated_at   timestamptz not null default now()

  -- There were two foreign keys here, and the composite one was the point: a
  -- two-column reference meant the serving was guaranteed to belong to the food,
  -- where two independent ones would each be satisfiable while together describing
  -- a plate of nasi lemak measured in cups of teh tarik.
  --
  -- Neither can exist across databases. What replaced them is that the portion is
  -- no longer a reference at all: `serving_label` and `serving_factor` are on this
  -- row, so there is no second table for them to disagree with.
);

-- Every read in this app is "this user, this day" or "this user, this range".
create index food_logs_user_date_idx
  on public.food_logs (user_id, log_date desc, logged_at);

-- Backs `user_food_stats`: how often this user logs each dish, which orders
-- the "usual at this time" list on the log sheet.
create index food_logs_user_food_idx on public.food_logs (user_id, food_id);

-- There was an index on `serving_id` here, to keep the `on delete restrict`
-- from sequentially scanning every entry whenever a catalogue row was touched.
-- Nothing cascades from a catalogue that is not here, and nothing queries by
-- serving, so it was carrying its own write cost for no read.

-- Backs the estimate-backlog report: "which estimate rows are referenced most"
-- is a count over this column.
create index food_logs_scan_idx on public.food_logs (scan_id) where scan_id is not null;

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
