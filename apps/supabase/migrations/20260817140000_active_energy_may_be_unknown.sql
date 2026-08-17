-- Active energy is nullable, because a health store can have no opinion on it.
--
-- The column was `not null default 0` on the reasoning that every provider
-- reports active energy. That is true of HealthKit and false of Health Connect,
-- which reports whatever its writers wrote — and Samsung Health writes the day's
-- TOTAL energy and never the active half. The aggregate then answers zero for a
-- record type nobody on the phone writes, indistinguishable from a real zero.
--
-- What that cost, measured on a real account: seven days of `active_kcal = 0`
-- beside 60,000 steps and a two-hour badminton session, so movement extended the
-- budget by nothing; and because resting was derived as total minus active, the
-- whole day's burn landed in `resting_kcal`, which nothing adds to a budget.
--
-- Nothing has to change downstream. `activity_days_range` and `review_days`
-- already coalesce this column, because a LEFT JOIN over a calendar has always
-- been able to produce a null here for a day with no row at all — `has_data` is
-- how those functions say "nothing was recorded", and it still is.
alter table public.activity_days
  alter column active_kcal drop not null,
  alter column active_kcal drop default;
