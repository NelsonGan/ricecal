-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE OR REPLACE TRIGGER recipes_reset_review
  BEFORE UPDATE OF name, steps, servings, photo_path ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_reset_review();