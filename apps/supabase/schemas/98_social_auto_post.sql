-- This is opt-in and defaults off for every existing and new account.
alter table public.profiles
  add column auto_post_foods boolean not null default false;

grant update (auto_post_foods) on public.profiles to authenticated;

-- A deferred trigger sees the finished meal, including components inserted
-- later in the same transaction by a scan. One source entry can make one post.
create or replace function private.social_auto_post_food()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_private boolean;
  v_entry public.food_logs;
  v_totals record;
begin
  -- Lock the profile before the rate row, as manual sharing does.
  select p.is_private into v_private
  from public.profiles p
  where p.id = new.user_id and p.auto_post_foods and not p.quarantined
  for update;
  if not found then return null; end if;
  select * into v_entry from public.food_logs f where f.id = new.id;
  if not found then return null; end if;
  if exists (select 1 from public.social_posts p where p.source_entry_id = new.id) then
    return null;
  end if;
  -- Apply the same posting budget as Share without failing the diary write.
  if not private.social_claim(new.user_id, 'post', 30) then return null; end if;
  update public.profiles set social_joined_at = coalesce(social_joined_at, now()),
    review_status = 'approved', review_reason = null
  where id = new.user_id and (social_joined_at is null or review_status = 'pending');

  select d.kcal, d.carbs_g, d.protein_g, d.fat_g into v_totals
  from public.food_log_details d where d.id = new.id;
  if not found then return null; end if;

  insert into public.social_posts (
    author_id, source_entry_id, food_name, icon_set, icon_name, photo_path,
    kcal, carbs_g, protein_g, fat_g, caption, audience, review_status, published_at
  ) values (
    new.user_id, new.id, left(coalesce(v_entry.display_label, v_entry.item_name), 160),
    coalesce(v_entry.icon_set, v_entry.item_icon_set), coalesce(v_entry.icon_name, v_entry.item_icon_name),
    case when v_entry.photo_path like 'meals/' || new.user_id::text || '/%' then v_entry.photo_path end,
    v_totals.kcal, v_totals.carbs_g, v_totals.protein_g, v_totals.fat_g,
    '', case when v_private then 'followers'::public.social_audience
             else 'public'::public.social_audience end,
    'approved', now()
  ) on conflict (source_entry_id) do nothing;
  return null;
end;
$$;

create constraint trigger social_auto_post_food
  after insert on public.food_logs deferrable initially deferred
  for each row execute function private.social_auto_post_food();

revoke execute on function private.social_auto_post_food from public, anon, authenticated;
