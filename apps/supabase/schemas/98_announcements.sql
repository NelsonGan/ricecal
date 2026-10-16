-- The in-app news announcements this account has been shown, by id.
--
-- On the account rather than the phone because showing one can change a
-- setting: the feed announcement switches Auto post foods on. Kept per install,
-- a reinstall or a second phone would show it again and switch it back on for
-- somebody who had turned it off. The ids are the app's own
-- (`features/news/announcements.ts`), and the app writes the list.
alter table public.profiles
  add column seen_announcements text[] not null default '{}'
    -- Bounded in size as well as count: the column is the client's to write,
    -- and on a 500 MB plan one row of huge strings is an outage.
    check (cardinality(seen_announcements) <= 200
      and octet_length(array_to_string(seen_announcements, ',')) <= 8000);

grant update (seen_announcements) on public.profiles to authenticated;
