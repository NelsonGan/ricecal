-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.invite_to_group (
  p_group_id uuid,
  p_target   text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
  if v_count >= 10 then
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
$function$;