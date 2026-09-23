-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.social_source_photo_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.photo_path is distinct from old.photo_path then
    update public.social_posts p
       set photo_path = null,
           photo_etag = null,
           -- Current entries already snapshot their food drawing at publication.
           -- Retention also matches one for older rows that did not carry it yet.
           -- Fill that legacy gap without rewriting an existing post snapshot.
           icon_set = case
             when p.icon_set is not null then p.icon_set
             when new.icon_set is not null and new.icon_name is not null then new.icon_set
             when new.item_icon_set is not null and new.item_icon_name is not null then new.item_icon_set
           end,
           icon_name = case
             when p.icon_name is not null then p.icon_name
             when new.icon_set is not null and new.icon_name is not null then new.icon_name
             when new.item_icon_set is not null and new.item_icon_name is not null then new.item_icon_name
           end,
           revision = revision + 1,
           updated_at = now()
     where p.source_entry_id = new.id and p.photo_path is not null;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_meal_photos (
  p_rows jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
      as r(id uuid, photo_path text, icon_set text, icon_name text)
   where f.id = r.id
     and f.photo_path = r.photo_path;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expired_meal_photos (
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    id         uuid,
    photo_path text,
    item_name  text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select f.id, f.photo_path, f.item_name
   from public.food_logs f
    left join public.subscriptions s on s.user_id = f.user_id
   where f.photo_path is not null
     -- The Worker deletes with bucket credentials. Apply the same key boundary
     -- as the photo signer before untrusted diary text can reach that credential:
     -- owned meals only, bounded, URL-safe and unable to walk out with `..`.
     and f.photo_path like 'meals/' || f.user_id::text || '/%'
     and pg_catalog.char_length(f.photo_path) <= 512
     and f.photo_path ~ '^[A-Za-z0-9/_.-]+$'
     and pg_catalog.strpos(f.photo_path, '..') = 0
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not public.is_entitled(f.user_id)
     -- Logged AFTER the paid period ended. See the note above: without this,
     -- a lapsed subscription hands the sweep every photograph the account ever
     -- took, on the night it lapses.
     and f.logged_at > coalesce(s.current_period_end, '-infinity'::timestamptz)
     -- And the grace period: that period must ALSO be more than sixty days
     -- gone. Null coalesces to -infinity, so an account that never subscribed
     -- has nothing to wait for.
     and coalesce(s.current_period_end, '-infinity'::timestamptz)
           < now() - pg_catalog.make_interval(
               days => public.lapsed_photo_grace_days()
             )
   order by f.logged_at
   -- `least`/`greatest` are parser CONSTRUCTS rather than catalog functions, so
   -- they cannot be schema-qualified: `pg_catalog.greatest(...)` is a "function
   -- does not exist" error even though the bare form resolves fine under
   -- `search_path = ''`. They need no qualification for the reason the prefix
   -- exists elsewhere in this file — there is no schema they could be shadowed
   -- from.
   limit least(greatest(p_limit, 1), 1000);
$function$;