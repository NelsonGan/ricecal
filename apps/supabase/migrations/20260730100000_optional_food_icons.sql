-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default
--
-- Makes the food illustration optional.
--
-- `icon_name not null` forced every imported row to name a drawing that does not
-- exist for it. The catalogue is hundreds of megabytes of imported foods against
-- a few dozen illustrations, so what the app showed was one stand-in plate beside
-- a thousand different dishes — which reads as data and is not.
--
-- Nothing is backfilled and nothing is cleared. Rows already carrying a real
-- drawing keep it, which is the point: the curated local dishes stay
-- illustrated, and imports can now say nothing instead of guessing.
--
-- The check keeps the pair whole. A set with no name renders blank and a name
-- with no set cannot be resolved at all, so half an icon is never valid.

ALTER TABLE public.foods
  ALTER COLUMN icon_set DROP NOT NULL,
  ALTER COLUMN icon_set DROP DEFAULT,
  ALTER COLUMN icon_name DROP NOT NULL;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));
