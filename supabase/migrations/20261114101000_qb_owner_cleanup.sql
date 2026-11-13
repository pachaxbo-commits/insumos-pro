begin;

create or replace function public.preview_qb_owner_cleanup(p_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'Acceso denegado.' using errcode='42501';
  end if;
  if p_mode is null or p_mode not in ('receipts','orders','stock','orders_stock') then raise exception 'Alcance inválido.'; end if;
  return jsonb_build_object(
    'receipts',(select count(*) from public.qb_receipts),
    'receipt_options',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',receipt_number,'status',status) order by created_at desc),'[]') from public.qb_receipts),
    'orders',case when p_mode in ('orders','orders_stock') then (select count(*) from public.qb_orders)+(select count(*) from public.orders) else 0 end,
    'preparations',case when p_mode in ('orders','orders_stock') then (select count(*) from public.qb_order_preparations) else 0 end,
    'deliveries',case when p_mode in ('orders','orders_stock') then (select count(*) from public.qb_order_delivery_confirmations) else 0 end,
    'delivery_stock_movements',case when p_mode in ('orders','orders_stock','stock') then (
      select count(*) from (
        select inventory_movement_id from public.qb_order_delivery_movements where inventory_movement_id is not null
        union select inventory_movement_id from public.qb_same_day_reconciliation_allocations
      ) m) else 0 end,
    'products_preserved',(select count(*) from public.products),
    'products_stock_zeroed',case when p_mode in ('stock','orders_stock') then (select count(*) from public.products where coalesce(stock_current,0)<>0) else 0 end,
    'inventory_movements',case when p_mode in ('stock','orders_stock') then (select count(*) from public.inventory_movements) else 0 end,
    'merchandise_receipts',case when p_mode in ('stock','orders_stock') then (select count(*) from public.qb_merchandise_receipts) else 0 end,
    'inventory_lots',case when p_mode in ('stock','orders_stock') then (select count(*) from public.inventory_lots) else 0 end,
    'customers_preserved',(select count(*) from public.customer_accounts),
    'profiles_preserved',(select count(*) from public.profiles),
    'revision',md5(concat_ws('|',p_mode,
      (select string_agg(id::text||updated_at::text,',' order by id) from public.qb_receipts),
      case when p_mode in ('orders','orders_stock') then (select string_agg(id::text||updated_at::text,',' order by id) from public.qb_orders) end,
      case when p_mode in ('orders','orders_stock') then (select string_agg(id::text||updated_at::text,',' order by id) from public.orders) end,
      case when p_mode in ('orders','orders_stock') then (select string_agg(id::text,',' order by id) from public.qb_same_day_reconciliation_allocations) end,
      case when p_mode in ('stock','orders_stock') then (select string_agg(id::text||product_id::text||quantity::text||created_at::text,',' order by id) from public.inventory_movements) end,
      case when p_mode in ('stock','orders_stock') then (select string_agg(id::text||remaining_quantity::text||updated_at::text,',' order by id) from public.inventory_lots) end,
      case when p_mode in ('stock','orders_stock') then (select string_agg(id::text||stock_current::text,',' order by id) from public.products) end,
      case when p_mode in ('stock','orders_stock') then (select string_agg(id::text||updated_at::text,',' order by id) from public.qb_merchandise_receipts) end)));
end;
$$;

-- Narrow exception to the issued-line guard. The executor owns the flag
-- inside a single transaction and clears it before returning.
create or replace function private.protect_qb_issued_receipt_lines()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare
  v_receipt_id uuid;
  v_cleanup_run text := current_setting('qb.prepublication_cleanup_run_id',true);
begin
  v_receipt_id:=case when tg_op='DELETE' then old.receipt_id else new.receipt_id end;
  if tg_op='DELETE' and current_user in ('postgres','supabase_admin') then
    if current_setting('qb.owner_cleanup',true)='confirmed'
      and auth.uid() is not null and public.current_user_role() in ('admin','administrador') then return old; end if;
    if session_user in ('postgres','supabase_admin')
      and v_cleanup_run ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists(select 1 from private.qb_prepublication_cleanup_runs r where r.id=v_cleanup_run::uuid and r.status='completed')
      then return old; end if;
  end if;
  if exists(select 1 from public.qb_receipts where id=v_receipt_id and status<>'borrador') then
    raise exception 'Las líneas de un recibo emitido son inmutables.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.execute_qb_owner_cleanup(
  p_mode text,p_receipts uuid[],p_revision text,p_confirmation text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor uuid:=auth.uid();
  v_receipts uuid[];
  v_orders uuid[];
  v_delivery uuid[];
  v_movements uuid[];
  v_audit_ids uuid[];
  v_preview jsonb;
  v_result jsonb;
  v_deleted_movements integer:=0;
  v_deleted_merchandise integer:=0;
  v_deleted_lots integer:=0;
  v_zeroed_products integer:=0;
begin
  if v_actor is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'Acceso denegado.' using errcode='42501';
  end if;
  if p_confirmation is distinct from 'BORRAR DATOS' or p_mode is null or p_mode not in ('receipts','orders','stock','orders_stock') then
    raise exception 'Confirma el alcance con BORRAR DATOS.';
  end if;
  -- Serializes against creation and writes. On conflicting active operations
  -- PostgreSQL rolls the cleanup back, and the owner can obtain a new preview.
  lock table public.qb_orders, public.orders, public.qb_receipts, public.qb_receipt_orders,
    public.qb_receipt_lines in share row exclusive mode;
  if p_mode in ('orders','orders_stock','stock') then
    lock table public.qb_order_items, public.qb_order_preparations, public.qb_order_preparation_items,
      public.qb_order_delivery_items, public.qb_order_delivery_movements,
      public.qb_order_delivery_confirmations,public.qb_same_day_reconciliation_requests,
      public.qb_same_day_reconciliation_allocations, public.products, public.inventory_movements,
      public.inventory_lots,public.inventory_lot_consumptions, public.inventory_fifo_consumption_runs,
      public.inventory_lot_writeoffs, public.qb_merchandise_receipts, public.qb_merchandise_receipt_lines,
      public.qb_merchandise_receipt_movements, public.qb_merchandise_receipt_classification_results
      in share row exclusive mode;
  end if;
  if p_mode='stock' and (exists(select 1 from public.qb_orders) or exists(select 1 from public.orders)
    or exists(select 1 from public.qb_order_delivery_movements)) then
    raise exception 'Hay pedidos o entregas dependientes. Selecciona Pedidos y Stock.';
  end if;
  v_preview:=public.preview_qb_owner_cleanup(p_mode);
  if v_preview->>'revision' is distinct from p_revision then raise exception 'Los datos cambiaron. Actualiza la vista previa.'; end if;

  select coalesce(array_agg(id),'{}') into v_receipts from public.qb_receipts where p_mode in ('orders','orders_stock') or id=any(p_receipts);
  if p_mode='receipts' and (cardinality(v_receipts)=0 or cardinality(v_receipts) is distinct from cardinality(p_receipts)) then
    raise exception 'Selecciona los recibos de la vista previa.';
  end if;
  select coalesce(array_agg(id),'{}') into v_audit_ids from (
    select id from public.qb_receipts where id=any(v_receipts)
    union select id from public.qb_receipt_lines where receipt_id=any(v_receipts)
    union select id from public.qb_receipt_orders where receipt_id=any(v_receipts)
  ) selected;
  if p_mode='receipts' then
    update public.qb_orders o set status='entregado_pendiente_recibo'
    where o.status in ('recibo_emitido','incluido_en_recibo_borrador')
      and exists(select 1 from public.qb_receipt_orders ro where ro.order_id=o.id and ro.receipt_id=any(v_receipts)
        and ro.inclusion_status in ('borrador','emitido'))
      and not exists(select 1 from public.qb_receipt_orders ro where ro.order_id=o.id and not(ro.receipt_id=any(v_receipts))
        and ro.inclusion_status in ('borrador','emitido'));
  end if;
  perform set_config('qb.owner_cleanup','confirmed',true);
  delete from public.qb_receipt_lines where receipt_id=any(v_receipts);
  delete from public.qb_receipts where id=any(v_receipts);
  perform set_config('qb.owner_cleanup','',true);

  if p_mode in ('orders','orders_stock') then
    select coalesce(array_agg(id),'{}') into v_orders from public.qb_orders;
    select coalesce(array_agg(id),'{}') into v_delivery from public.qb_order_delivery_movements where order_id=any(v_orders);
    select coalesce(array_agg(id),'{}') into v_movements from (
      select inventory_movement_id id from public.qb_order_delivery_movements where id=any(v_delivery) and inventory_movement_id is not null
      union select inventory_movement_id from public.qb_same_day_reconciliation_allocations
        where request_id in (select id from public.qb_same_day_reconciliation_requests where order_id=any(v_orders))
    ) linked;
    if exists(select 1 from public.inventory_movements where id=any(v_movements)
      and (movement_type<>'salida' or abs(stock_before-stock_after-quantity)>0.001)) then
      raise exception 'Un movimiento vinculado no es una salida verificable. Limpieza cancelada.';
    end if;
    select v_audit_ids || coalesce(array_agg(id),'{}') into v_audit_ids from (
      select id from public.qb_orders union select id from public.orders
      union select id from public.qb_order_items union select id from public.order_items
      union select id from public.qb_order_preparations union select id from public.qb_order_preparation_items
      union select id from public.qb_order_delivery_items union select id from public.qb_order_delivery_movements
      union select id from public.qb_same_day_reconciliation_requests
      union select unnest(v_movements)
    ) operations;
    -- FIFO writeoffs detect independent pre-existing inventory gaps. Preserve
    -- them while restoring units actually consumed by the deleted deliveries.
    update public.inventory_lots lot set remaining_quantity=remaining_quantity+restored.qty
    from (select lot_id,sum(quantity_consumed) qty from public.inventory_lot_consumptions
      where inventory_movement_id=any(v_movements) group by lot_id) restored where lot.id=restored.lot_id;
    if exists(select 1 from public.inventory_lot_consumptions where delivery_movement_id=any(v_delivery)
      and not(inventory_movement_id=any(v_movements))) then
      raise exception 'Un consumo FIFO no coincide con los movimientos vinculados.';
    end if;
    delete from public.inventory_lot_consumptions where inventory_movement_id=any(v_movements);
    delete from public.inventory_fifo_consumption_runs where inventory_movement_id=any(v_movements);
    delete from public.qb_same_day_reconciliation_allocations where request_id in
      (select id from public.qb_same_day_reconciliation_requests where order_id=any(v_orders));
    delete from public.qb_same_day_reconciliation_events where request_id in
      (select id from public.qb_same_day_reconciliation_requests where order_id=any(v_orders));
    delete from public.qb_same_day_reconciliation_requests where order_id=any(v_orders);
    delete from public.qb_order_delivery_movements where id=any(v_delivery);
    -- Keep the quantity and provenance of independent movements, rebasing
    -- their running balances by the removed earlier debits.
    update public.inventory_movements kept
    set stock_before=kept.stock_before+delta.qty,stock_after=kept.stock_after+delta.qty
    from (select k.id,sum(removed.quantity) qty from public.inventory_movements k
      join public.inventory_movements removed on removed.product_id=k.product_id
        and (removed.created_at,removed.id)<(k.created_at,k.id)
      where removed.id=any(v_movements) and not(k.id=any(v_movements)) group by k.id) delta
    where kept.id=delta.id;
    update public.products p set stock_current=p.stock_current+delta.qty
    from (select product_id,sum(quantity) qty from public.inventory_movements where id=any(v_movements) group by product_id) delta
    where p.id=delta.product_id;
    delete from public.inventory_movements where id=any(v_movements);
    delete from private.qb_delivery_confirmation_requests where order_id=any(v_orders);
    delete from private.qb_internal_order_requests where order_ids && v_orders;
    delete from private.qb_guest_order_idempotency where order_id=any(v_orders);
    delete from private.qb_order_amount_snapshots where order_item_id in (select id from public.qb_order_items where order_id=any(v_orders));
    delete from public.qb_order_line_change_events where order_id=any(v_orders);
    delete from public.qb_order_delivery_items where order_id=any(v_orders);
    delete from public.qb_orders where id=any(v_orders);
    delete from public.orders;
  end if;
  if p_mode in ('stock','orders_stock') then
    select count(*) into v_deleted_movements from public.inventory_movements;
    select count(*) into v_deleted_merchandise from public.qb_merchandise_receipts;
    select count(*) into v_deleted_lots from public.inventory_lots;
    select count(*) into v_zeroed_products from public.products where coalesce(stock_current,0)<>0;
    if exists(select 1 from public.qb_order_delivery_movements where inventory_movement_id is not null)
      and p_mode='stock' then raise exception 'Hay movimientos de entrega dependientes. Selecciona Pedidos y Stock.'; end if;
    delete from public.inventory_lot_consumptions;
    delete from public.inventory_fifo_consumption_runs;
    delete from public.inventory_lot_writeoffs;
    delete from public.inventory_lots;
    delete from public.qb_merchandise_receipt_movements;
    delete from public.qb_merchandise_receipt_classification_results;
    delete from public.qb_merchandise_receipt_lines;
    delete from public.qb_merchandise_receipts;
    delete from public.inventory_movements;
    update public.products set stock_current=0, updated_at=now() where stock_current is distinct from 0;
  end if;
  delete from public.qb_conversion_snapshots where source_id=any(v_audit_ids)
    and source_table in ('qb_orders','qb_order_items','qb_order_preparations','qb_order_preparation_items',
      'qb_order_delivery_items','qb_order_delivery_movements','qb_receipts','qb_receipt_lines');
  delete from public.audit_logs where entity_id=any(v_audit_ids) and action<>'qb_owner_cleanup';
  v_result:=jsonb_build_object('mode',p_mode,'receipts',cardinality(v_receipts),
    'orders',v_preview->'orders','preparations',v_preview->'preparations','deliveries',v_preview->'deliveries',
    'inventory_movements',case when p_mode in ('stock','orders_stock') then v_deleted_movements else coalesce(cardinality(v_movements),0) end,
    'merchandise_receipts',v_deleted_merchandise,'inventory_lots',v_deleted_lots,
    'products_stock_zeroed',v_zeroed_products);
  insert into public.audit_logs(user_id,action,entity_type,metadata)
  values(v_actor,'qb_owner_cleanup','qb_test_operations',v_result);
  return v_result;
end;
$$;
revoke all on function public.preview_qb_owner_cleanup(text),
  public.execute_qb_owner_cleanup(text,uuid[],text,text) from public,anon,authenticated,service_role;
grant execute on function public.preview_qb_owner_cleanup(text),
  public.execute_qb_owner_cleanup(text,uuid[],text,text) to authenticated;
commit;
