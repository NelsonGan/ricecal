-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE TYPE public.report_reason AS ENUM (
  'inappropriate',
  'spam',
  'dangerous',
  'stolen'
);

CREATE FUNCTION public.recipe_reports_after_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE FUNCTION public.report_threshold()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 3;
$function$;

GRANT ALL ON FUNCTION public.report_threshold() TO authenticated;

GRANT ALL ON FUNCTION public.report_threshold() TO service_role;

CREATE TABLE public.blocked_authors (
  user_id    uuid                     NOT NULL,
  author_id  uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.blocked_authors
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blocked_authors
  ADD CONSTRAINT blocked_authors_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blocked_authors
  ADD CONSTRAINT blocked_authors_not_self CHECK (user_id <> author_id);

ALTER TABLE public.blocked_authors
  ADD CONSTRAINT blocked_authors_pkey PRIMARY KEY (user_id, author_id);

ALTER TABLE public.blocked_authors
  ADD CONSTRAINT blocked_authors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.blocked_authors TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.blocked_authors TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.blocked_authors TO service_role;

CREATE INDEX blocked_authors_user_idx ON public.blocked_authors (user_id);

CREATE POLICY "blocked_authors: block as self" ON public.blocked_authors
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "blocked_authors: read own" ON public.blocked_authors
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "blocked_authors: unblock own" ON public.blocked_authors
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.recipe_reports (
  recipe_id   uuid                     NOT NULL,
  reporter_id uuid                     NOT NULL,
  reason      public.report_reason     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_reports
  ADD CONSTRAINT recipe_reports_pkey PRIMARY KEY (recipe_id, reporter_id);

ALTER TABLE public.recipe_reports
  ADD CONSTRAINT recipe_reports_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE public.recipe_reports
  ADD CONSTRAINT recipe_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_reports TO anon;

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_reports TO authenticated;

GRANT ALL ON public.recipe_reports TO service_role;

CREATE INDEX recipe_reports_reporter_idx ON public.recipe_reports (reporter_id);

CREATE TRIGGER recipe_reports_after_insert
  AFTER INSERT ON public.recipe_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.recipe_reports_after_insert();

CREATE POLICY "recipe_reports: read own" ON public.recipe_reports
  FOR SELECT
  TO authenticated
  USING ((reporter_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipe_reports: report as self" ON public.recipe_reports
  FOR INSERT
  TO authenticated
  WITH CHECK ((reporter_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipes: not blocked or reported by me" ON public.recipes
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (owner_id IS NULL) OR ((NOT (EXISTS ( SELECT 1
   FROM public.blocked_authors b
  WHERE ((b.user_id = ( SELECT auth.uid() AS uid)) AND (b.author_id = recipes.owner_id))))) AND (NOT (EXISTS ( SELECT 1
   FROM public.recipe_reports r
  WHERE ((r.recipe_id = recipes.id) AND (r.reporter_id = ( SELECT auth.uid() AS uid)))))))));

-- HAND-ADDED, both of them, because `supabase db diff` does not emit revokes —
-- it wrote the two grants above and nothing about PUBLIC, which Postgres grants
-- EXECUTE to on every new function and which `anon` inherits. That is the exact
-- mechanism by which five functions once shipped executable by PUBLIC; see the
-- note in README.md under Traps.
--
-- The second one matters more than the first. `recipe_reports_after_insert` is
-- SECURITY DEFINER and writes `is_public` and `review_status`, two columns
-- deliberately absent from every client grant on `recipes`. Left executable by
-- `authenticated` it would still refuse to do anything useful (a trigger
-- function called directly raises), but it is the wrong thing to leave lying
-- around next to a table whose whole design is that a client cannot approve
-- itself.
revoke execute on function public.report_threshold from public, anon;
revoke execute on function public.recipe_reports_after_insert from public, anon, authenticated;
