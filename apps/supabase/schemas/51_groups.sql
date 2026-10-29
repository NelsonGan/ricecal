-- ---------------------------------------------------------------------------
-- Groups: up to twenty friends who can see each other's day of food.
--
-- Nothing here copies a meal. The board reads members' diary entries live
-- through definer functions in 97_groups.sql, so an edit, a deleted entry or a
-- new photo shows in every group at once, and leaving a group takes nothing
-- with it. What a group adds of its own is membership, invites, reactions to
-- an entry, nudges and one chat per group.
--
-- Every table is closed to clients. Reads and writes go through functions that
-- check membership themselves, because the diary's RLS is owner-only and must
-- stay that way: widening it for groups would widen it for everything.
--
-- A block between two people holds inside a group too: neither sees the
-- other's food or messages, nudges or reacts to the other, or is pushed by the
-- other. Joining a group the other is in stays allowed, so a block is not
-- revealed by a refusal.
-- ---------------------------------------------------------------------------

-- The three columns of the board. Snacks are not a column: they join the
-- nearest meal.
create type public.group_meal as enum ('breakfast', 'lunch', 'dinner');

-- Which column an entry sits in when its owner has moved it. Null means the
-- board places it by the time it was eaten. It lives on the entry so a move is
-- one fact shared by every group the owner is in.
alter table public.food_logs add column board_meal public.group_meal;

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  -- A drawing from the app's food set, named like an entry's icon.
  icon_name    text not null default 'rice-bowl' check (icon_name ~ '^[a-z0-9-]{1,60}$'),
  -- A picture the leader uploaded instead, Pro only. It sits in its uploader's
  -- avatar folder, so deleting that account takes the bytes, and the app draws
  -- `icon_name` whenever this is null or cannot be signed.
  icon_path    text check (icon_path ~ '^avatars/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$'),
  is_public    boolean not null default false,
  -- Null only for the moment between a leader's account being deleted and the
  -- trigger below handing the group on.
  leader_id    uuid references public.profiles(id) on delete set null,
  -- Kept by the membership triggers, so the cap, the lists and the public
  -- ranking read one column instead of counting rows for every group.
  member_count smallint not null default 0 check (member_count between 0 and 20),
  -- Hidden from the public list after three reports of its name. Members keep
  -- using it; a report is about strangers seeing it.
  quarantined  boolean not null default false,
  created_at   timestamptz not null default now()
);
-- Deleting a profile sets its groups' leader to null, which scans without this.
create index groups_leader_idx on public.groups(leader_id);
create index groups_public_idx on public.groups(member_count desc, created_at desc)
  where is_public and not quarantined;
create index groups_public_name_idx on public.groups using gin (name extensions.gin_trgm_ops)
  where is_public and not quarantined;

