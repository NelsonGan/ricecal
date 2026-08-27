-- ---------------------------------------------------------------------------
-- Reporting a recipe, and blocking the cook who wrote it.
--
-- App Review guideline 1.2 asks four things of an app whose users can see each
-- other's writing, and the community shelf is exactly that. Three of them
-- already existed:
--
--   * a filter before anything is posted — `functions/recipes {action:review}`
--     reads a recipe and only `service_role` can approve one, so nothing
--     reaches the shelf unread;
--   * published contact — the help row and `support@ricecal.app`;
--   * and the ability to take a recipe down, which `service_role` has always
--     had.
--
-- What was missing is the two halves a USER controls: reporting something, and
-- never seeing a particular cook again. Both are here.
--
-- THEY ARE ENFORCED IN THE READ POLICY, not in a query. `recipes` is read by
-- the shelf, by the detail screen, by `recipe_details`, by the ingredient
-- policy that defers to it, and by whatever is written next. A filter added to
-- one call site is a filter the next one forgets, and the failure mode is
-- showing somebody exactly what they asked never to see again. The policy is
-- the one place all of them go through.
--
-- NEITHER TABLE IS READABLE BY ANYONE BUT ITS OWNER, and that is not tidiness.
-- A report is an accusation and a block is a judgement about a person; either
-- one visible to its subject turns a moderation tool into a way to start an
-- argument. The author is never told, and the recipe simply stops appearing.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Cooks this account never wants to see again.
--
-- Keyed on the pair, so blocking twice is the same as blocking once and there
-- is no state to reconcile. Both sides cascade from `auth.users`: an account
-- that deletes itself takes its own blocks with it, and stops being blockable
-- by anyone else in the same statement.
-- ---------------------------------------------------------------------------
create table public.blocked_authors (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Not `references public.profiles`: the block is about the account rather
  -- than about the profile row, and the two are created together anyway.
  author_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, author_id),
  -- Blocking yourself would hide your own recipes from you, which is a support
  -- conversation nobody would guess the cause of.
  constraint blocked_authors_not_self check (user_id <> author_id)
);

-- The lookup the read policy performs on every community row.
create index blocked_authors_user_idx on public.blocked_authors (user_id);

alter table public.blocked_authors enable row level security;

grant select, insert, delete on public.blocked_authors to authenticated;
grant select, insert, delete on public.blocked_authors to service_role;

-- No update grant. A block has nothing to change: it exists or it does not.
create policy "blocked_authors: read own"
  on public.blocked_authors for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "blocked_authors: block as self"
  on public.blocked_authors for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "blocked_authors: unblock own"
  on public.blocked_authors for delete
  to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- Recipes somebody has reported.
--
-- One row per person per recipe, so a second report from the same account is an
-- upsert rather than a second vote. That is what makes the threshold below mean
-- "several people" instead of "one person tapping repeatedly".
-- ---------------------------------------------------------------------------
create table public.recipe_reports (
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      public.report_reason not null,
  created_at  timestamptz not null default now(),

  primary key (recipe_id, reporter_id)
);

create index recipe_reports_reporter_idx on public.recipe_reports (reporter_id);

alter table public.recipe_reports enable row level security;

-- No delete grant: a report is a record, and letting the reporter withdraw it
-- would also un-hide the recipe, which is not what anyone means by "undo".
grant select, insert on public.recipe_reports to authenticated;
grant select, insert, update, delete on public.recipe_reports to service_role;

create policy "recipe_reports: read own"
  on public.recipe_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "recipe_reports: report as self"
  on public.recipe_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- How many separate people it takes to pull a recipe off the shelf.
--
-- Three, and the number is a compromise between two ways of being wrong. One
-- would let a single account remove anybody's recipe from the shelf by tapping
-- a button, which is a moderation tool that is also a weapon. Ten would mean a
-- genuinely offensive recipe stays public until ten people have seen it, and
-- guideline 1.2 asks for a TIMELY response rather than a popular one.
--
-- What it costs is a false positive: three people can be wrong together, and
-- the recipe goes back to `pending` rather than to `rejected` so that the
-- review can put it back. What it buys is that the promise the app makes when
-- somebody taps Report is kept by the database rather than by a person reading
-- a queue.
-- ---------------------------------------------------------------------------
create or replace function public.report_threshold()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 3;
$$;

revoke execute on function public.report_threshold from public, anon;
grant execute on function public.report_threshold to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Take a reported recipe off the shelf once enough people have said so.
--
-- SECURITY DEFINER, because the whole point is that it writes a column no
-- client may write. `is_public` and `review_status` are absent from every
-- client grant on `recipes` — see the note there — so a reporter running as
-- `authenticated` cannot do this themselves, and a trigger that runs with their
-- rights could not either.
--
-- It parks the row at `pending` rather than `rejected`. Both are invisible on
-- the shelf, and only one of them is a claim: `pending` is where the ordinary
-- publish flow starts, so re-running the review is all it takes to put an
-- unfairly reported recipe back. `rejected` is the reviewer's word and this
-- function is not the reviewer.
-- ---------------------------------------------------------------------------
create or replace function public.recipe_reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recipes
     set is_public = false,
         review_status = 'pending'
   where id = new.recipe_id
     and is_public
     and (
       select count(*)
       from public.recipe_reports r
       where r.recipe_id = new.recipe_id
     ) >= public.report_threshold();

  return null;
end;
$$;

revoke execute on function public.recipe_reports_after_insert from public, anon, authenticated;

create trigger recipe_reports_after_insert
  after insert on public.recipe_reports
  for each row execute function public.recipe_reports_after_insert();


-- ---------------------------------------------------------------------------
-- The half of guideline 1.2 that has to be true of every read.
--
-- RESTRICTIVE, which is the one place in this schema that word appears. A
-- permissive policy is ORed with the others, so a second `for select` policy
-- here would WIDEN what is visible rather than narrow it; a restrictive one is
-- ANDed with whatever the permissive policies allowed. That is exactly the
-- shape of "and also not from somebody they blocked".
--
-- It lives here rather than inside `recipes: read own, official and approved
-- public` because both tables it consults are defined in this file and
-- `recipe_reports` cannot exist before `recipes` does. Restating the whole read
-- rule here would leave two policies that have to agree about three cases;
-- this one only knows about the one case it removes.
--
-- OWN AND OFFICIAL ARE EXEMPT, explicitly. A block hides a person's cooking
-- from you, and your own recipes are not theirs — a saved copy has your
-- `owner_id`, so it survives you blocking the cook you took it from, which is
-- the correct answer: the copy became yours when you saved it.
-- ---------------------------------------------------------------------------
create policy "recipes: not blocked or reported by me"
  on public.recipes as restrictive for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or owner_id is null
    or (
      not exists (
        select 1
        from public.blocked_authors b
        where b.user_id = (select auth.uid())
          and b.author_id = public.recipes.owner_id
      )
      and not exists (
        select 1
        from public.recipe_reports r
        where r.recipe_id = public.recipes.id
          and r.reporter_id = (select auth.uid())
      )
    )
  );
