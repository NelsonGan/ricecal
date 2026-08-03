-- A meal described in words is a third way to log one, alongside the catalogue
-- search and the camera. It runs the same recognition cascade the photo does
-- and writes the same row shape, so the source column is the only trace of how
-- it was logged.
--
-- Its own migration because `alter type ... add value` cannot be followed, in
-- the same transaction, by anything that uses the value it added.

alter type public.entry_source add value if not exists 'text';