create table public.group_members (
  group_id      uuid not null references public.groups(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  -- This member's own row order for the board. Ids that have left are ignored
  -- when read and anyone not listed goes after, by join date.
  board_order   uuid[] not null default '{}' check (cardinality(board_order) <= 20),
  -- Chat messages after this are unread for this member.
  chat_read_at  timestamptz not null default now(),
  -- Pushes for chat messages and nudges.
  notify        boolean not null default true,
  -- Pushes for the foods and workouts members share to the chat on their own
  -- (98_group_chat_shares.sql). Its own switch, so a member can keep one kind.
  notify_updates boolean not null default true,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id, joined_at);

create table public.group_invites (
  id          uuid not null default gen_random_uuid() unique,
  group_id    uuid not null references public.groups(id) on delete cascade,
  invitee_id  uuid not null references public.profiles(id) on delete cascade,
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Set once a push has gone out, so a retried call cannot send it twice.
  pushed_at   timestamptz,
  -- Sent to an address rather than a handle. Its sender never sees who it
  -- found, or the field would say whether an address has an account.
  by_email    boolean not null default false,
  primary key (group_id, invitee_id),
  constraint group_invites_not_self check (invitee_id <> inviter_id)
);
create index group_invites_invitee_idx on public.group_invites(invitee_id, created_at desc);
create index group_invites_inviter_idx on public.group_invites(inviter_id);

-- A like or a dislike of an entry, by a person rather than in a group: the
-- same friend in two groups has one opinion of a plate. A board counts only
-- the reactions of its own members. Deleting the entry deletes them.
create table public.group_reactions (
  entry_id    uuid not null references public.food_logs(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  primary key (entry_id, user_id)
);
create index group_reactions_user_idx on public.group_reactions(user_id);

-- Only the last hour of nudges matters to anything; rows older than two days
-- are swept from a group as it nudges again (nudge_group_member).
create table public.group_nudges (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  target_id   uuid not null references public.profiles(id) on delete cascade,
  nudger_id   uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  meal        public.group_meal not null,
  created_at  timestamptz not null default now(),
  pushed_at   timestamptz,
  constraint group_nudges_not_self check (target_id <> nudger_id)
);
create index group_nudges_target_idx on public.group_nudges(group_id, target_id, day, meal, created_at desc);
create index group_nudges_target_id_idx on public.group_nudges(target_id);
create index group_nudges_nudger_idx on public.group_nudges(nudger_id);

create table public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  request_id  uuid not null,
  quarantined boolean not null default false,
  created_at  timestamptz not null default now(),
  -- When its push went out, so a retried send rings nobody twice.
  pushed_at   timestamptz,
  -- Shared by the app rather than written: a food posted or a workout done
  -- (98_group_chat_shares.sql). It pushes to members with `notify_updates`
  -- rather than `notify`, through group_update_push_targets.
  automatic   boolean not null default false,
  -- The message this one answers, in the same thread. Deleting that one
  -- leaves the reply standing on its own.
  reply_to_id uuid references public.group_messages(id) on delete set null,
  -- A food the author shared from their own posts. The card reads the post's
  -- meal live, as the board does, and the body holds its name and calories
  -- for a push and for an app from before food cards. Deleting the post (or
  -- the meal under it) takes the message with it.
  post_id     uuid references public.social_posts(id) on delete cascade,
  -- A workout the author did: one from the app's own logger, or one a health
  -- store recorded (a run, a game of badminton). Read live like a food, and
  -- deleting the workout deletes the message. Never on a feed post, so it
  -- reaches a group whether or not its author uses the feed.
  workout_id  uuid references public.workouts(id) on delete cascade,
  activity_id uuid references public.activity_sessions(id) on delete cascade,
  unique (author_id, request_id),
  -- A message shares one thing at most.
  constraint group_messages_one_share check (num_nonnulls(post_id, workout_id, activity_id) <= 1)
);
-- The thread's order, which group_messages pages through by (created_at, id).
create index group_messages_recent_idx on public.group_messages(group_id, created_at, id);
create index group_messages_reply_idx on public.group_messages(reply_to_id) where reply_to_id is not null;
create index group_messages_post_idx on public.group_messages(post_id) where post_id is not null;
create index group_messages_workout_idx on public.group_messages(workout_id) where workout_id is not null;
create index group_messages_activity_idx on public.group_messages(activity_id) where activity_id is not null;

-- One reaction per person per message, as Instagram's are: a second one
-- replaces the first. Only these, so the bar of choices and what is stored
-- cannot drift apart.
create table public.group_message_reactions (
  message_id  uuid not null references public.group_messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('❤️', '😂', '😮', '😢', '🔥', '👍')),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index group_message_reactions_user_idx on public.group_message_reactions(user_id);

create table public.group_message_reports (
  message_id  uuid not null references public.group_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Null from an app that did not ask why.
  reason      public.report_reason,
  primary key (message_id, reporter_id)
);
create index group_message_reports_reporter_idx on public.group_message_reports(reporter_id);

create table public.group_reports (
  group_id    uuid not null references public.groups(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, reporter_id)
);
create index group_reports_reporter_idx on public.group_reports(reporter_id);

-- Expo push tokens, one row per device. A token moves to whoever signed in on
-- that phone last.
create table public.push_tokens (
  token       text primary key check (char_length(token) between 10 and 200),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_reactions enable row level security;
alter table public.group_nudges enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_reports enable row level security;
alter table public.group_message_reactions enable row level security;
alter table public.group_reports enable row level security;
alter table public.push_tokens enable row level security;
revoke all on public.groups, public.group_members, public.group_invites, public.group_reactions,
  public.group_nudges, public.group_messages, public.group_message_reports, public.group_reports,
  public.group_message_reactions, public.push_tokens from anon, authenticated;
grant all on public.groups, public.group_members, public.group_invites, public.group_reactions,
  public.group_nudges, public.group_messages, public.group_message_reports, public.group_reports,
  public.group_message_reactions, public.push_tokens to service_role;
-- Server only. Besides having no client grant, a restrictive policy means a
-- permissive one added by mistake still admits no client row.
create policy "Server only" on public.groups as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_members as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_invites as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_reactions as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_nudges as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_messages as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_message_reports as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_message_reactions as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.group_reports as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Server only" on public.push_tokens as restrictive for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.group_is_member(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user);
$$;

-- Whether two people share any group, which is what lets one see the other's
-- entries and react to them. A block in either direction cancels it.
create or replace function private.group_share(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = p_a and b.user_id = p_b
  ) and not exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_a and x.author_id = p_b) or (x.user_id = p_b and x.author_id = p_a)
  );
$$;

