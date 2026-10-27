-- ---------------------------------------------------------------------------
-- What a member eats and does goes to their group chats on its own, as a card.
--
-- - A food posted to the feed is shared into each of its author's groups.
-- - A workout from the app's logger, and one a health store records (a run, a
--   swim, a game of badminton), is shared the same way.
--
-- Nobody is pushed for any of it: the row is written with `pushed_at` already
-- set, which is what group_message_push_targets refuses, and the app sends no
-- push request for a message it did not write. It still counts as unread, like
-- any message. The request id is derived from the thing and the group, so a
-- replay of the same insert cannot share it twice.
--
-- Food rides on the feed post, since both ways a food post is made (Share to
-- feed and Auto post foods) insert an approved row. Workouts do not, so they
-- reach a group whether or not their owner uses the feed; they follow the same
-- switch as workout posts (`auto_post_workouts`, on unless turned off) and the
-- same freshness rule: only one that ended in the last day. A health sync
-- backfilling months of runs shares none of them, and neither does demo data.
-- ---------------------------------------------------------------------------

create or replace function private.group_share_posted_food()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_body text;
begin
  begin
    v_body := private.group_food_label(new.id);
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, post_id, pushed_at)
    select m.group_id, new.author_id, v_body,
      md5(new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
    from public.group_members m
    where m.user_id = new.author_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger group_share_posted_food after insert on public.social_posts
  for each row when (new.kind = 'food' and new.review_status = 'approved' and not new.quarantined)
  execute function private.group_share_posted_food();

-- A workout saved from the logger. The insert is the first save (`save_workout`
-- upserts, and an edit is an update), before its sets are written; the label
-- needs only the name and the length, and the card reads the sets live.
create or replace function private.group_share_workout()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_body text;
begin
  begin
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.auto_post_workouts) then
      return null;
    end if;
    v_body := private.group_workout_label(private.group_workout(new.id));
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, workout_id, pushed_at)
    select m.group_id, new.user_id, v_body,
      md5('workout:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
    from public.group_members m
    where m.user_id = new.user_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger group_share_workout after insert on public.workouts
  for each row when (new.ended_at > now() - interval '1 day')
  execute function private.group_share_workout();

-- A workout a health store recorded, as a sync first writes it. An upsert that
-- finds the row already there is an update and shares nothing again. One that
-- is the copy of a logger workout saved to Apple Health is left out, since the
-- logger's own was shared already. (A copy that syncs before the logger saves
-- its workout at all can still be shared once; the logger's own card follows.)
create or replace function private.group_share_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_body text;
begin
  begin
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.auto_post_workouts) then
      return null;
    end if;
    -- The Health copy of a logger workout: by the id the logger kept, or, for
    -- one a watch recorded before the logger heard its id, by starting and
    -- ending within a few minutes of it.
    if exists (select 1 from public.workouts w
               where w.user_id = new.user_id
                 and (w.health_workout_id = new.external_id
                   or (w.started_at between new.started_at - interval '5 minutes' and new.started_at + interval '5 minutes'
                       and w.ended_at between new.ended_at - interval '5 minutes' and new.ended_at + interval '5 minutes'))) then
      return null;
    end if;
    v_body := private.group_workout_label(private.group_activity(new.id));
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, activity_id, pushed_at)
    select m.group_id, new.user_id, v_body,
      md5('activity:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
    from public.group_members m
    where m.user_id = new.user_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger group_share_activity after insert on public.activity_sessions
  for each row when (new.ended_at > now() - interval '1 day' and new.provider <> 'demo')
  execute function private.group_share_activity();

revoke execute on function private.group_share_posted_food, private.group_share_workout,
  private.group_share_activity from public, anon, authenticated;
