-- The eval table wants the typed sentence itself. Unlike a photographed meal
-- there is nothing to go back and look at: the model's queries on this row are
-- its reading of a sentence that exists nowhere else.

alter table public.food_scan_items
  add column if not exists described_text text
    check (char_length(described_text) <= 500);
