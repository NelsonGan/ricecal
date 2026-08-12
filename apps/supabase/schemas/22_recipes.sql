-- ---------------------------------------------------------------------------
-- Home cooking.
--
-- A shared pot has no serving size, which is where logging breaks down: nobody
-- can answer "how many calories in that" about a wok of nasi goreng, but
-- everybody can answer "what went in, and how many does it feed". A recipe is
-- those two answers, entered once, and every future log of it is one tap.
--
-- WHERE THE MIRROR WENT
--
-- A recipe used to be copied into a `foods` row — `is_recipe`, priced per
-- serving, carrying the portions the detail screen offers — rebuilt by triggers
-- on every write. It existed for ONE reason: `food_logs.food_id` was not null
-- and referenced `foods`, so a recipe that could not be a catalogue row could
-- not be logged without a second shape for the day view, the trends, the week
-- strip and the reports.
--
-- The catalogue is in Cloudflare D1 now and that foreign key is gone. An entry
-- carries its own numbers, so logging a pot writes the same snapshot every
-- other entry writes, taken from `recipe_details` — which already computed the
-- per-serving figures the mirror was built out of.
--
-- What that costs is the property people expect here: correcting a recipe no
-- longer moves last week's diary, because realising the pot was six servings
-- rather than four does not reach entries that already took their copy. It is
-- the same trade `food_logs` makes with the catalogue at large, for the same
-- reason, and `food_logs.recipe_id` is the provenance a re-snapshot would need.
--
-- THREE KINDS OF ROW, ONE TABLE
--
--   mine       owner_id = me
--   official   owner_id is null — the RiceCal kitchen, written by service_role
--   community  somebody else's, public AND approved
--
-- Official is the absence of an owner rather than a flag beside one, so there
-- is no way to spell "official and owned by Farah". Clients can only insert
-- rows owned by themselves, so the third state is not reachable from the app.
-- ---------------------------------------------------------------------------

