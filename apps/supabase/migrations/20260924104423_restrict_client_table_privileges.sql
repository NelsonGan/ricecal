-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_days FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_days FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_hours FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_hours FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_sessions FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.activity_sessions FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_misses FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_misses FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_scan_usage FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_scan_usage FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.blocked_authors FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.blocked_authors FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_goals FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_goals FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_logs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_logs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredients FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredients FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_logs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_logs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_items FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_items FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_misses FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_misses FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.health_connections FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.health_connections FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.job_runs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.job_runs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.meal_times FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.meal_times FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredients FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredients FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_reports FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_reports FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_review_usage FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_review_usage FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_saves FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_saves FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipes FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipes FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.scan_usage FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.scan_usage FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_settings FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_settings FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.weight_logs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.weight_logs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredient_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_ingredient_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredient_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredient_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats FROM authenticated;