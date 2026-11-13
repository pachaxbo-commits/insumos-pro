begin;

create or replace function public.save_qb_matrix_preparation_with_check_reset(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
  p_actual_weight_value numeric,
  p_actual_weight_unit_id uuid,
  p_actual_weight_factor_to_kg numeric,
  p_clear_actual_weight boolean,
  p_display_unit_id text,
  p_note text,
  p_pending_base_quantity numeric,
  p_external_base_quantity numeric,
  p_review_base_quantity numeric,
  p_origin_plan_confirmed boolean,
  p_auto_fill_quantity boolean,
  p_reset_auto_fill_quantity boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_order_item public.qb_order_items%rowtype;
  v_before public.qb_order_preparation_items%rowtype;
  v_after public.qb_order_preparation_items%rowtype;
  v_result jsonb;
  v_quantity numeric(18,6) := p_prepared_quantity;
begin
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','inventario','supervisor') then
    raise exception 'No tienes permisos para preparar pedidos.';
  end if;
  if p_auto_fill_quantity and p_reset_auto_fill_quantity then
    raise exception 'La solicitud no puede marcar y restablecer el autocompletado a la vez.';
  end if;

  select * into v_order_item from public.qb_order_items
    where id=p_order_item_id for update;
  if v_order_item.id is null then raise exception 'Línea de pedido no encontrada.'; end if;
  select * into v_before from public.qb_order_preparation_items
    where order_item_id=p_order_item_id for update;

  if v_before.id is not null
    and v_before.last_idempotency_key is distinct from p_idempotency_key
    and v_before.row_version <> p_expected_version then
    raise exception 'QB_MATRIX_CONFLICT: la preparacion cambio en otro dispositivo.'
      using errcode = '40001';
  end if;

  if v_before.last_idempotency_key is distinct from p_idempotency_key and p_auto_fill_quantity then
    if not p_preparation_check or (p_prepared_quantity is null or p_prepared_quantity <= 0
      or p_prepared_quantity > v_order_item.requested_quantity)
      or coalesce(v_before.actual_quantity,0) > 0.000001
      or coalesce(v_before.preparation_check,false) then
      raise exception 'El autocompletado ya no coincide con el estado de la línea. Recarga la matriz.';
    end if;
  elsif v_before.last_idempotency_key is distinct from p_idempotency_key
    and p_reset_auto_fill_quantity and v_before.auto_completed_before_quantity is not null then
    if p_preparation_check then
      raise exception 'Para restablecer la cantidad autocompletada, primero desmarca la verificación.';
    end if;
    v_quantity := v_before.auto_completed_before_quantity;
  end if;

  v_result := public.save_qb_matrix_preparation_origin_with_weight_snapshot(
    p_order_item_id,p_expected_version,v_quantity,p_preparation_check,
    p_actual_weight_value,p_actual_weight_unit_id,p_actual_weight_factor_to_kg,
    p_clear_actual_weight,p_display_unit_id,p_note,p_pending_base_quantity,
    p_external_base_quantity,p_review_base_quantity,p_origin_plan_confirmed,p_idempotency_key
  );

  if coalesce((v_result->>'replayed')::boolean,false) then
    select * into v_after from public.qb_order_preparation_items where order_item_id=p_order_item_id;
    return v_result || jsonb_build_object('auto_completed_before_quantity',v_after.auto_completed_before_quantity);
  end if;

  select * into v_after from public.qb_order_preparation_items
    where order_item_id=p_order_item_id for update;
  if p_auto_fill_quantity and v_before.last_idempotency_key is distinct from p_idempotency_key then
    update public.qb_order_preparation_items
      set auto_completed_before_quantity=coalesce(v_before.actual_quantity,0)
      where id=v_after.id;
  elsif p_reset_auto_fill_quantity then
    update public.qb_order_preparation_items set auto_completed_before_quantity=null where id=v_after.id;
  elsif v_before.auto_completed_before_quantity is not null
    and v_before.actual_quantity is distinct from v_quantity then
    -- A manually edited quantity takes ownership and must never be removed by
    -- a later checkbox toggle.
    update public.qb_order_preparation_items set auto_completed_before_quantity=null where id=v_after.id;
  end if;
  select * into v_after from public.qb_order_preparation_items where id=v_after.id;
  return v_result || jsonb_build_object('auto_completed_before_quantity',v_after.auto_completed_before_quantity);
end;
$$;

commit;