create or replace function private.group_require_member(p_group uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.group_is_member(p_group, v_user) then
    raise exception 'Group unavailable' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- The column an entry belongs in. The midpoints between a person's own meal
-- times split the day, so someone who lunches at 14:30 is not told their 11:00
-- plate was breakfast by someone else's clock. Anything before 04:00, or
-- logged onto the day before (supper at 00:30), is dinner.
create or replace function private.group_entry_meal(
  p_logged_at timestamptz, p_log_date date, p_timezone text, p_override public.group_meal,
  p_breakfast time, p_lunch time, p_dinner time
)
returns public.group_meal language plpgsql stable set search_path = '' as $$
declare
  v_local timestamp := p_logged_at at time zone coalesce(p_timezone, 'Asia/Kuala_Lumpur');
  v_minutes integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_b integer := extract(epoch from coalesce(p_breakfast, time '08:00'))::integer / 60;
  v_l integer := extract(epoch from coalesce(p_lunch, time '13:00'))::integer / 60;
  v_d integer := extract(epoch from coalesce(p_dinner, time '19:30'))::integer / 60;
begin
  if p_override is not null then return p_override; end if;
  if v_local::date > p_log_date or v_minutes < 240 then return 'dinner'; end if;
  if v_local::date < p_log_date then return 'breakfast'; end if;
  if v_minutes < (v_b + v_l) / 2 then return 'breakfast'; end if;
  if v_minutes < (v_l + v_d) / 2 then return 'lunch'; end if;
  return 'dinner';
end;
$$;

-- Whether a meal is overdue: it is the member's own `p_day`, and half an hour
-- has passed since their time for it. In minutes of the day rather than time
-- arithmetic, which wraps: 23:45 plus half an hour is 00:15, and a dinner at
-- 23:45 would have read as overdue from just after midnight.
create or replace function private.group_meal_due(
  p_local_now timestamp, p_day date, p_meal public.group_meal, p_at time
)
returns boolean language sql immutable set search_path = '' as $$
  select p_local_now::date = p_day
    and extract(hour from p_local_now) * 60 + extract(minute from p_local_now)
      >= extract(epoch from coalesce(p_at, case p_meal when 'breakfast' then time '08:00'
           when 'lunch' then time '13:00' else time '19:30' end)) / 60 + 30;
$$;

-- A leaver hands the group to the longest-standing member, and the last one
-- out deletes it. A trigger rather than only the leave function, because a
-- deleted account leaves every group by cascade.
create or replace function private.group_member_left()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_next uuid;
begin
  -- Locked before the next leader is picked: a leave and an account deletion
  -- at once otherwise each saw the other's row, and the group was left with
  -- no members and a leader who had gone.
  perform 1 from public.groups g where g.id = old.group_id for update;
  if not found then return null; end if;
  select m.user_id into v_next from public.group_members m
  where m.group_id = old.group_id order by m.joined_at, m.user_id limit 1;
  if v_next is null then
    delete from public.groups g where g.id = old.group_id;
  else
    update public.groups g set member_count = g.member_count - 1,
      leader_id = case when g.leader_id is null or g.leader_id = old.user_id then v_next else g.leader_id end
    where g.id = old.group_id;
  end if;
  return null;
end;
$$;
create trigger group_member_left after delete on public.group_members
  for each row execute function private.group_member_left();

-- Twenty members, and a person in at most twenty groups. The group row is locked
-- so two people joining at once cannot both take the last seat, and the person
-- is locked so two joins at once cannot both take their twentieth.
create or replace function private.group_member_joining()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count smallint;
begin
  perform pg_advisory_xact_lock(hashtextextended('group-joining:' || new.user_id::text, 0));
  select g.member_count into v_count from public.groups g where g.id = new.group_id for update;
  if v_count >= 20 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  if (select count(*) from public.group_members m where m.user_id = new.user_id) >= 20 then
    raise exception 'You are in too many groups' using errcode = 'P0001', hint = 'too_many_groups';
  end if;
  return new;
end;
$$;
create trigger group_member_joining before insert on public.group_members
  for each row execute function private.group_member_joining();

-- An invite cannot be used once the group is full, so it is withdrawn then
-- rather than left in someone's list to fail.
create or replace function private.group_member_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count smallint;
begin
  update public.groups g set member_count = g.member_count + 1
  where g.id = new.group_id returning g.member_count into v_count;
  delete from public.group_invites i where i.group_id = new.group_id and i.invitee_id = new.user_id;
  if v_count >= 20 then
    delete from public.group_invites i where i.group_id = new.group_id;
  end if;
  return null;
end;
$$;
create trigger group_member_joined after insert on public.group_members
  for each row execute function private.group_member_joined();

-- Blocking someone ends any pending invite between the two.
create or replace function private.group_block_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_invites i
  where (i.invitee_id = new.user_id and i.inviter_id = new.author_id)
     or (i.invitee_id = new.author_id and i.inviter_id = new.user_id);
  return null;
end;
$$;
create trigger group_block_after after insert on public.blocked_authors
  for each row execute function private.group_block_after();

revoke execute on function private.group_entry_meal, private.group_meal_due, private.group_member_left,
  private.group_member_joining, private.group_member_joined, private.group_block_after
  from public, anon, authenticated;
revoke execute on function private.group_is_member, private.group_share,
  private.group_require_member from public, anon;
grant execute on function private.group_is_member, private.group_share,
  private.group_require_member to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- How many groups a free account may lead. It counts the groups whose leader
-- the account is now, not every group it ever started: one handed on by
-- leaving frees its place. Joining is never limited by it.
create or replace function public.free_group_limit()
returns integer language sql immutable parallel safe set search_path = '' as $$
  select 2;
$$;

-- The drawings a free account may give a group. Every other drawing, and an
-- uploaded picture, is Pro. `chilli` left the app's free row so the row fits
-- one line, and stays here because an app from before that still offers it.
create or replace function public.free_group_icons()
returns text[] language sql immutable parallel safe set search_path = '' as $$
  select array['rice-bowl', 'noodle-bowl', 'dumpling', 'satay', 'avocado', 'smoothie', 'coffee', 'chilli'];
$$;

-- Refuses a Pro icon or an uploaded picture on a free account, with a token
-- the app matches on to open the paywall. A picture must be in the caller's
-- own avatar folder: the key is what the photos function will sign for every
-- member, so naming somebody else's would hand their picture out.
create or replace function private.group_check_icon(p_user uuid, p_icon_name text, p_icon_path text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if nullif(p_icon_path, '') is not null and (
    p_icon_path not like 'avatars/' || p_user::text || '/%'
    or p_icon_path !~ '^avatars/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$'
  ) then
    raise exception 'That picture cannot be used' using errcode = '22023';
  end if;
  if (nullif(p_icon_path, '') is not null
      or (nullif(p_icon_name, '') is not null and not (p_icon_name = any (public.free_group_icons()))))
     and not public.is_entitled(p_user) then
    raise exception 'pro_group_icon' using errcode = 'P0001', hint = 'pro_group_icon';
  end if;
end;
$$;

-- The limit's message is a token the app matches on, as `routine_limit_reached`
-- is, and it opens the paywall rather than a toast.
--
-- `p_icon_path` has a default so an app from before it, which sends three
-- arguments, still resolves to this function.
create or replace function public.create_group(
  p_name text, p_icon_name text, p_is_public boolean, p_icon_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false); v_group uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  perform private.group_check_icon(v_user, p_icon_name, p_icon_path);
  if not public.is_entitled(v_user) then
    -- One create at a time per free account, so two at once cannot both count
    -- one group and both pass.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('group_create:' || v_user::text));
    if (select count(*) from public.groups g where g.leader_id = v_user) >= public.free_group_limit() then
      raise exception 'group_limit_reached' using errcode = 'P0001', hint = 'group_limit_reached';
    end if;
  end if;
  if not private.social_claim(v_user, 'group_create', 10) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.groups(name, icon_name, icon_path, is_public, leader_id)
  values (btrim(p_name), coalesce(nullif(p_icon_name, ''), 'rice-bowl'), nullif(p_icon_path, ''),
    coalesce(p_is_public, false), v_user)
  returning id into v_group;
  insert into public.group_members(group_id, user_id) values (v_group, v_user);
  return v_group;
end;
$$;

-- Null leaves a field as it is. An empty `p_icon_path` takes the uploaded
-- picture away, so the drawing shows again. A drawing chosen with no path
-- named also takes the picture away: picking a drawing is choosing it.
create or replace function public.update_group(
  p_group_id uuid, p_name text, p_icon_name text, p_is_public boolean, p_icon_path text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_old text;
  v_old_icon text;
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  select g.name, g.icon_name into v_old, v_old_icon from public.groups g
  where g.id = p_group_id and g.leader_id = v_user for update;
  if not found then
    raise exception 'Only the leader can change the group' using errcode = '42501';
  end if;
  -- The icon the group already wears is never refused, so a lapsed Pro can
  -- still rename a group that wears a Pro drawing.
  perform private.group_check_icon(v_user,
    case when p_icon_name is distinct from v_old_icon then p_icon_name end, p_icon_path);
  update public.groups g set
    name = coalesce(btrim(p_name), g.name),
    icon_name = coalesce(nullif(p_icon_name, ''), g.icon_name),
    icon_path = case
      when p_icon_path is not null then nullif(p_icon_path, '')
      when nullif(p_icon_name, '') is not null then null
      else g.icon_path
    end,
    is_public = coalesce(p_is_public, g.is_public),
    -- A new name has not been reported. The same name saved again is not new,
    -- or saving it would clear its reports.
    quarantined = g.quarantined and btrim(coalesce(p_name, v_old)) = v_old
  where g.id = p_group_id;
  if btrim(coalesce(p_name, v_old)) <> v_old then
    delete from public.group_reports r where r.group_id = p_group_id;
  end if;
end;
$$;

-- `p_target` is a handle, with or without its @, or an email address, which
-- only finds an account that already exists. Returns the invite's id, which the
-- groups function uses to send the push.
--
-- An email answers the same whatever is behind it: the invite goes to an
-- account that can take it, and otherwise nothing happens and nothing says
-- so, so the field cannot be used to learn whether an address has an account.
-- Even the id is one: a made-up one, which the groups function finds nothing
-- for, rather than a null that would tell the two apart.
-- A handle is public already, so a handle that finds nobody says so.
create or replace function public.invite_to_group(p_group_id uuid, p_target text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_target text := lower(btrim(coalesce(p_target, '')));
  v_email boolean := position('@' in ltrim(lower(btrim(coalesce(p_target, ''))), '@')) > 0;
  v_invitee uuid;
  v_id uuid;
  v_count smallint;
begin
  if v_target = '' or char_length(v_target) > 254 then
    raise exception 'Enter a username or email' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'group_invite', 60) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  -- Before the lock, so the lookup does not hold up joins. GoTrue stores
  -- addresses lowercased, and comparing the column itself uses its index.
  if v_email then
    select u.id into v_invitee from auth.users u where u.email = v_target and not u.is_sso_user limit 1;
  else
    select p.id into v_invitee from public.profiles p where p.handle = ltrim(v_target, '@');
  end if;
  -- Locked with the joins, so an invite cannot slip into a group that a
  -- concurrent join has just filled.
  select g.member_count into v_count from public.groups g where g.id = p_group_id for update;
  if v_count >= 20 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  -- Someone blocked in either direction reads as nobody, so an invite cannot be
  -- used to learn who blocked whom.
  if v_invitee is null or v_invitee = v_user or private.social_pair_blocked(v_invitee)
     or exists (select 1 from public.profiles p where p.id = v_invitee and p.quarantined) then
    if v_email then return gen_random_uuid(); end if;
    raise exception 'No account found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if private.group_is_member(p_group_id, v_invitee) then
    if v_email then return gen_random_uuid(); end if;
    raise exception 'Already in this group' using errcode = 'P0001', hint = 'already_member';
  end if;
  -- An address must leave nothing behind that a later invite could read: a
  -- repeat finds the invite already there, changes nothing and answers with a
  -- made-up id, as an address with no account does. That costs a renewed push
  -- for an address invite; the invite itself stays in the invitee's list.
  if v_email then
    insert into public.group_invites(group_id, invitee_id, inviter_id, by_email)
    values (p_group_id, v_invitee, v_user, true)
    on conflict (group_id, invitee_id) do nothing
    returning id into v_id;
    return coalesce(v_id, gen_random_uuid());
  end if;
  -- A handle takes over an invite sent to an address, so a handle after an
  -- address looks exactly like the handle alone: its own id, on the sender's
  -- list, pushed. Otherwise a pending invite is renewed at most hourly, which
  -- also caps its pushes, and a renewal takes a new id.
  insert into public.group_invites(group_id, invitee_id, inviter_id, by_email)
  values (p_group_id, v_invitee, v_user, false)
  on conflict (group_id, invitee_id) do update
    set id = gen_random_uuid(), inviter_id = excluded.inviter_id, by_email = false,
      created_at = now(), pushed_at = null
    where public.group_invites.by_email or public.group_invites.created_at < now() - interval '1 hour'
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.group_invites i
    where i.group_id = p_group_id and i.invitee_id = v_invitee;
  end if;
  return v_id;
end;
$$;

-- 'joined', 'declined', or 'full' when the group filled before the answer;
-- the invite is withdrawn then rather than left to fail again.
create or replace function public.respond_to_group_invite(p_group_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false); v_count smallint;
begin
  if not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This invite is no longer available' using errcode = 'P0001', hint = 'invite_gone';
  end if;
  if not coalesce(p_accept, false) then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'declined';
  end if;
  if private.group_is_member(p_group_id, v_user) then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'joined';
  end if;
  select g.member_count into v_count from public.groups g where g.id = p_group_id for update;
  if v_count >= 20 then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'full';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user);
  return 'joined';
end;
$$;

-- Joining without an invite works only for public groups.
create or replace function public.join_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  if private.group_is_member(p_group_id, v_user) then return; end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.is_public)
     and not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This group is invite only' using errcode = '42501';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user);
