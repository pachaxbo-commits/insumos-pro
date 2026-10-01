begin;

create or replace function public.preview_qb_test_data_reset(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Vista previa no autorizada.';
  end if;
  if p_mode not in ('receipts', 'orders') then
    raise exception 'Selección inválida.';
  end if;
  return jsonb_build_object(
    'mode', p_mode,
    'receipts', (select count(*) from public.qb_receipts),
    'orders', case when p_mode = 'orders' then (select count(*) from public.qb_orders) else 0 end,
    'preparations', case when p_mode = 'orders' then (select count(*) from public.qb_order_preparations) else 0 end,
    'deliveries', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements) else 0 end,
    'delivery_stock_movements', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements where inventory_movement_id is not null) else 0 end,
    'customers_preserved', (select count(*) from public.customer_accounts),
    'products_preserved', (select count(*) from public.products),
    'profiles_preserved', (select count(*) from public.profiles)
  );
end;
$$;

create or replace function public.execute_qb_test_data_reset(
  p_actor uuid,
  p_mode text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_preview jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Limpieza no autorizada.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.is_active = true and p.role = 'administrador'
  ) then
    raise exception 'Se requiere un administrador activo.';
  end if;
  if p_confirmation is distinct from 'BORRAR DATOS' then
    raise exception 'Confirmación inválida.';
  end if;
  if p_mode not in ('receipts', 'orders') then
    raise exception 'Selección inválida.';
  end if;

  lock table public.qb_orders in share row exclusive mode;
  lock table public.qb_receipts in share row exclusive mode;
  lock table public.products in row exclusive mode;
  v_preview := public.preview_qb_test_data_reset(p_mode);

  if p_mode = 'receipts' then
    update public.qb_orders o
       set status = 'entregado_pendiente_recibo'
     where o.status in ('incluido_en_recibo_borrador', 'recibo_emitido')
       and exists (select 1 from public.qb_receipt_orders ro where ro.order_id = o.id);
    delete from public.qb_receipts where true;
    v_result := jsonb_build_object('mode', p_mode, 'deleted_receipts', v_preview->'receipts');
  else
    if to_regclass('public.inventory_lot_consumptions') is not null then
      update public.inventory_lots lot
         set remaining_quantity = lot.remaining_quantity + consumed.quantity
        from (
          select c.lot_id, sum(c.quantity_consumed) as quantity
            from public.inventory_lot_consumptions c
           where c.lot_id is not null
           group by c.lot_id
        ) consumed
       where lot.id = consumed.lot_id;
      delete from public.inventory_lot_consumptions where true;
      delete from public.inventory_fifo_consumption_runs where true;
    end if;
    v_result := public.reset_qb_order_test_data('BORRAR_TODOS_LOS_PEDIDOS');
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'reset_order_test_data', 'qb_order_test_data', null,
          jsonb_build_object('selection', p_mode, 'preview', v_preview, 'result', v_result));
  return jsonb_build_object('preview', v_preview, 'result', v_result);
end;
$$;

revoke all on function public.preview_qb_test_data_reset(text) from public, anon, authenticated;
revoke all on function public.execute_qb_test_data_reset(uuid,text,text) from public, anon, authenticated;
grant execute on function public.preview_qb_test_data_reset(text) to service_role;
grant execute on function public.execute_qb_test_data_reset(uuid,text,text) to service_role;

commit;
