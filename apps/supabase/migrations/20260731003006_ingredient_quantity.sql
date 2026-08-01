-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.set_ingredient_quantity (
  p_ingredient_id uuid,
  p_quantity      numeric
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_log_id  uuid;
  v_user_id uuid;
  v_sum     numeric;
  v_base    numeric;
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;
  if p_quantity is null or p_quantity < 0.25 or p_quantity > 20 then
    raise exception 'quantity out of range';
  end if;

  update public.food_log_ingredients
  set quantity = p_quantity
  where id = p_ingredient_id;

  select sum(f.kcal * s.factor * i.quantity) into v_sum
  from public.food_log_ingredients i
  join public.foods f         on f.id = i.food_id
  join public.food_servings s on s.id = i.serving_id
  where i.food_log_id = v_log_id;

  select f.kcal * s.factor into v_base
  from public.food_logs e
  join public.foods f         on f.id = e.food_id
  join public.food_servings s on s.id = e.serving_id
  where e.id = v_log_id;

  if coalesce(v_base, 0) > 0 and coalesce(v_sum, 0) > 0 then
    update public.food_logs
    set quantity = greatest(0.01, least(100, round(v_sum / v_base, 2)))
    where id = v_log_id;
  end if;
end;
$function$;

COMMENT ON FUNCTION public.set_ingredient_quantity(uuid,numeric) IS 'Set one scanned ingredient''s portion and recompute the parent entry''s quantity so the diary total equals the sum of parts. Owner-checked.';

GRANT ALL ON FUNCTION public.set_ingredient_quantity(uuid, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.set_ingredient_quantity(uuid, numeric) TO service_role;