create table public.recipes (
  id            uuid primary key default gen_random_uuid(),

  -- Null means the RiceCal kitchen. See the header.
  owner_id      uuid references auth.users (id) on delete cascade,

  name          text not null check (char_length(trim(name)) between 1 and 120),

  -- An object key in R2 under `meals/<user>/`, never a URL, exactly like
  -- `food_logs.photo_path`. The photo of the pot.
  photo_path    text,
  -- The illustration for a recipe with no photograph, picked from the same
  -- sets a logged entry can pick from. Both columns or neither.
  icon_set      public.icon_set,
  icon_name     text,
  constraint recipes_icon_complete check ((icon_set is null) = (icon_name is null)),

  -- How many people the pot feeds. The whole reason this table exists: it is
  -- what turns a total into a portion, and it is why the ingredient list can be
  -- written in kilograms and still log as one bowl.
  servings      smallint not null default 1 check (servings between 1 and 100),

  -- How it is cooked, as prose. Free text on purpose — a numbered-step editor
  -- is a lot of interface for something nobody reads back except as a
  -- paragraph.
  steps         text check (char_length(steps) <= 4000),

  -- PUBLISHING
  --
  -- Two columns rather than one, because they are two different facts: the
  -- owner asked for this to be public, and a reviewer decided whether it may
  -- be. The community tab requires BOTH, so a recipe whose review never ran is
  -- invisible rather than published — the failure direction that matters.
  is_public     boolean not null default false,
  review_status public.recipe_review not null default 'pending',
  -- Why it was turned down, in the reviewer's words, shown to the owner. Null
  -- when nothing has been decided or when it passed.
  review_note   text check (char_length(review_note) <= 500),

  -- Who to credit on a community row.
  --
  -- Copied off the profile rather than joined at read time, because `profiles`
  -- is readable only by its owner and widening that policy to put a name on a
  -- recipe card would expose every profile in the table. Refreshed on every
  -- write of the recipe, which is as fresh as a display name needs to be.
  author_name   text not null default '' check (char_length(author_name) <= 60),

  -- The link. `ricecal.my/r/<share_slug>`, minted once and never rotated, so a
  -- link sent to a friend last month still opens.
  share_slug    text not null,

  -- Where this copy came from, when it was saved off somebody else's. Kept for
  -- the "FROM AYU" line and so a future "the original changed" notice has
  -- something to hang on. `set null` rather than cascade: deleting the original
  -- must not delete the copies people made of it.
  source_recipe_id uuid references public.recipes (id) on delete set null,

  -- How many people have saved a copy. Maintained by `save_recipe_copy`, which
  -- is the only path that makes one.
  saved_count   integer not null default 0 check (saved_count >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint recipes_share_slug_key unique (share_slug)
);

create index recipes_owner_idx on public.recipes (owner_id, created_at desc);

-- The community tab's whole query: public, approved, most saved first. Partial,
-- because approved public rows are a small fraction of the table.
create index recipes_community_idx
  on public.recipes (saved_count desc, created_at desc)
  where is_public and review_status = 'approved';

-- The RiceCal kitchen's list.
create index recipes_official_idx
  on public.recipes (created_at desc) where owner_id is null;

create index recipes_source_idx
  on public.recipes (source_recipe_id) where source_recipe_id is not null;


-- ---------------------------------------------------------------------------
-- Who has saved a community recipe.
--
-- ONE ROW PER PERSON PER RECIPE, and the primary key is what makes that true.
-- `saved_count` used to be bumped on every call to `save_recipe_copy`, so a
-- person who saved the same rendang three times to try three variations of it
-- counted as three people — and since the community shelf is ORDERED by that
-- column, the way to the top of it was to save your own favourite repeatedly.
-- A counter with no ledger behind it cannot tell those apart.
--
-- The row records the FACT of the save and outlives the copy it was made from.
-- Deleting your copy does not take the save back: it happened, and "how many
-- people have saved this" is a question about people rather than about how many
-- of them still have it in their list. The alternative — deriving the count
-- from `count(distinct owner_id)` over `source_recipe_id` — is one fewer table
-- and gets that question wrong, and it puts a subquery under the one shelf
-- query that has an index built for it.
--
-- NO CLIENT GRANTS AT ALL, not merely no policy. `save_recipe_copy` is
-- `security definer` and is the only writer there is; a client that could
-- insert here could vote for its own recipe as many times as it liked, which
-- is the thing this table exists to stop.
-- ---------------------------------------------------------------------------
create table public.recipe_saves (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  saved_at  timestamptz not null default now(),

  primary key (recipe_id, user_id)
);

alter table public.recipe_saves enable row level security;

grant select, insert, delete on public.recipe_saves to service_role;


-- ---------------------------------------------------------------------------
-- What went into the pot.
--
-- PER UNIT, NOT PER INGREDIENT
--
-- The macros here describe ONE gram, ONE millilitre or ONE of the thing, and
-- the amount beside them is how many went in. That is what survives the amount
-- being changed: reopening a recipe and correcting 400 ml of santan to 250
-- reprices it with no catalogue lookup and no second opinion, because the
-- density was the part that was true.
--
-- `food_id` is provenance and nothing more. It records that this ingredient was
-- picked out of the catalogue rather than typed, so the row can say where its
-- numbers came from — but the numbers are copied here rather than joined,
-- because an ingredient can also be somebody's own kerisik that exists in no
-- catalogue, and a list where half the rows join and half do not is a list with
-- two shapes.
-- ---------------------------------------------------------------------------

create table public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes (id) on delete cascade,

  -- What it is called in this pot. The catalogue's own name when it was picked
  -- from there, whatever the cook typed when it was not.
  name          text not null check (char_length(trim(name)) between 1 and 120),

  -- The catalogue row it came from, when it came from one. Unconstrained: the
  -- catalogue is in another database, and this was never more than provenance
  -- anyway — the numbers are copied onto this row, not joined from there.
  food_id       uuid,

  amount        numeric(9, 2) not null check (amount > 0 and amount <= 100000),
  unit          public.recipe_unit not null default 'g',

  -- Per one unit. See the header.
  kcal_per_unit      numeric(10, 4) not null check (kcal_per_unit >= 0),
  carbs_g_per_unit   numeric(10, 4) not null default 0 check (carbs_g_per_unit >= 0),
  protein_g_per_unit numeric(10, 4) not null default 0 check (protein_g_per_unit >= 0),
  fat_g_per_unit     numeric(10, 4) not null default 0 check (fat_g_per_unit >= 0),

  -- The order they are listed in, which is the order they were added.
  position      smallint not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index recipe_ingredients_recipe_idx
  on public.recipe_ingredients (recipe_id, position);


-- ---------------------------------------------------------------------------
-- WHERE `recipe_sync_food` WENT
--
-- A recipe was rebuilt into a `foods` row on every write of it or its
-- ingredients — one function, called from four triggers, because the mirror was
-- a pure function of the recipe and there was no incremental update to get
-- wrong. It offered the portions the detail screen shows: half, one, two and
-- the whole pot, the last two created only where they meant something.
--
-- All of it is gone with the mirror. `recipe_details` computes the per-serving
-- figures directly from the ingredient list, which is what the mirror was built
-- out of in the first place, and the portions are the detail screen's to offer
-- against a snapshot rather than a catalogue row's to hold.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Everything a recipe needs settled before it exists: its share link and the
-- name to credit.
--
-- The share slug is minted from the name plus eight hex characters. Random
-- rather than sequential so a link cannot be guessed by counting, and appended
-- rather than replacing the name so a link pasted into a chat still says what
-- it is.
-- ---------------------------------------------------------------------------

create or replace function public.recipes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stem text;
begin
  if new.share_slug is null then
    -- `search_normalize` folds accents and case; the rest turns what is left
    -- into link-safe words. A name that is entirely punctuation leaves nothing,
    -- hence the fallback stem.
    v_stem := pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(public.search_normalize(new.name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    );
    v_stem := pg_catalog.left(coalesce(nullif(v_stem, ''), 'recipe'), 40);
    -- Eight hex characters off a fresh uuid. `gen_random_bytes` would be the
    -- obvious source and lives in pgcrypto, which this database does not
    -- install; a v4 uuid is the same CSPRNG and is already here.
    new.share_slug := v_stem || '-' || pg_catalog.left(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 8
    );
  end if;

  new.author_name := coalesce(
    (select p.display_name from public.profiles p where p.id = new.owner_id),
    ''
  );

  return new;
end;
$$;

-- Stated here and applied by a hand-written migration: `db diff` does not
-- carry grants, so a revoke that only lives in a schema file never happens.
revoke execute on function public.recipes_before_insert from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- An edit sends a published recipe back to the reviewer.
--
-- THE GATE'S SECOND HALF, and without it the first half is decoration. Publish
-- something bland, collect an `approved`, then rewrite the name and the steps
-- into an advert: the row is still `is_public and review_status = 'approved'`,
-- so the new text is live in the community tab and no reviewer has ever seen
-- it. `set_recipe_public` only runs when the toggle is flipped, so it cannot be
-- what catches this.
--
-- Here rather than in the client for the usual reason: `review_status` is not
-- in anybody's column grant, so a client CANNOT reset it, and a rule the client
-- is trusted to follow is a rule an attacker declines to. The recipe stays
-- public and goes back to `pending`, which is invisible — the same failure
-- direction as everywhere else in this feature.
--
-- Private recipes are left alone. There is nothing to re-review about a recipe
-- nobody but its author can see, and marking one `pending` would mean the next
-- publish inherited a verdict from an edit rather than from a reading.
-- ---------------------------------------------------------------------------
create or replace function public.recipes_reset_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public then
    new.review_status := 'pending';
    new.review_note := null;
  end if;
  return new;
end;
$$;

-- The same, reached from the ingredient triggers, where the change is a row in
-- another table. The nutrition IS reviewable — "calories that do not follow
-- from the ingredients" is one of the two grounds — so swapping the ingredient
-- list under an approved recipe has to send it back too.
create or replace function public.recipe_mark_for_review(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recipes
  set review_status = 'pending', review_note = null
  where id = p_recipe_id and is_public and review_status <> 'pending';
end;
$$;

revoke execute on function public.recipe_mark_for_review(uuid) from public, anon, authenticated;
grant execute on function public.recipe_mark_for_review to service_role;

-- Who to credit, refreshed.
--
-- The credit is copied onto the recipe rather than joined at read time, because
-- `profiles` is readable only by its owner and widening that to put a name on a
-- community card would expose every profile in the table. The cost of the copy
-- is that it goes stale, and this is what pays it: the change that makes it
-- stale is an update to PROFILES, not to any recipe, so the trigger belongs
-- there. Hung off the recipe instead it would only ever fire when a recipe was
-- edited for some other reason — which is to say, mostly never.
create or replace function public.profiles_sync_recipe_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recipes
  set author_name = coalesce(new.display_name, '')
  where owner_id = new.id and author_name is distinct from coalesce(new.display_name, '');
  return null;
end;
$$;

create trigger profiles_sync_recipe_author
  after update of display_name on public.profiles
  for each row execute function public.profiles_sync_recipe_author();

create or replace function public.recipe_ingredients_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  -- This used to rebuild the mirror as well. What is left is the half that
  -- matters: changing what went into a published pot sends it back to the
  -- reviewer, because the ingredient list is part of what was approved.
  perform public.recipe_mark_for_review(v_recipe_id);
  return null;
end;
$$;

-- Stated here and applied by a hand-written migration: `db diff` does not
-- carry grants, so a revoke that only lives in a schema file never happens.
revoke execute on function public.recipe_ingredients_after_write from public, anon, authenticated;

create trigger recipes_before_insert
  before insert on public.recipes
  for each row execute function public.recipes_before_insert();

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Three triggers stood here — two rebuilding the mirror on insert and on the
-- columns it was built from, one deleting it with the recipe unless somebody
-- had eaten it. Nothing to rebuild and nothing to delete.

-- Ordered before `recipes_set_updated_at` and after nothing: Postgres runs
-- before-row triggers in name order, and neither of these reads the other's
-- columns.
create trigger recipes_reset_review
  before update of name, steps, servings on public.recipes
  for each row execute function public.recipes_reset_review();

-- Renamed from `recipe_ingredients_sync_food`, which is what it did until the
-- mirror went. A trigger whose name says it syncs a catalogue row is a trap for
-- whoever next goes looking for where that happens.
create trigger recipe_ingredients_after_write
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_after_write();

create trigger recipe_ingredients_set_updated_at
  before update on public.recipe_ingredients
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Row security.
--
-- Read is the interesting one, and it is three cases in one policy: mine, the
-- kitchen's, and anybody's that is both public and approved. `review_status`
-- being in the predicate is what makes moderation real rather than advisory —
-- a client that ignored the flag would still not be shown the row.
--
-- Write is own-only. There is no policy under which a client can create an
-- official recipe or edit somebody else's, and `owner_id` is checked on the
-- way in and on the way out of an update so a recipe cannot be handed away.
-- ---------------------------------------------------------------------------

alter table public.recipes enable row level security;

grant select, insert, delete on public.recipes to authenticated;
-- Update is COLUMN LEVEL, and that is the moderation gate.
--
-- `is_public` and `review_status` are deliberately absent: with a table-wide
-- update grant, the same client that asks to publish could write
-- `review_status = 'approved'` itself, and the review would be a formality the
-- app performs on itself. Publishing goes through `set_recipe_public` below,
-- which can only ever move the row to `pending`; only `service_role` — the
-- review function — can approve one.
--
-- `author_name`, `share_slug`, `food_id` and `saved_count` are absent for a
-- quieter reason: they are derived, and a client that could write them could
-- credit somebody else, collide two share links, or point its recipe at the
-- catalogue row of a dish it did not cook.
grant update (name, photo_path, icon_set, icon_name, servings, steps)
  on public.recipes to authenticated;
grant select, insert, update, delete on public.recipes to service_role;

create policy "recipes: read own, official and approved public"
  on public.recipes for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or owner_id is null
    or (is_public and review_status = 'approved')
  );

create policy "recipes: insert own"
  on public.recipes for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "recipes: update own"
  on public.recipes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "recipes: delete own"
  on public.recipes for delete
  to authenticated
  using (owner_id = (select auth.uid()));


alter table public.recipe_ingredients enable row level security;

grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to service_role;

-- Visibility follows the recipe, so this is the read policy above by reference
-- rather than by repetition — a rule copied into two places is a rule that will
-- be changed in one of them.
create policy "recipe_ingredients: read with recipe"
  on public.recipe_ingredients for select
  to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));

create policy "recipe_ingredients: write own recipe"
  on public.recipe_ingredients for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
  );

create policy "recipe_ingredients: update own recipe"
  on public.recipe_ingredients for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
  );

create policy "recipe_ingredients: delete own recipe"
  on public.recipe_ingredients for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
  );
