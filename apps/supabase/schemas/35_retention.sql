-- ---------------------------------------------------------------------------
-- What a free account's photographs are kept for.
--
-- THIRTY DAYS, AND ONLY THE PICTURE. The entry stays for ever: its name, its
-- macros, its portion and its place in the diary are what a calorie history
-- IS, and an app that deleted those would be deleting the user's record of
-- their own year. What goes is the plate — the one part of an entry that costs
-- a real amount to store, that nobody scrolls back to, and that the model has
-- already finished reading.
--
-- Pro keeps every photograph. That is the offer, and it is the one line of the
-- comparison table that cannot be walked back later: a promise about what is
-- kept becomes false retroactively the moment it is narrowed, so the free
-- window is written down here and in `packages/shared` and nowhere else.
--
-- THE SWEEP LIVES IN AN EDGE FUNCTION, not in a cron job here. Postgres cannot
-- reach R2, and a row whose `photo_path` was nulled by a statement that could
-- not delete the object would leave the bytes behind for good — the key is the
-- only name they have. So `functions/retention` reads the keys, deletes the
-- objects, and only then clears the column; a failure anywhere in that leaves
-- the row intact and the next run picks it up again. See the function.
-- ---------------------------------------------------------------------------

create or replace function public.free_photo_retention_days()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 30;
$$;

revoke execute on function public.free_photo_retention_days from public, anon;
grant execute on function public.free_photo_retention_days to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Photographs that are past the free window, oldest first.
--
-- BY `logged_at`, not by `log_date`. The two answer different questions and
-- only one of them is about elapsed time: `log_date` is which day an entry
-- counts towards and a user may set it to anything they like, so a meal
-- back-dated to last year would be swept the moment it was written. `logged_at`
-- is when the row actually happened, which is the only honest basis for "we
-- kept this for thirty days".
--
-- ENTITLEMENT IS CHECKED PER ROW, at sweep time, so a lapsed subscription does
-- not take the photographs with it on the day it lapses — they age out from
-- then on like anybody else's, and a resubscription stops the sweep again with
-- everything that is left still there.
--
-- `security definer` and `service_role` only: it reads across every account,
-- which is exactly what no client may do.
-- ---------------------------------------------------------------------------
create or replace function public.expired_meal_photos(p_limit integer default 500)
returns table (
  id         uuid,
  photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.photo_path
    from public.food_logs f
   where f.photo_path is not null
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not public.is_entitled(f.user_id)
   order by f.logged_at
   limit pg_catalog.least(pg_catalog.greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.expired_meal_photos from public, anon, authenticated;
grant execute on function public.expired_meal_photos to service_role;

-- The sweep's own index, and the only reason it exists. `food_logs` grows for
-- ever and only a small and shrinking part of it carries a photograph, so a
-- partial index over exactly those rows keeps a daily scan proportional to the
-- pictures rather than to the diary. Declared beside the query that needs it
-- rather than with the table, because it is not part of what an entry is.
create index if not exists food_logs_photo_sweep_idx
  on public.food_logs (logged_at)
  where photo_path is not null;

-- ---------------------------------------------------------------------------
-- Forget the photographs whose objects have just been deleted, and leave a
-- drawing where each one was.
--
-- THE ROW MUST NOT GO BLANK. An entry with no photograph and no icon draws the
-- placeholder tile, so a swept month of snapped meals would turn into a column
-- of identical grey squares — which reads as the app having lost the diary
-- rather than as a picture having aged out. `icon-match.ts` already maps a dish
-- name onto one of the app's illustrations for the barcode path, and the caller
-- runs the entry's own name through it, so most rows come back with the drawing
-- a typed meal would have been given in the first place. A name it cannot place
-- passes null and keeps the placeholder, which is the honest answer.
--
-- Takes ids rather than keys because an id is what an entry is, and two entries
-- have never shared a key — `newKey` mints a uuid per upload and nothing is
-- ever written over. Called AFTER the delete, so a crash between the two leaves
-- a row naming an object that is gone; the next sweep finds the same row, asks
-- R2 to delete a key that is already absent (which S3 answers 204 to), and
-- clears it. The other order would orphan the bytes for ever.
--
-- One statement rather than a loop, because a sweep is hundreds of rows and a
-- round trip each would make the function's runtime the network's.
-- ---------------------------------------------------------------------------
create or replace function public.clear_meal_photos(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- The matched icon is only written where the row would otherwise draw
  -- NOTHING. An entry logged against a catalogue dish already carries that
  -- dish's own drawing in `item_icon_set`, which the diary reads when the
  -- override is null — overwriting it with a fuzzy match on the entry's name
  -- would replace a correct picture with a guess, and would do it as a side
  -- effect of a retention sweep.
  update public.food_logs f
     set photo_path = null,
         icon_set   = case
                        when f.item_icon_set is null
                        then nullif(r.icon_set, '')::public.icon_set
                        else f.icon_set
                      end,
         icon_name  = case
                        when f.item_icon_set is null
                        then nullif(r.icon_name, '')
                        else f.icon_name
                      end
    from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as r(id uuid, icon_set text, icon_name text)
   where f.id = r.id
     and f.photo_path is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.clear_meal_photos from public, anon, authenticated;
grant execute on function public.clear_meal_photos to service_role;