end;
$$;

-- A leader with other members must name who takes over. The trigger on
-- group_members deletes the group when the last member goes.
create or replace function public.leave_group(p_group_id uuid, p_new_leader uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  perform 1 from public.groups g where g.id = p_group_id for update;
  if exists (select 1 from public.groups g where g.id = p_group_id and g.leader_id = v_user)
     and exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id <> v_user) then
    if p_new_leader is null or p_new_leader = v_user or not private.group_is_member(p_group_id, p_new_leader) then
      raise exception 'Choose a new leader' using errcode = 'P0001', hint = 'choose_leader';
    end if;
    update public.groups g set leader_id = p_new_leader where g.id = p_group_id;
  end if;
  delete from public.group_members m where m.group_id = p_group_id and m.user_id = v_user;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.leader_id = v_user) then
    raise exception 'Only the leader can remove members' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'Leave the group instead' using errcode = '22023';
  end if;
  delete from public.group_members m where m.group_id = p_group_id and m.user_id = p_user_id;
end;
$$;

-- An app from before `notify_updates` sends only `p_notify`, from a bell that
-- meant the whole group, so that one switch moves both.
create or replace function public.set_group_preferences(p_group_id uuid, p_board_order uuid[],
  p_notify boolean, p_notify_updates boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if p_board_order is not null and cardinality(p_board_order) > 20 then
    raise exception 'Too many members' using errcode = '22023';
  end if;
  update public.group_members m set
    board_order = coalesce(p_board_order, m.board_order),
    notify = coalesce(p_notify, m.notify),
    notify_updates = coalesce(p_notify_updates, p_notify, m.notify_updates)
  where m.group_id = p_group_id and m.user_id = v_user;
end;
$$;

-- Moves one of your own entries to another column, in every group at once.
-- Null puts it back where its time places it.
create or replace function public.set_entry_board_meal(p_entry_id uuid, p_meal public.group_meal)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  update public.food_logs f set board_meal = p_meal
  where f.id = p_entry_id and f.user_id = v_user;
  if not found then
    raise exception 'Entry unavailable' using errcode = '42501';
  end if;
end;
$$;

-- 1 likes, -1 dislikes, 0 clears. Only someone who shares a group with the
-- entry's owner may react, and never to their own food.
create or replace function public.set_group_reaction(p_entry_id uuid, p_value smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false); v_owner uuid;
begin
  if p_value is null or p_value not in (-1, 0, 1) then
    raise exception 'Unknown reaction' using errcode = '22023';
  end if;
  select f.user_id into v_owner from public.food_logs f where f.id = p_entry_id;
  if v_owner is null or v_owner = v_user or not private.group_share(v_user, v_owner) then
    raise exception 'Entry unavailable' using errcode = '42501';
  end if;
  if p_value = 0 then
    delete from public.group_reactions r where r.entry_id = p_entry_id and r.user_id = v_user;
    return;
  end if;
  if not private.social_claim(v_user, 'group_reaction', 600) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_reactions(entry_id, user_id, value) values (p_entry_id, v_user, p_value)
  on conflict (entry_id, user_id) do update set value = excluded.value;
end;
$$;

-- Whether a member can be nudged for a meal: it is overdue on their own today,
-- it is empty, and nobody in the group has nudged them for it within the hour.
-- group_board answers the same question for a whole board from its own CTEs.
create or replace function private.group_nudge_open(
  p_group uuid, p_target uuid, p_day date, p_meal public.group_meal
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_target;
  if not private.group_meal_due(now() at time zone coalesce(v_tz, 'Asia/Kuala_Lumpur'), p_day, p_meal,
    (select mt.at from public.meal_times mt where mt.user_id = p_target and mt.meal::text = p_meal::text)) then
    return false;
  end if;
  if exists (
    select 1 from public.food_logs f
    left join public.meal_times b on b.user_id = f.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = f.user_id and l.meal = 'lunch'
    left join public.meal_times d on d.user_id = f.user_id and d.meal = 'dinner'
    where f.user_id = p_target and f.log_date = p_day
      and private.group_entry_meal(f.logged_at, f.log_date, v_tz, f.board_meal, b.at, l.at, d.at) = p_meal
  ) then
    return false;
  end if;
  return not exists (
    select 1 from public.group_nudges n
    where n.group_id = p_group and n.target_id = p_target and n.day = p_day and n.meal = p_meal
      and n.created_at > now() - interval '1 hour'
  );
end;
$$;
revoke execute on function private.group_nudge_open from public, anon, authenticated;

create or replace function public.nudge_group_member(
  p_group_id uuid, p_target_id uuid, p_day date, p_meal public.group_meal
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.group_require_member(p_group_id); v_id uuid;
begin
  if p_target_id = v_user or not private.group_is_member(p_group_id, p_target_id)
     or private.social_pair_blocked(p_target_id) then
    raise exception 'Member unavailable' using errcode = '42501';
  end if;
  -- Serialise nudges at one person's meal, so two friends tapping together
  -- send one.
  perform pg_advisory_xact_lock(hashtextextended(
    'group-nudge:' || p_group_id::text || p_target_id::text || p_day::text || p_meal::text, 0));
  if not private.group_nudge_open(p_group_id, p_target_id, p_day, p_meal) then
    raise exception 'Nudged recently' using errcode = 'P0001', hint = 'nudge_closed';
  end if;
  if not private.social_claim(v_user, 'group_nudge', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  delete from public.group_nudges n where n.group_id = p_group_id and n.created_at < now() - interval '2 days';
  insert into public.group_nudges(group_id, target_id, nudger_id, day, meal)
  values (p_group_id, p_target_id, v_user, p_day, p_meal) returning id into v_id;
  return v_id;
end;
$$;

-- A message in the group's one thread. It may answer another message in the
-- thread (`p_reply_to`, dropped if that one has gone), and may share one thing
-- of the author's own: a food post (`p_post_id`), a workout from the app's
-- logger (`p_workout_id`) or one a health store recorded (`p_activity_id`).
-- Sharing, the body is optional and defaults to the thing's name and its
-- calories or minutes: that is what a push says and what an app from before
-- cards draws. All of these come after the first three, with defaults, so the
-- three-argument call of release 1.0 still lands.
create or replace function public.send_group_message(p_group_id uuid, p_body text, p_request_id uuid,
  p_reply_to uuid default null, p_post_id uuid default null,
  p_workout_id uuid default null, p_activity_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.group_require_member(p_group_id); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if p_request_id is null then
    raise exception 'Request id required' using errcode = '22023';
  end if;
  select m.id into v_id from public.group_messages m where m.author_id = v_user and m.request_id = p_request_id;
  if v_id is not null then return v_id; end if;
  if num_nonnulls(p_post_id, p_workout_id, p_activity_id) > 1 then
    raise exception 'Share one thing at a time' using errcode = '22023';
  end if;
  if p_post_id is not null then
    if not exists (select 1 from public.social_posts p where p.id = p_post_id and p.author_id = v_user
                     and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined) then
      raise exception 'Food unavailable' using errcode = '42501', hint = 'food_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_food_label(p_post_id), ''); end if;
  elsif p_workout_id is not null then
    if not exists (select 1 from public.workouts w where w.id = p_workout_id and w.user_id = v_user) then
      raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_workout_label(private.group_workout(p_workout_id)), ''); end if;
  elsif p_activity_id is not null then
    if not exists (select 1 from public.activity_sessions a where a.id = p_activity_id and a.user_id = v_user) then
      raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_workout_label(private.group_activity(p_activity_id)), ''); end if;
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Messages are 1 to 500 characters' using errcode = '22023';
  end if;
  -- A message answered while it was deleted or hidden is sent on its own
  -- rather than refused: the sender's retry would carry the same reply and
  -- fail for ever. One from another group is dropped the same way.
  if p_reply_to is not null and not exists (
    select 1 from public.group_messages r where r.id = p_reply_to and r.group_id = p_group_id and not r.quarantined
  ) then
    p_reply_to := null;
  end if;
  if not private.social_claim(v_user, 'group_message', 120) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_messages(group_id, author_id, body, request_id, reply_to_id, post_id, workout_id, activity_id)
  values (p_group_id, v_user, v_body, p_request_id, p_reply_to, p_post_id, p_workout_id, p_activity_id)
  returning id into v_id;
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = v_user;
  return v_id;
end;
$$;

-- Sets the caller's one reaction to a message, or takes it back with null. Any
-- message the caller can read, their own included.
create or replace function public.set_group_message_reaction(p_message_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false); v_group uuid; v_author uuid;
begin
  select m.group_id, m.author_id into v_group, v_author from public.group_messages m
  where m.id = p_message_id and not m.quarantined;
  if v_group is null or not private.group_is_member(v_group, v_user)
     or (v_author <> v_user and private.social_pair_blocked(v_author))
     or exists (select 1 from public.group_message_reports r where r.message_id = p_message_id and r.reporter_id = v_user) then
    raise exception 'Message unavailable' using errcode = '42501';
  end if;
  if p_emoji is null then
    delete from public.group_message_reactions r where r.message_id = p_message_id and r.user_id = v_user;
    return;
  end if;
  if not private.social_claim(v_user, 'group_reaction', 300) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_message_reactions(message_id, user_id, emoji) values (p_message_id, v_user, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()
  where public.group_message_reactions.emoji <> excluded.emoji;
end;
$$;

create or replace function public.delete_group_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_messages m where m.id = p_message_id and m.author_id = (select auth.uid());
end;
$$;

-- The message disappears for the reporter at once, and for everyone at three
-- reports. The reason is optional because an older app sends none.
create or replace function public.report_group_message(p_message_id uuid,
  p_reason public.report_reason default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false); v_group uuid;
begin
  select m.group_id into v_group from public.group_messages m
  where m.id = p_message_id and m.author_id <> v_user;
  if v_group is null or not private.group_is_member(v_group, v_user) then
    raise exception 'Message unavailable' using errcode = '42501';
  end if;
  if not private.social_claim(v_user, 'report', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_message_reports(message_id, reporter_id, reason)
  values (p_message_id, v_user, p_reason)
  on conflict do nothing;
  update public.group_messages m set quarantined = true
  where m.id = p_message_id
    and (select count(*) from public.group_message_reports r where r.message_id = p_message_id) >= 3;
end;
$$;

-- A group's name is written by its leader and read by strangers in the public
-- list, so it can be reported like anything else one person writes for others.
-- It leaves the reporter's list at once and everyone's at three reports.
create or replace function public.report_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and (g.is_public
       or private.group_is_member(p_group_id, v_user)
       or exists (select 1 from public.group_invites i where i.group_id = g.id and i.invitee_id = v_user))) then
    raise exception 'Group unavailable' using errcode = '42501';
  end if;
  if not private.social_claim(v_user, 'report', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_reports(group_id, reporter_id) values (p_group_id, v_user)
  on conflict do nothing;
  update public.groups g set quarantined = true
  where g.id = p_group_id
    and (select count(*) from public.group_reports r where r.group_id = p_group_id) >= 3;
end;
$$;

create or replace function public.mark_group_chat_read(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = (select auth.uid());
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$'
     or p_platform not in ('ios', 'android') then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'push_token', 20) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.push_tokens(token, user_id, platform) values (p_token, v_user, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- Ten phones is plenty; a reinstall mints a new token and the old one lingers
  -- until a push finds it gone, so the oldest go first.
  delete from public.push_tokens t where t.user_id = v_user and t.token not in (
    select k.token from public.push_tokens k where k.user_id = v_user order by k.updated_at desc limit 10);
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens t where t.token = p_token and t.user_id = (select auth.uid());
$$;

-- What the groups function sends for a nudge or an invite the caller just made:
-- one row per device of the recipient, in the recipient's language. Each source
-- row pushes once, and only within ten minutes of being made.
create or replace function public.group_push_targets(p_caller uuid, p_kind text, p_id uuid)
returns table (token text, language text, actor_name text, group_name text, group_id uuid,
  day date, meal public.group_meal)
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid; v_group uuid; v_day date; v_meal public.group_meal;
begin
  if p_kind = 'nudge' then
    update public.group_nudges n set pushed_at = now()
    where n.id = p_id and n.nudger_id = p_caller and n.pushed_at is null
      and n.created_at > now() - interval '10 minutes'
    returning n.target_id, n.group_id, n.day, n.meal into v_recipient, v_group, v_day, v_meal;
  elsif p_kind = 'invite' then
    update public.group_invites i set pushed_at = now()
    where i.id = p_id and i.inviter_id = p_caller and i.pushed_at is null
      and i.created_at > now() - interval '10 minutes'
    returning i.invitee_id, i.group_id into v_recipient, v_group;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  if v_recipient is null then return; end if;
  -- A block made since the nudge or invite still silences it.
  if exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_caller and x.author_id = v_recipient)
       or (x.user_id = v_recipient and x.author_id = p_caller)
  ) then
    return;
  end if;
  -- A member who muted the group hears no nudges from it. Invites always
  -- arrive, since the invitee is not a member yet.
  if p_kind = 'nudge' and not exists (
    select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_recipient and m.notify
  ) then
    return;
  end if;
  return query
    select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
      g.name, g.id, v_day, v_meal
    from public.push_tokens t
    join public.groups g on g.id = v_group
    join public.profiles a on a.id = p_caller
    left join public.user_settings s on s.user_id = v_recipient
    where t.user_id = v_recipient;
end;
$$;

-- What the groups function sends for a chat message the caller just wrote: one
-- row per device of every other member who has the group's notifications on
-- and is not blocked either way. Each message pushes once, within ten minutes
-- of being sent, and never once three reports have quarantined it. The body
-- goes in the push itself, so this is where blocks are applied to it.
--
-- A member who has read the chat since the message was written already saw it
-- in an open thread, which marks the chat read as messages arrive, so they are
-- left out the way any messenger leaves out someone who is looking. The groups
-- function asks a few seconds after the send to give that read time to land.
create or replace function public.group_message_push_targets(p_caller uuid, p_id uuid)
returns table (token text, language text, actor_name text, group_name text, group_id uuid, body text)
language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_body text; v_sent_at timestamptz;
begin
  update public.group_messages m set pushed_at = now()
  where m.id = p_id and m.author_id = p_caller and m.pushed_at is null and not m.quarantined
    and not m.automatic and m.created_at > now() - interval '10 minutes'
  returning m.group_id, m.body, m.created_at into v_group, v_body, v_sent_at;
  if v_group is null then return; end if;
  return query
    select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
      g.name, g.id, v_body
    from public.group_members m
    join public.push_tokens t on t.user_id = m.user_id
    join public.groups g on g.id = m.group_id
    join public.profiles a on a.id = p_caller
    left join public.user_settings s on s.user_id = m.user_id
    where m.group_id = v_group and m.user_id <> p_caller and m.notify
      and m.chat_read_at < v_sent_at
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = p_caller and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = p_caller)
      );
end;
$$;

-- The same for the foods and workouts the caller's own logging just shared to
-- their groups. The app cannot know which writes shared something (a trigger
-- does it), so it asks after any of them and this claims every share of the
-- caller's from the last ten minutes that has not pushed yet. Members hear it
-- through `notify_updates`, with the same read and block rules as a message.
create or replace function public.group_update_push_targets(p_caller uuid)
returns table (token text, language text, actor_name text, group_name text, group_id uuid, body text)
language sql security definer set search_path = '' as $$
  with shared as (
    update public.group_messages m set pushed_at = now()
    where m.author_id = p_caller and m.automatic and m.pushed_at is null and not m.quarantined
      and m.created_at > now() - interval '10 minutes'
    returning m.group_id, m.body, m.created_at
  )
  select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
    g.name, g.id, c.body
  from shared c
  join public.group_members m on m.group_id = c.group_id and m.user_id <> p_caller
    and m.notify_updates and m.chat_read_at < c.created_at
  join public.push_tokens t on t.user_id = m.user_id
  join public.groups g on g.id = c.group_id
  join public.profiles a on a.id = p_caller
  left join public.user_settings s on s.user_id = m.user_id
  where not exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_caller and x.author_id = m.user_id)
       or (x.user_id = m.user_id and x.author_id = p_caller)
  );
