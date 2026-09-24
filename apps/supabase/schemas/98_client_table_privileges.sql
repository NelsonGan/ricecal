-- Supabase's default table grants include operations that bypass or change
-- row security. Clients use row-level DML; only backend roles need these.
revoke truncate, references, trigger, maintain on all tables in schema public
  from public, anon, authenticated;
