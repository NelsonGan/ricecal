-- Hand-written: db diff does not compare policies on realtime.messages.
-- The declarations below are copied from schemas/51_groups.sql.

-- Presence is the only client write allowed here. Message broadcasts stay server-only.
create policy "Group members see who is online" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and private.group_chat_listener((select realtime.topic()))
  );

create policy "Group members share their presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and private.group_chat_listener((select realtime.topic()))
  );