$$;

create or replace function public.forget_push_tokens(p_tokens text[])
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens t where t.token = any(p_tokens);
$$;

revoke execute on function public.free_group_limit, public.free_group_icons from public, anon;
grant execute on function public.free_group_limit, public.free_group_icons to authenticated, service_role;
revoke execute on function private.group_check_icon from public, anon, authenticated;
revoke execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.report_group, public.mark_group_chat_read,
  public.set_group_message_reaction,
  public.register_push_token, public.unregister_push_token from public, anon;
grant execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.report_group, public.mark_group_chat_read,
  public.set_group_message_reaction,
  public.register_push_token, public.unregister_push_token to authenticated, service_role;
revoke execute on function public.group_push_targets, public.group_message_push_targets,
  public.group_update_push_targets, public.forget_push_tokens from public, anon, authenticated;
grant execute on function public.group_push_targets, public.group_message_push_targets,
  public.group_update_push_targets, public.forget_push_tokens to service_role;

-- ---------------------------------------------------------------------------
-- Live chat
--
-- An open chat or board listens on the group's private Realtime channel,
-- `group-chat:<group>`, instead of asking every few seconds. What goes down it is message ids and
-- nothing else. The phone refetches through group_messages, which is where
-- blocks, reports and quarantine are applied, so a broadcast never hands a body
-- to someone who must not read it, and a member removed mid-chat hears ids it
-- can no longer turn into anything.
--
-- Broadcast rather than Postgres Changes: changes would need group_messages
-- opened to clients through RLS and would check that policy once per listener
-- for every row. A broadcast is checked once, when the channel is joined.
-- ---------------------------------------------------------------------------

-- Whether the caller may listen on a Realtime topic. Only the chat topic of a
-- group they are in passes; anything malformed is refused rather than cast.
create or replace function private.group_chat_listener(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := string_to_array(p_topic, ':');
begin
  if cardinality(v_parts) <> 2 or v_parts[1] <> 'group-chat'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.group_is_member(v_parts[2]::uuid, (select auth.uid()));
end;
$$;

-- Listening only. With no insert policy a client cannot broadcast on the topic
-- itself, so every message on it came from the triggers below.
create policy "Group members hear their chat" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.group_chat_listener((select realtime.topic()))
  );

-- Announces message ids on the group's topic, heard by an open chat and an
-- open board's chat bar. realtime.send swallows its own errors as a warning,
-- so a Realtime outage cannot refuse the write that called it; the open chat
-- and board fall back to polling when their channel drops.
create or replace function private.group_chat_broadcast(p_group uuid, p_event text, p_ids jsonb)
returns void language sql security definer set search_path = '' as $$
  select realtime.send(jsonb_build_object('ids', p_ids), p_event, 'group-chat:' || p_group::text, true);
$$;

create or replace function private.group_message_sent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.group_chat_broadcast(new.group_id, 'message', jsonb_build_array(new.id));
  return null;
end;
$$;
create trigger group_message_sent after insert on public.group_messages
  for each row execute function private.group_message_sent();

-- Deleted by its author, or cascaded away with a group or an account. Once per
-- statement and per group, so deleting an account with months of messages
-- sends a handful of broadcasts rather than one per row.
create or replace function private.group_messages_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.group_chat_broadcast(g.group_id, 'removed', jsonb_agg(g.id))
  from gone g group by g.group_id;
  return null;
end;
$$;
create trigger group_messages_removed after delete on public.group_messages
  referencing old table as gone
  for each statement execute function private.group_messages_removed();

-- The third report hides a message from everyone, so it leaves open chats too.
create or replace function private.group_message_quarantined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.group_chat_broadcast(new.group_id, 'removed', jsonb_build_array(new.id));
  return null;
end;
$$;
create trigger group_message_quarantined after update of quarantined on public.group_messages
  for each row when (new.quarantined and not old.quarantined)
  execute function private.group_message_quarantined();

-- A reaction set, changed or taken back. Its own event, which a chat from
-- before reactions does not listen for, so that app does not refetch for it.
-- Once per statement and group, so an account's deletion is a few broadcasts.
create or replace function private.group_reactions_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.group_chat_broadcast(m.group_id, 'reacted', jsonb_agg(distinct m.id))
  from changed c join public.group_messages m on m.id = c.message_id group by m.group_id;
  return null;
end;
$$;
create trigger group_reactions_added after insert on public.group_message_reactions
  referencing new table as changed
  for each statement execute function private.group_reactions_changed();
create trigger group_reactions_updated after update on public.group_message_reactions
  referencing new table as changed
  for each statement execute function private.group_reactions_changed();
create trigger group_reactions_removed after delete on public.group_message_reactions
  referencing old table as changed
  for each statement execute function private.group_reactions_changed();

revoke execute on function private.group_chat_broadcast, private.group_message_sent,
  private.group_messages_removed, private.group_message_quarantined,
  private.group_reactions_changed from public, anon, authenticated;
revoke execute on function private.group_chat_listener from public, anon;
grant execute on function private.group_chat_listener to authenticated, service_role;
